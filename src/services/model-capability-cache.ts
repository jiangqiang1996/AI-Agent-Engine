import type { OpencodeClient } from '@opencode-ai/sdk'

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
 * 获取模型的完整媒体能力。
 * 未知模型返回全 true（保守策略，不阻断）。
 */
export async function getCapabilities(modelKey: string): Promise<ModelMediaCapability> {
  const cache = await getCapabilityCache()
  return cache.get(modelKey) ?? FULL_CAPABILITY
}

/**
 * 缓存 sessionID → modelKey 映射。
 * 由 chat.message hook 填充，供 command.execute.before 和 messages.transform 查询。
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
 * 从 sessionID 获取模型能力。
 * 先查 sessionID→modelKey 映射，再查能力缓存。
 * 缓存未命中时返回全 true（保守策略）。
 */
export async function getCapabilitiesBySession(sessionID: string): Promise<ModelMediaCapability> {
  const modelKey = _sessionModelMap.get(sessionID)
  if (!modelKey) return FULL_CAPABILITY
  return getCapabilities(modelKey)
}

/**
 * 重置所有内部状态（仅供测试使用）。
 */
export function resetCapabilityCacheForTesting(): void {
  _capabilityCache = null
  _cacheLoading = null
  _cacheTimestamp = 0
  _sessionModelMap.clear()
}
