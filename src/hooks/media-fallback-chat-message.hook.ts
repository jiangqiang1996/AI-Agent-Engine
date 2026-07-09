import type { Hooks } from '@opencode-ai/plugin'

import {
  cacheSessionCapabilities,
  cacheSessionModel,
  extractCapsFromModel,
  getCapabilityBySession,
} from '../services/model-capability-cache.js'
import { degradeMediaFileParts } from '../services/media-degradation-service.js'

/**
 * chat.message hook：用户消息媒体降级。
 *
 * 优先从 input.model.capabilities.input 直接读取模型能力（确定性路径），
 * 无需 provider.list() 网络查询。
 *
 * 降级逻辑：
 * - 模型支持 → 保留 FilePart
 * - 模型不支持 → 降级为路径文本（带 ae-image/ae-audio/ae-video 工具调用引导）
 *
 * 能力查不到时（不在 models.dev 库、provider.list 失败）默认不支持，
 * 保守降级，避免 FilePart 透传到 opencode unsupportedParts 导致路径丢失。
 *
 * 同时缓存 sessionID → capabilities 映射，供 command.execute.before 和
 * messages.transform hook 直接读取，避免重复查询。
 * 异常时不阻断主流程，消息原样传递。
 */
export const chatMessageHook: NonNullable<Hooks['chat.message']> = async (input, output) => {
  try {
    // 优先：直接从 opencode Model.capabilities.input 提取（确定性）
    const directCaps = extractCapsFromModel(input.model)

    if (directCaps) {
      cacheSessionCapabilities(input.sessionID, directCaps)
    }

    // 兜底：缓存 sessionID → modelKey 映射（供 provider.list 查询路径使用）
    const providerID = input.model?.providerID
    const modelID = input.model?.modelID
    if (providerID && modelID) {
      cacheSessionModel(input.sessionID, providerID, modelID)
    }

    const caps = await getCapabilityBySession(input.sessionID)
    degradeMediaFileParts(output.parts, caps)
  } catch {
    // 降级失败时不阻断消息发送
  }
}
