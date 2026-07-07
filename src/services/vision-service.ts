import { getGlobalClient } from './client-holder.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { MODEL_SCENARIO, type ModelScenario } from '../schemas/model-scenario-schema.js'

class VisionError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'VisionError'
  }
}

const VISION_PROMPT = '请识别这张图片的内容，用结构化的 Markdown 描述。包括：图片类型、主要视觉元素、文字内容（如有）、布局结构。直接输出 Markdown，不要包装在代码块中。'

const AUDIO_PROMPT = '请识别这段音频的内容，用结构化的 Markdown 描述。包括：音频类型、主要语音内容（如有，逐字转写）、背景声音、音乐片段、情绪和语气。直接输出 Markdown，不要包装在代码块中。'

const VIDEO_PROMPT = '请识别这段视频的内容，用结构化的 Markdown 描述。包括：视频类型、场景变化时间线、主要画面内容、对话或旁白（如有，逐字转写）、背景音乐、字幕文字、动作和事件。直接输出 Markdown，不要包装在代码块中。'

/**
 * 解析 "provider/model" 格式的模型字符串为 { providerID, modelID }。
 * 不含 "/" 时返回 undefined，由调用方决定是否指定模型。
 */
function parseModelReference(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const slashIndex = model.indexOf('/')
  if (slashIndex <= 0) return undefined
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  }
}

/**
 * 从 Buffer 生成 data URL。
 */
function buildDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * 从图片文件路径推断 MIME 类型。
 */
function inferImageMime(filePath: string, format?: string): string {
  if (format) {
    const fmt = format.toLowerCase()
    if (fmt === 'png') return 'image/png'
    if (fmt === 'jpg' || fmt === 'jpeg') return 'image/jpeg'
    if (fmt === 'gif') return 'image/gif'
    if (fmt === 'webp') return 'image/webp'
    if (fmt === 'bmp') return 'image/bmp'
  }
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

/**
 * 从音频文件路径推断 MIME 类型。
 */
function inferAudioMime(filePath: string, format?: string): string {
  if (format) {
    const fmt = format.toLowerCase()
    if (fmt === 'mp3') return 'audio/mpeg'
    if (fmt === 'wav') return 'audio/wav'
    if (fmt === 'ogg') return 'audio/ogg'
    if (fmt === 'flac') return 'audio/flac'
    if (fmt === 'm4a') return 'audio/mp4'
    if (fmt === 'aac') return 'audio/aac'
  }
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.flac')) return 'audio/flac'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.aac')) return 'audio/aac'
  return 'audio/mpeg'
}

/**
 * 从视频文件路径推断 MIME 类型。
 *
 * 兼容性提示：MP4/WebM 为多数多模态模型原生支持；
 * MKV/FLV/AVI 等容器格式可能被部分模型拒绝，调用方应在错误信息中提示用户转码。
 */
function inferVideoMime(filePath: string, format?: string): string {
  if (format) {
    const fmt = format.toLowerCase()
    if (fmt === 'mp4') return 'video/mp4'
    if (fmt === 'webm') return 'video/webm'
    if (fmt === 'avi') return 'video/x-msvideo'
    if (fmt === 'mov') return 'video/quicktime'
    if (fmt === 'mkv') return 'video/x-matroska'
    if (fmt === 'flv') return 'video/x-flv'
  }
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.avi')) return 'video/x-msvideo'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.mkv')) return 'video/x-matroska'
  if (lower.endsWith('.flv')) return 'video/x-flv'
  return 'video/mp4'
}

/**
 * 从 session.prompt 返回的 parts 中提取纯文本。
 */
function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim()
}

export type MediaKind = 'image' | 'audio' | 'video'

export interface MediaRecognitionOptions {
  filePath: string
  mediaBuffer: Buffer
  prompt?: string
  format?: string
  kind: MediaKind
}

export interface MediaRecognitionResult {
  /** 识别得到的 Markdown 文本；为空表示未获得有效内容 */
  markdown: string
}

function getDefaultPrompt(kind: MediaKind): string {
  if (kind === 'audio') return AUDIO_PROMPT
  if (kind === 'video') return VIDEO_PROMPT
  return VISION_PROMPT
}

function getScenarioForKind(kind: MediaKind): ModelScenario {
  if (kind === 'audio') return MODEL_SCENARIO.AUDIO
  if (kind === 'video') return MODEL_SCENARIO.VIDEO
  return MODEL_SCENARIO.VISION
}

function inferMimeForKind(kind: MediaKind, filePath: string, format?: string): string {
  if (kind === 'audio') return inferAudioMime(filePath, format)
  if (kind === 'video') return inferVideoMime(filePath, format)
  return inferImageMime(filePath, format)
}

/**
 * 调用配置的多模态模型识别图片/音频/视频内容，返回 Markdown 描述。
 *
 * - 图片优先使用 modelScenarios.vision 配置的模型；
 * - 音频优先使用 modelScenarios.audio 配置的模型；
 * - 视频优先使用 modelScenarios.video 配置的模型；
 * - 未配置时使用 opencode 当前默认模型；
 * - 通过创建临时会话、禁用所有工具、指定 system prompt 实现纯识别调用。
 */
export async function recognizeMediaWithModel(
  options: MediaRecognitionOptions,
): Promise<MediaRecognitionResult> {
  const client = getGlobalClient()
  if (!client) {
    const label = options.kind === 'image' ? '图片' : options.kind === 'audio' ? '音频' : '视频'
    throw new VisionError(
      `${options.kind}_recognition_unavailable`,
      `${label}识别不可用：opencode 客户端未初始化，无法调用 ${options.kind} 模型。`,
    )
  }

  if (!options.mediaBuffer?.length) {
    const label = options.kind === 'image' ? '图片' : options.kind === 'audio' ? '音频' : '视频'
    throw new VisionError(
      `${options.kind}_recognition_unavailable`,
      `${label}识别不可用：媒体数据为空。`,
    )
  }

  const routingContext = getModelScenarioRoutingContext() ?? undefined
  const scenario = getScenarioForKind(options.kind)
  const modelSpec = getModelByScenario(routingContext, scenario)
  const modelRef = parseModelReference(modelSpec)

  const mime = inferMimeForKind(options.kind, options.filePath, options.format)
  const dataUrl = buildDataUrl(options.mediaBuffer, mime)

  let sessionId: string | undefined
  try {
    const createRes = await client.session.create({
      body: { title: `${options.kind}-临时识别` },
    })
    if (createRes.error || !createRes.data?.id) {
      throw new VisionError(
        `${options.kind}_recognition_unavailable`,
        `${options.kind} 识别不可用：创建临时会话失败 - ${createRes.error?.data?.message ?? createRes.error?.name ?? '未知错误'}`,
      )
    }
    sessionId = createRes.data.id

    const defaultPrompt = getDefaultPrompt(options.kind)
    const promptBody: Record<string, unknown> = {
      parts: [
        { type: 'text', text: options.prompt?.trim() || defaultPrompt },
        { type: 'file', mime, url: dataUrl },
      ],
      system: defaultPrompt,
      tools: {},
    }
    if (modelRef) {
      promptBody.model = modelRef
    }

    const promptRes = await client.session.prompt({
      path: { id: sessionId },
      body: promptBody as Parameters<typeof client.session.prompt>[0]['body'],
    })

    if (promptRes.error) {
      throw new VisionError(
        `${options.kind}_recognition_failed`,
        `${options.kind} 模型识别失败 - ${promptRes.error.data?.message ?? promptRes.error.name ?? '未知错误'}`,
      )
    }

    const markdown = extractTextFromParts(promptRes.data?.parts ?? [])
    return { markdown }
  } catch (error) {
    if (error instanceof VisionError) throw error
    throw new VisionError(
      `${options.kind}_recognition_failed`,
      `${options.kind} 模型调用异常：${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    if (sessionId) {
      try {
        await client.session.delete({ path: { id: sessionId } })
      } catch {
        // 临时会话清理失败不影响主流程
      }
    }
  }
}
