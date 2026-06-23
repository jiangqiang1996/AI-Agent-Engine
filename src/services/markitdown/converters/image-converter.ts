import { imageSize } from 'image-size'
import { MarkitdownError } from '../../markitdown-errors.js'
import { recognizeImageWithVision } from '../../markitdown-vision-service.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

/**
 * 使用 image-size 提取图片尺寸。
 * 返回 "WxH" 字符串或 null。
 */
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

export class ImageConverter implements DocumentConverter {
  format = 'jpg' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'jpg'
  }

  /**
   * 静态工具方法：直接传入图片 Buffer 和文件路径即可转换为 Markdown。
   *
   * 使用 image-size 提取尺寸元数据，调用配置的 vision 模型识别图片内容，
   * 返回包含尺寸、模型信息和识别结果的 Markdown。
   */
  static async convertImage(buffer: Buffer, filePath: string): Promise<ConverterResult> {
    try {
      const visionResult = await recognizeImageWithVision({
        filePath,
        imageBuffer: buffer,
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
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'image_convert_failed',
        `图片转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return ImageConverter.convertImage(input.binaryContent, input.filePath)
  }
}
