import { imageSize } from 'image-size'
import exifr from 'exifr'
import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

/**
 * 使用 exifr 从 JPEG 缓冲区提取 EXIF 元数据。
 * 返回与旧手写解析器相同字段名的 metadata 对象。
 */
async function extractJpegExif(buffer: Buffer): Promise<Record<string, string>> {
  const metadata: Record<string, string> = {}

  // 尝试提取完整 EXIF（tiff + jfif），exifr 对无 EXIF 的 JPEG 返回 undefined
  let exif: Record<string, unknown> | null = null
  try {
    exif = await exifr.parse(buffer, { tiff: true, jfif: true, xmp: true })
  } catch {
    // exifr 对非 EXIF 数据抛出异常，降级为空 metadata
    return metadata
  }

  if (!exif) return metadata

  // 映射 exifr 标签名到旧字段名
  const fieldMap: Array<[string, string]> = [
    ['ImageDescription', 'Description'],
    ['Artist', 'Artist'],
    ['XPTitle', 'Title'],
    ['XPKeywords', 'Keywords'],
    ['XPAuthor', 'Author'],
    ['DateTimeOriginal', 'DateTimeOriginal'],
    ['CreateDate', 'CreateDate'],
  ]

  for (const [exifKey, fieldKey] of fieldMap) {
    const value = exif[exifKey]
    if (typeof value === 'string' && value.length > 0) {
      metadata[fieldKey] = value
    } else if (value instanceof Date) {
      metadata[fieldKey] = value.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, '')
    }
  }

  // 旧逻辑：如果 DateTimeOriginal 存在但 CreateDate 缺失，用 DateTimeOriginal 补 CreateDate
  if (metadata.DateTimeOriginal && !metadata.CreateDate) {
    metadata.CreateDate = metadata.DateTimeOriginal
  }
  // 旧逻辑：如果 DateTime（0x0132）存在，也映射到 CreateDate
  if (!metadata.CreateDate && typeof exif['DateTime'] === 'string') {
    metadata.CreateDate = exif['DateTime']
  }

  // GPS 位置：exifr.gps() 返回 { latitude, longitude } 或 null
  try {
    const gps = await exifr.gps(buffer)
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      metadata.GPSPosition = `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`
    }
  } catch {
    // GPS 解析失败时静默跳过
  }

  return metadata
}

/**
 * 从 PNG 缓冲区提取 tEXt/zTXt/iTXt 文本块元数据。
 * PNG 文本块是简单的二进制结构，无需引入完整 PNG 解码库。
 */
function extractPngTextChunks(buffer: Buffer): Record<string, string> {
  const metadata: Record<string, string> = {}

  if (buffer.length < 8) return metadata
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return metadata
  }

  let pos = 8
  while (pos < buffer.length - 8) {
    const length = buffer.readUInt32BE(pos)
    const chunkType = buffer.toString('ascii', pos + 4, pos + 8)
    const dataStart = pos + 8

    if (chunkType === 'tEXt' || chunkType === 'zTXt') {
      const nullIdx = buffer.indexOf(0, dataStart)
      if (nullIdx > -1) {
        const keyword = buffer.toString('latin1', dataStart, nullIdx)
        let textData: Buffer
        if (chunkType === 'tEXt') {
          textData = buffer.slice(nullIdx + 1, dataStart + length)
        } else {
          textData = buffer.slice(nullIdx + 2, dataStart + length)
        }
        const text = textData.toString('latin1')
        mapPngTextToMetadata(keyword, text, metadata)
      }
    } else if (chunkType === 'iTXt') {
      const nullIdx = buffer.indexOf(0, dataStart)
      if (nullIdx > -1) {
        const keyword = buffer.toString('utf8', dataStart, nullIdx)
        const compFlag = buffer[nullIdx + 1]
        let langEnd = buffer.indexOf(0, nullIdx + 3)
        if (langEnd === -1) langEnd = nullIdx + 3
        let transEnd = buffer.indexOf(0, langEnd + 1)
        if (transEnd === -1) transEnd = langEnd + 1
        const textData = buffer.slice(transEnd + 1, dataStart + length)
        if (compFlag === 0) {
          const text = textData.toString('utf8')
          mapPngTextToMetadata(keyword, text, metadata)
        }
      }
    }

    pos = dataStart + length + 4
  }

  return metadata
}

function mapPngTextToMetadata(
  keyword: string,
  text: string,
  metadata: Record<string, string>,
): void {
  const keyMap: Record<string, string> = {
    Title: 'Title',
    Description: 'Description',
    Author: 'Author',
    Caption: 'Caption',
    Keywords: 'Keywords',
    Artist: 'Artist',
    'Create Date': 'CreateDate',
    DateTimeOriginal: 'DateTimeOriginal',
  }
  const mappedKey = keyMap[keyword]
  if (mappedKey && !metadata[mappedKey]) {
    metadata[mappedKey] = text
  }
}

/**
 * 使用 image-size 提取图片尺寸（JPEG SOF / PNG IHDR / GIF 等）。
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
    // image-size 对损坏/截断图片抛出异常，降级为 null
    return null
  }
}

export class ImageConverter implements DocumentConverter {
  format = 'jpg' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'jpg'
  }

  static async convertImage(buffer: Buffer, filePath: string): Promise<ConverterResult> {
    const metadata: Record<string, string> = {}

    // 尺寸提取（JPEG + PNG + 其他 image-size 支持的格式）
    const imageSizeStr = extractImageSize(buffer)
    if (imageSizeStr) {
      metadata.ImageSize = imageSizeStr
    }

    // EXIF / PNG text 元数据
    const ext = filePath.toLowerCase()
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) {
      const exifMeta = await extractJpegExif(buffer)
      Object.assign(metadata, exifMeta)
    } else if (ext.endsWith('.png')) {
      const pngMeta = extractPngTextChunks(buffer)
      Object.assign(metadata, pngMeta)
    }

    // 按固定字段顺序输出
    let mdContent = ''
    const fieldOrder = [
      'ImageSize',
      'Title',
      'Caption',
      'Description',
      'Keywords',
      'Artist',
      'Author',
      'DateTimeOriginal',
      'CreateDate',
      'GPSPosition',
    ]

    for (const field of fieldOrder) {
      if (metadata[field]) {
        mdContent += `${field}: ${metadata[field]}\n`
      }
    }

    return { markdown: mdContent }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await ImageConverter.convertImage(input.binaryContent, input.filePath)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'image_convert_failed',
        `图片转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
