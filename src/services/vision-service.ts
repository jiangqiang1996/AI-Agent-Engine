import { getGlobalClient } from './client-holder.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { MODEL_SCENARIO } from '../schemas/model-scenario-schema.js'
class VisionError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'VisionError'
  }
}

const VISION_PROMPT = '请识别这张图片的内容，用结构化的 Markdown 描述。包括：图片类型、主要视觉元素、文字内容（如有）、布局结构。直接输出 Markdown，不要包装在代码块中。'

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
 * 从图片 Buffer 生成 data URL。
 */
function buildImageDataUrl(buffer: Buffer, mime: string): string {
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
 * 从 session.prompt 返回的 parts 中提取纯文本。
 */
function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim()
}

export interface VisionRecognitionOptions {
  filePath: string
  imageBuffer: Buffer
  prompt?: string
  format?: string
}

export interface VisionRecognitionResult {
  /** 识别得到的 Markdown 文本；为空表示未获得有效内容 */
  markdown: string
  /** 实际使用的模型标识（未指定时为 undefined，表示继承默认） */
  modelUsed: string | undefined
}

/**
 * 调用配置的 vision 模型识别图片内容，返回 Markdown 描述。
 *
 * - 优先使用 modelScenarios.vision 配置的模型；
 * - 未配置 vision 时使用 opencode 当前默认模型；
 * - 通过创建临时会话、禁用所有工具、指定 system prompt 实现纯识别调用。
 */
export async function recognizeImageWithVision(
  options: VisionRecognitionOptions,
): Promise<VisionRecognitionResult> {
  const client = getGlobalClient()
  if (!client) {
    throw new VisionError(
      'image_vision_unavailable',
      '图片识别不可用：opencode 客户端未初始化，无法调用 vision 模型。',
    )
  }

  const routingContext = getModelScenarioRoutingContext() ?? undefined
  const visionModel = getModelByScenario(routingContext, MODEL_SCENARIO.VISION)
  const modelRef = parseModelReference(visionModel)

  const mime = inferImageMime(options.filePath, options.format)
  const imageUrl = buildImageDataUrl(options.imageBuffer, mime)

  let sessionId: string | undefined
  try {
    const createRes = await client.session.create({
      body: { title: 'vision-临时识别' },
    })
    if (createRes.error || !createRes.data?.id) {
      throw new VisionError(
        'image_vision_unavailable',
        `图片识别不可用：创建临时会话失败 - ${createRes.error?.data?.message ?? createRes.error?.name ?? '未知错误'}`,
      )
    }
    sessionId = createRes.data.id

    const promptBody: Record<string, unknown> = {
      parts: [
        { type: 'text', text: options.prompt ?? VISION_PROMPT },
        { type: 'file', mime, url: imageUrl },
      ],
      system: VISION_PROMPT,
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
        'image_vision_failed',
        `vision 模型识别失败 - ${promptRes.error.data?.message ?? promptRes.error.name ?? '未知错误'}`,
      )
    }

    const markdown = extractTextFromParts(promptRes.data?.parts ?? [])
    return { markdown, modelUsed: visionModel }
  } catch (error) {
    if (error instanceof VisionError) throw error
    throw new VisionError(
      'image_vision_failed',
      `vision 模型调用异常：${error instanceof Error ? error.message : String(error)}`,
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
