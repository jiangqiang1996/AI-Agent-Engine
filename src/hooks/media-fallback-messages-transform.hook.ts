import { fileURLToPath } from 'node:url'

import type { Hooks } from '@opencode-ai/plugin'
import type { Part } from '@opencode-ai/sdk'

import {
  extractModelKeyFromMessages,
  getCapabilityStatus,
  mimeToModality,
  setNeedsMediaHint,
  type CapabilityStatus,
} from '../services/model-capability-cache.js'
import { hasUnresolvedMedia } from '../services/media-degradation-service.js'

type ToolPart = Extract<Part, { type: 'tool' }>
type FilePart = Extract<Part, { type: 'file' }>
type CompletedToolState = Extract<ToolPart['state'], { status: 'completed' }>

/**
 * experimental.chat.messages.transform hook：工具结果媒体降级。
 *
 * 处理工具结果（ToolPart.state.attachments）中的媒体文件。
 * 从消息历史中提取当前模型（最后一条 user 消息的 model），
 * 按当前模型能力判断是否降级：
 * - 模型已知支持 → 保留媒体附件
 * - 模型已知不支持 → 从 attachments 移除媒体，路径追加到 output 文本（带工具引导）
 * - 模型能力未知 → 不降级，设置 needsMediaHint 标志
 *
 * 不同代理使用不同模型时，每次从最新 user 消息获取当前模型，保证准确性。
 * 异常时不阻断主流程，消息原样传递。
 */
export const messagesTransformHook: NonNullable<Hooks['experimental.chat.messages.transform']> = async (_input, output) => {
  try {
    if (output.messages.length === 0) return

    // 从消息历史提取当前模型 key（最后一条 user 消息的 model）
    const modelKey = extractModelKeyFromMessages(output.messages)
    if (!modelKey) return

    const status = await getCapabilityStatus(modelKey)

    for (const msg of output.messages) {
      for (const part of msg.parts) {
        if (part.type !== 'tool') continue
        const toolPart = part as ToolPart
        if (toolPart.state.status !== 'completed') continue

        const state = toolPart.state as CompletedToolState
        const attachments = state.attachments
        if (!attachments || attachments.length === 0) continue

        // 对工具结果 attachments 执行降级
        const remaining: FilePart[] = []
        const degradedFiles: Array<{ path: string; mime: string }> = []

        for (const attachment of attachments) {
          if (shouldDegradeAttachment(attachment, status)) {
            const extractedPath = extractAttachmentPath(attachment)
            if (extractedPath) {
              degradedFiles.push({ path: extractedPath, mime: attachment.mime })
            } else {
              remaining.push(attachment)
            }
          } else {
            remaining.push(attachment)
          }
        }

        if (degradedFiles.length > 0) {
          const stateMutable = state as { output: string; attachments?: FilePart[] }
          const hint = buildAttachmentHint(degradedFiles)
          stateMutable.output = `${stateMutable.output}\n\n${hint}`
          stateMutable.attachments = remaining.length > 0 ? remaining : undefined
        }

        // 检查是否有未解决的媒体（能力未知时）
        if (hasUnresolvedMedia(msg.parts, status)) {
          setNeedsMediaHint(true)
        }
      }
    }
  } catch {
    // 降级失败时不阻断消息转换
  }
}

/**
 * 判断工具结果 attachment 是否应降级。
 * attachment 没有 source 字段，需单独处理路径提取。
 */
function shouldDegradeAttachment(attachment: FilePart, status: CapabilityStatus): boolean {
  const mime = attachment.mime?.toLowerCase() ?? ''
  if (mime.startsWith('text/')) return false
  if (attachment.url?.startsWith('data:')) return false

  const modality = mimeToModality(mime)
  if (modality) {
    if (!status.known) return false
    return !status.caps[modality]
  }
  return true
}

function extractAttachmentPath(attachment: FilePart): string | undefined {
  const sourcePath = attachment.source?.path?.trim()
  if (sourcePath) return sourcePath

  if (attachment.url?.startsWith('file:')) {
    try {
      return fileURLToPath(attachment.url)
    } catch {
      // ignore
    }
  }

  return attachment.filename
}

function buildAttachmentHint(degradedFiles: Array<{ path: string; mime: string }>): string {
  const lines = degradedFiles.map((item) => {
    const tool = item.mime.startsWith('image/') ? 'ae-image'
      : item.mime.startsWith('audio/') ? 'ae-audio'
      : item.mime.startsWith('video/') ? 'ae-video'
      : ''
    if (tool) {
      return `- ${item.path}（${item.mime}）→ 调用 ${tool}（file 参数传入此路径）`
    }
    return `- ${item.path}（${item.mime}）`
  })

  return [
    '<media-degradation-hint>',
    '以下工具结果中的媒体文件已转为路径（当前模型不支持直接输入该类型）。如需识别内容，请调用对应工具：',
    ...lines,
    '</media-degradation-hint>',
  ].join('\n')
}
