import { imageSize } from 'image-size'
import { recognizeImageWithVision } from './vision-service.js'
import type { MarkdownConversionResult } from './markdown-conversion-types.js'

function extractImageSize(buffer: Buffer): string | null {
  try {
    const result = imageSize(buffer)
    if (result.width && result.height) {
      return `${result.width}x${result.height}`
    }
    return null
  } catch {
    return null
  }
}

export async function convertImageToMarkdown(
  buffer: Buffer,
  filePath: string,
  prompt?: string,
  format?: string,
): Promise<MarkdownConversionResult> {
  const visionResult = await recognizeImageWithVision({
    filePath,
    imageBuffer: buffer,
    prompt,
    format,
  })

  const sizeStr = extractImageSize(buffer)
  const parts: string[] = []

  if (sizeStr) {
    parts.push(`> ImageSize: ${sizeStr}`)
    parts.push('')
  }

  if (visionResult.modelUsed) {
    parts.push(`> VisionModel: ${visionResult.modelUsed}`)
    parts.push('')
  }

  if (visionResult.markdown) {
    parts.push(visionResult.markdown)
  } else {
    parts.push('（vision 模型未返回有效识别内容）')
  }

  return { markdown: parts.join('\n').trim() }
}
