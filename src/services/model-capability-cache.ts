import type { Message, Part } from '@opencode-ai/sdk'

import { getGlobalClient } from './client-holder.js'

/**
 * 模型媒体输入能力。
 * 对应 opencode Model.capabilities.input 字段或 provider.list() 返回的 modalities.input。
 */
export interface ModelMediaCapability {
  image: boolean
  audio: boolean
  video: boolean
  pdf: boolean
}

type MediaModality = keyof ModelMediaCapability

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

/**
 * 默认能力：所有媒体类型均不支持。
 * 当模型能力查不到时（不在 models.dev 库、缓存未命中、provider.list 失败），
 * 保守地认为不支持，触发降级，避免 FilePart 透传到 opencode unsupportedParts
 * 导致路径信息丢失为仅 filename。
 */
const NO_CAPABILITY: ModelMediaCapability = {
  image: false,
  audio: false,
  video: false,
  pdf: false,
}

/**
 * 直接从 opencode Model 对象提取媒体输入能力。
 *
 * opencode 在启动时已将 models.dev 数据源的 modalities.input 数组解析为
 * model.capabilities.input 布尔字段（见 opencode provider.ts:1430-1450）。
 *
 * 插件 SDK 的 chat.message hook 类型声明 input.model 为
 * `{ providerID: string; modelID: string }`（窄类型），
 * 但运行时 opencode 传入的是完整 Model 对象（含 capabilities）。
 * 因此参数类型为 unknown，通过防御性访问提取能力数据。
 *
 * 返回 undefined 表示 Model 对象未声明 capabilities（极旧版 opencode 或自定义模型），
 * 调用方应回退到 provider.list() 查询。
 */
export function extractCapsFromModel(model: unknown): ModelMediaCapability | undefined {
  if (!model || typeof model !== 'object') return undefined
  const caps = (model as Record<string, unknown>).capabilities
  if (!caps || typeof caps !== 'object') return undefined
  const input = (caps as Record<string, unknown>).input
  if (!input || typeof input !== 'object') return undefined
  const inp = input as Record<string, unknown>
  return {
    image: typeof inp.image === 'boolean' ? inp.image : false,
    audio: typeof inp.audio === 'boolean' ? inp.audio : false,
    video: typeof inp.video === 'boolean' ? inp.video : false,
    pdf: typeof inp.pdf === 'boolean' ? inp.pdf : false,
  }
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
 * sessionID → 能力的直接缓存。
 *
 * 由 chat.message hook 在收到 input.model 时填充，
 * command.execute.before 和 messages.transform 可直接读取，
 * 无需再通过 provider.list() 网络查询。
 *
 * 能力查不到时回退到 _sessionModelMap + provider.list() 路径；
 * 均失败时返回 NO_CAPABILITY（保守降级）。
 */
const _sessionCapsMap = new Map<string, ModelMediaCapability>()

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
 * 查询指定模型的能力。
 * - 缓存命中 → 真实能力
 * - 缓存未命中 → NO_CAPABILITY（保守降级，不支持任何媒体）
 */
export async function getCapability(modelKey: string): Promise<ModelMediaCapability> {
  const cache = await getCapabilityCache()
  const caps = cache.get(modelKey)
  if (caps) return caps
  return NO_CAPABILITY
}

/**
 * 缓存 sessionID → modelKey 映射。
 * 由 chat.message hook 填充，供兜底路径（provider.list 查询）使用。
 * 使用 LRU 淘汰策略防止内存泄漏。
 */
export function cacheSessionModel(sessionID: string, providerID: string, modelID: string): void {
  if (_sessionModelMap.size >= SESSION_MAP_MAX && !_sessionModelMap.has(sessionID)) {
    const oldest = _sessionModelMap.keys().next().value
    if (oldest) {
      _sessionModelMap.delete(oldest)
      _sessionCapsMap.delete(oldest)
    }
  }
  _sessionModelMap.set(sessionID, makeModelKey(providerID, modelID))
}

/**
 * 缓存 sessionID → 媒体能力直接映射。
 *
 * 优先于 _sessionModelMap 使用。能力数据来自 opencode Model.capabilities.input，
 * 由 chat.message hook 在收到 input.model 时提取并缓存。
 * 使用与 _sessionModelMap 相同的 LRU 淘汰策略。
 */
export function cacheSessionCapabilities(sessionID: string, caps: ModelMediaCapability): void {
  if (_sessionCapsMap.size >= SESSION_MAP_MAX && !_sessionCapsMap.has(sessionID)) {
    const oldest = _sessionCapsMap.keys().next().value
    if (oldest) _sessionCapsMap.delete(oldest)
    // 同步淘汰 _sessionModelMap 保持一致
    if (oldest) _sessionModelMap.delete(oldest)
  }
  _sessionCapsMap.set(sessionID, caps)
}

/**
 * 从 sessionID 获取模型能力。
 *
 * 优先从 _sessionCapsMap 读取（来自 input.model.capabilities，确定性）；
 * 缺失时回退到 _sessionModelMap + provider.list() 网络查询（兜底路径）；
 * 均失败时返回 NO_CAPABILITY（保守降级）。
 */
export async function getCapabilityBySession(sessionID: string): Promise<ModelMediaCapability> {
  // 优先：直接能力缓存（来自 opencode Model 对象）
  const directCaps = _sessionCapsMap.get(sessionID)
  if (directCaps) return directCaps

  // 兜底：sessionID → modelKey → provider.list 查询
  const modelKey = _sessionModelMap.get(sessionID)
  if (!modelKey) return NO_CAPABILITY
  return getCapability(modelKey)
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
  _sessionCapsMap.clear()
}
