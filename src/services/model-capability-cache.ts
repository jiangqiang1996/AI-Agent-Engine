import type { Message, Part } from '@opencode-ai/sdk'

import { getGlobalClient } from './client-holder.js'

/**
 * 模型媒体输入能力。
 * 对应 provider.list() 返回的 modalities.input 字段。
 */
export interface ModelMediaCapability {
  image: boolean
  audio: boolean
  video: boolean
  pdf: boolean
}

type MediaModality = keyof ModelMediaCapability

/**
 * 能力查询结果。
 * - known=true 时 caps 是从 provider.list() 获取的真实能力。
 * - known=false 时能力未知（缓存未加载/加载失败/模型不在列表中），
 *   caps 返回全 true（不降级），由调用方决定是否设置 needsMediaHint。
 */
export interface CapabilityStatus {
  known: boolean
  caps: ModelMediaCapability
}

/**
 * 从 MIME 类型推断媒体 modality。
 * 返回 undefined 表示该 MIME 无对应 modality（如 DOCX/XLSX/ZIP），
 * 这类文件始终需要转换为路径。
 */
export function mimeToModality(mime: string): MediaModality | undefined {
  const lower = mime.toLowerCase()
  if (lower.startsWith('image/')) return 'image'
  if (lower.startsWith('audio/')) return 'audio'
  if (lower.startsWith('video/')) return 'video'
  if (lower === 'application/pdf') return 'pdf'
  return undefined
}

const FULL_CAPABILITY: ModelMediaCapability = {
  image: true,
  audio: true,
  video: true,
  pdf: true,
}

function makeModelKey(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`
}

let _capabilityCache: Map<string, ModelMediaCapability> | null = null
let _cacheLoading: Promise<Map<string, ModelMediaCapability>> | null = null
let _cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

const SESSION_MAP_MAX = 1000
const _sessionModelMap = new Map<string, string>()

/**
 * needsMediaHint 标志：当模型能力未知时设置，
 * 由 system.transform hook 读取并注入系统提示，
 * 引导 LLM 在遇到媒体读取错误时调用 ae-image/ae-audio/ae-video 工具。
 */
let _needsMediaHint = false

export function setNeedsMediaHint(value: boolean): void {
  _needsMediaHint = value
}

export function getAndClearNeedsMediaHint(): boolean {
  const value = _needsMediaHint
  _needsMediaHint = false
  return value
}

/**
 * 从 client.provider.list() 加载所有模型的能力数据。
 * 返回的模型数据中 modalities.input 是字符串数组（如 ["text", "image"]），
 * 来自 models.dev 数据源。
 *
 * 加载失败时返回 null（不更新缓存），允许下次调用重试。
 */
async function loadCapabilitiesFromProviders(): Promise<Map<string, ModelMediaCapability> | null> {
  const client = getGlobalClient()
  if (!client) return null

  try {
    const result = await Promise.race([
      client.provider.list(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('provider.list timeout')), 5000),
      ),
    ])
    const providers = result.data?.all ?? []
    const cache = new Map<string, ModelMediaCapability>()

    for (const provider of providers) {
      const providerID = provider.id
      const models = provider.models
      if (!models) continue

      for (const [modelID, model] of Object.entries(models)) {
        const key = makeModelKey(providerID, modelID)
        const inputModalities = model.modalities?.input ?? []
        cache.set(key, {
          image: inputModalities.includes('image'),
          audio: inputModalities.includes('audio'),
          video: inputModalities.includes('video'),
          pdf: inputModalities.includes('pdf'),
        })
      }
    }

    return cache
  } catch {
    return null
  }
}

/**
 * 获取能力缓存，带 TTL 刷新。
 * 加载失败时保留旧缓存（如果有），不更新时间戳，允许下次调用重试。
 */
async function getCapabilityCache(): Promise<Map<string, ModelMediaCapability>> {
  const now = Date.now()
  if (_capabilityCache && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _capabilityCache
  }

  if (_cacheLoading) {
    return _cacheLoading
  }

  _cacheLoading = (async () => {
    try {
      const cache = await loadCapabilitiesFromProviders()
      if (cache) {
        _capabilityCache = cache
        _cacheTimestamp = Date.now()
      }
      return _capabilityCache ?? new Map()
    } finally {
      _cacheLoading = null
    }
  })()

  return _cacheLoading
}

/**
 * 查询指定模型的能力状态。
 * - 缓存命中 → { known: true, caps: 真实能力 }
 * - 缓存未命中 → { known: false, caps: FULL_CAPABILITY }（不降级，但调用方应设置 needsMediaHint）
 */
export async function getCapabilityStatus(modelKey: string): Promise<CapabilityStatus> {
  const cache = await getCapabilityCache()
  const caps = cache.get(modelKey)
  if (caps) return { known: true, caps }
  return { known: false, caps: FULL_CAPABILITY }
}

/**
 * 缓存 sessionID → modelKey 映射。
 * 由 chat.message hook 填充，供 command.execute.before 查询。
 * 使用 LRU 淘汰策略防止内存泄漏。
 */
export function cacheSessionModel(sessionID: string, providerID: string, modelID: string): void {
  if (_sessionModelMap.size >= SESSION_MAP_MAX && !_sessionModelMap.has(sessionID)) {
    const oldest = _sessionModelMap.keys().next().value
    if (oldest) _sessionModelMap.delete(oldest)
  }
  _sessionModelMap.set(sessionID, makeModelKey(providerID, modelID))
}

/**
 * 从 sessionID 获取模型能力（用于 command.execute.before）。
 * 返回 CapabilityStatus，调用方按 known 字段决定后续行为。
 */
export async function getCapabilityStatusBySession(sessionID: string): Promise<CapabilityStatus> {
  const modelKey = _sessionModelMap.get(sessionID)
  if (!modelKey) return { known: false, caps: FULL_CAPABILITY }
  return getCapabilityStatus(modelKey)
}

/**
 * 消息历史项类型（与 experimental.chat.messages.transform hook 的 output 一致）。
 */
interface MessageHistoryItem {
  info: Message
  parts: Part[]
}

/**
 * 从消息历史中提取当前模型 key。
 * 取最后一条 user 消息的 model 字段（与 opencode prompt loop 中 getModel 逻辑一致）。
 * 不同代理使用不同模型时，每次都从最新 user 消息获取，保证准确性。
 */
export function extractModelKeyFromMessages(messages: MessageHistoryItem[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const info = messages[i]?.info
    if (info?.role === 'user' && info.model) {
      return makeModelKey(info.model.providerID, info.model.modelID)
    }
  }
  return undefined
}

/**
 * 重置所有内部状态（仅供测试使用）。
 */
export function resetCapabilityCacheForTesting(): void {
  _capabilityCache = null
  _cacheLoading = null
  _cacheTimestamp = 0
  _sessionModelMap.clear()
  _needsMediaHint = false
}
