import type { Hooks } from '@opencode-ai/plugin'

import { cacheSessionModel, getCapabilitiesBySession } from '../services/model-capability-cache.js'
import { convertUnsupportedFilePartsToPath } from '../services/command-file-argument-path-service.js'

/**
 * chat.message hook：用户消息媒体降级。
 *
 * 当用户直接附带媒体文件（@image.png、拖拽等）时，在消息保存到 DB 前
 * 检查当前模型是否支持该媒体类型。不支持时把 FilePart 转换为路径文本，
 * LLM 看到路径后按需调用 ae:image/ae:audio/ae:video 工具识别内容。
 *
 * 同时缓存 sessionID → model 映射，供 command.execute.before 和
 * experimental.chat.messages.transform 使用。
 *
 * 异常时不阻断主流程，消息原样传递。
 */
export const chatMessageHook: NonNullable<Hooks['chat.message']> = async (input, output) => {
  try {
    const providerID = input.model?.providerID
    const modelID = input.model?.modelID

    if (providerID && modelID) {
      cacheSessionModel(input.sessionID, providerID, modelID)
    }

    const caps = await getCapabilitiesBySession(input.sessionID)
    convertUnsupportedFilePartsToPath(output.parts, caps)
  } catch {
    // 降级失败时不阻断消息发送
  }
}
