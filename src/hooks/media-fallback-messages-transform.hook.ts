import type { Hooks } from '@opencode-ai/plugin'
import type { Part } from '@opencode-ai/sdk'

import { getCapabilitiesBySession } from '../services/model-capability-cache.js'
import { shouldConvertForModel, extractFilePath } from '../services/command-file-argument-path-service.js'

type ToolPart = Extract<Part, { type: 'tool' }>
type FilePart = Extract<Part, { type: 'file' }>
type CompletedToolState = Extract<ToolPart['state'], { status: 'completed' }>

/**
 * experimental.chat.messages.transform hook：工具结果媒体降级。
 *
 * 处理工具结果（ToolPart.state.attachments）中的媒体文件。
 * 当模型不支持该媒体类型时，从 attachments 中移除媒体 FilePart，
 * 把文件路径追加到 state.output 文本末尾。
 *
 * 通过 sessionID 从缓存获取模型能力（chat.message hook 先触发填充缓存）。
 * 异常时不阻断主流程，消息原样传递。
 */
export const messagesTransformHook: NonNullable<Hooks['experimental.chat.messages.transform']> = async (_input, output) => {
  try {
    if (output.messages.length === 0) return

    const sessionID = output.messages[0].info.sessionID
    if (!sessionID) return

    const caps = await getCapabilitiesBySession(sessionID)

    for (const msg of output.messages) {
      for (const part of msg.parts) {
        if (part.type !== 'tool') continue
        const toolPart = part as ToolPart
        if (toolPart.state.status !== 'completed') continue

        const state = toolPart.state as CompletedToolState
        const attachments = state.attachments
        if (!attachments || attachments.length === 0) continue

        const remaining: FilePart[] = []
        const extractedPaths: string[] = []

        for (const attachment of attachments) {
          if (shouldConvertForModel(attachment, caps)) {
            const path = extractFilePath(attachment) ?? extractPathFromInput(attachment, state.input)
            if (path) {
              extractedPaths.push(path)
            } else {
              remaining.push(attachment)
            }
          } else {
            remaining.push(attachment)
          }
        }

        if (extractedPaths.length > 0) {
          const stateMutable = state as { output: string; attachments?: FilePart[] }
          const pathText = extractedPaths.map((p) => `文件路径：${p}`).join('\n')
          stateMutable.output = `${stateMutable.output}\n\n[${extractedPaths.length}个媒体文件已降级为路径]\n${pathText}`
          stateMutable.attachments = remaining.length > 0 ? remaining : undefined
        }
      }
    }
  } catch {
    // 降级失败时不阻断消息转换
  }
}

/**
 * 从工具输入参数中提取文件路径。
 * 用于 attachment 缺少 source.path 和 url 时的回退。
 */
function extractPathFromInput(_attachment: FilePart, input: Record<string, unknown>): string | undefined {
  const inputPath = input.filePath ?? input.file ?? input.path
  if (typeof inputPath === 'string') return inputPath
  return undefined
}
