import { getGlobalClient } from './client-holder.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { MODEL_SCENARIO, type ModelScenario } from '../schemas/model-scenario-schema.js'
import { runSubtaskSession, parseModelReference, SubtaskSessionError } from './subtask-session-service.js'

import type { MediaContent, MediaKind } from './media-content-service.js'
import { buildDataUrl } from './media-content-service.js'

class VisionError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'VisionError'
  }
}

const VISION_PROMPT = '请识别这张图片的内容，用结构化的 Markdown 描述。包括：图片类型、主要视觉元素、文字内容（如有）、布局结构。直接输出 Markdown，不要包装在代码块中。'

const AUDIO_PROMPT = '请识别这段音频的内容，用结构化的 Markdown 描述。包括：音频类型、主要语音内容（如有，逐字转写）、背景声音、音乐片段、情绪和语气。直接输出 Markdown，不要包装在代码块中。'

const VIDEO_PROMPT = '请识别这段视频的内容，用结构化的 Markdown 描述。包括：视频类型、场景变化时间线、主要画面内容、对话或旁白（如有，逐字转写）、背景音乐、字幕文字、动作和事件。直接输出 Markdown，不要包装在代码块中。'

export type { MediaKind } from './media-content-service.js'

export interface MediaRecognitionOptions {
  /** 通过 readMediaContent 读取的媒体内容 */
  media: MediaContent
  /** 识别提示词；指定时覆盖默认提示 */
  prompt?: string
  /** 媒体类型 */
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

/**
 * 调用配置的多模态模型识别图片/音频/视频内容，返回 Markdown 描述。
 *
 * 通过 subtask-session-service 创建临时子任务会话，
 * 指定多模态模型、禁用文件修改工具、发送媒体文件附件实现纯识别调用。
 */
export async function recognizeMediaWithModel(
  options: MediaRecognitionOptions,
): Promise<MediaRecognitionResult> {
  if (!getGlobalClient()) {
    const label = options.kind === 'image' ? '图片' : options.kind === 'audio' ? '音频' : '视频'
    throw new VisionError(
      `${options.kind}_recognition_unavailable`,
      `${label}识别不可用：opencode 客户端未初始化，无法调用 ${options.kind} 模型。`,
    )
  }

  if (!options.media.content) {
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

  const { mime } = options.media
  const dataUrl = buildDataUrl(options.media)
  const defaultPrompt = getDefaultPrompt(options.kind)
  const userPrompt = options.prompt?.trim() || defaultPrompt

  try {
    const result = await runSubtaskSession({
      title: `${options.kind}-临时识别`,
      prompt: userPrompt,
      system: defaultPrompt,
      model: modelRef,
      filePart: { mime, url: dataUrl },
    })

    return { markdown: result.text }
  } catch (error: unknown) {
    if (error instanceof SubtaskSessionError) {
      throw new VisionError(
        `${options.kind}_recognition_${error.code}`,
        `${options.kind} 模型识别失败 [${error.code}] - ${error.message}`,
      )
    }
    throw new VisionError(
      `${options.kind}_recognition_failed`,
      `${options.kind} 模型调用异常：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
