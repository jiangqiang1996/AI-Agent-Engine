import type { Hooks } from '@opencode-ai/plugin'
import type { Part } from '@opencode-ai/sdk'

import {
  cacheSessionModel,
  getCapabilityStatusBySession,
  setNeedsMediaHint,
} from '../services/model-capability-cache.js'
import {
  degradeMediaFileParts,
  hasUnresolvedMedia,
} from '../services/media-degradation-service.js'

/**
 * chat.message hook：用户消息媒体降级。
 *
 * 当用户直接附带媒体文件（@image.png、拖拽等）时，在消息保存到 DB 前
 * 检查当前模型是否支持该媒体类型：
 * - 模型已知支持 → 保留 FilePart
 * - 模型已知不支持 → 降级为路径文本（带 ae-image/ae-audio/ae-video 工具调用引导）
 * - 模型能力未知 → 不降级，设置 needsMediaHint 标志，
 *   由 system.transform hook 注入提示，引导 LLM 遇到 ERROR 时调用对应工具
 *
 * 同时缓存 sessionID → model 映射，供 command.execute.before 使用。
 * 异常时不阻断主流程，消息原样传递。
 */
export const chatMessageHook: NonNullable<Hooks['chat.message']> = async (input, output) => {
  try {
    const providerID = input.model?.providerID
    const modelID = input.model?.modelID

    if (providerID && modelID) {
      cacheSessionModel(input.sessionID, providerID, modelID)
    }

    const status = await getCapabilityStatusBySession(input.sessionID)
    degradeMediaFileParts(output.parts, status)

    if (hasUnresolvedMedia(output.parts, status)) {
      setNeedsMediaHint(true)
    }
  } catch {
    // 降级失败时不阻断消息发送
  }
}
