import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import {
  ImageConverter,
} from '../../src/services/markitdown-converters-binary.js'
import { MarkitdownError } from '../../src/services/markitdown-errors.js'
import type { ConverterInput } from '../../src/services/markitdown-types.js'

// Mock vision 服务：单元测试环境无 vision 模型可用
vi.mock('../../src/services/markitdown-vision-service.js', () => ({
  recognizeImageWithVision: vi.fn(),
}))

import { recognizeImageWithVision } from '../../src/services/markitdown-vision-service.js'

const mockedRecognize = vi.mocked(recognizeImageWithVision)

/**
 * 生成最小合法 PNG Buffer（1x1 透明像素）。
 * 用于触发 image-size 解析路径，避免依赖外部图片文件。
 */
function createMinimalPng(): Buffer {
  // PNG 签名 + IHDR + IDAT + IEND 的最小集合
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // IHDR chunk: width=1, height=1, bit depth=8, color type=6 (RGBA)
  const ihdrData = Buffer.from([
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
  ])
  const ihdrCrc = Buffer.from([0x1f, 0x15, 0xc4, 0x89])
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from('IHDR'),
    ihdrData,
    ihdrCrc,
  ])
  // IDAT chunk: 压缩的像素数据（ deflate 压缩的 1x1 RGBA ）
  const idatData = Buffer.from([
    0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  ])
  const idatCrc = Buffer.from([0xff, 0x60, 0x1a, 0x01])
  const idat = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0e]),
    Buffer.from('IDAT'),
    idatData,
    idatCrc,
  ])
  // IEND chunk
  const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
  return Buffer.concat([signature, ihdr, idat, iend])
}

/**
 * 生成最小合法 JPEG Buffer（用于触发 image-size 解析路径）。
 */
function createMinimalJpeg(): Buffer {
  // SOI + APP0 + DQT + SOF0 + DHT + SOS + EOI 的最小集合
  const soi = Buffer.from([0xff, 0xd8])
  // APP0 marker
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ])
  // SOF0 marker: 8-bit, height=1, width=1, 3 components
  const sof0 = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ])
  // EOI marker
  const eoi = Buffer.from([0xff, 0xd9])
  return Buffer.concat([soi, app0, sof0, eoi])
}

describe('markitdown-converters-image', () => {
  beforeEach(() => {
    mockedRecognize.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('ImageConverter.convertImage 静态方法', () => {
    it('应该作为函数存在', () => {
      expect(typeof ImageConverter.convertImage).toBe('function')
    })

    it('应该接收 PNG Buffer 并返回包含尺寸和 vision 结果的 Markdown', async () => {
      mockedRecognize.mockResolvedValue({
        markdown: '这是一张测试图片，包含一个透明像素。',
        modelUsed: 'test-vision-model',
      })

      const buffer = createMinimalPng()
      const result = await ImageConverter.convertImage(buffer, 'test.png')

      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
      // vision 结果应包含在输出中
      expect(result.markdown).toContain('这是一张测试图片')
      // 模型信息应包含在输出中
      expect(result.markdown).toContain('VisionModel: test-vision-model')
    })

    it('应该接收 JPEG Buffer 并返回 Markdown', async () => {
      mockedRecognize.mockResolvedValue({
        markdown: 'JPEG 图片描述。',
        modelUsed: undefined,
      })

      const buffer = createMinimalJpeg()
      const result = await ImageConverter.convertImage(buffer, 'photo.jpg')

      expect(result.markdown).toContain('JPEG 图片描述')
      // 未指定模型时不应包含 VisionModel 行
      expect(result.markdown).not.toContain('VisionModel')
    })

    it('vision 返回空 markdown 时应输出降级提示', async () => {
      mockedRecognize.mockResolvedValue({
        markdown: '',
        modelUsed: 'test-model',
      })

      const buffer = createMinimalPng()
      const result = await ImageConverter.convertImage(buffer, 'empty.png')

      expect(result.markdown).toContain('vision 模型未返回有效识别内容')
    })

    it('vision 服务抛出 MarkitdownError 时应原样抛出', async () => {
      const visionError = new MarkitdownError(
        'image_vision_unavailable',
        'vision 模型不可用',
      )
      mockedRecognize.mockRejectedValue(visionError)

      const buffer = createMinimalPng()
      await expect(ImageConverter.convertImage(buffer, 'test.png')).rejects.toThrow(
        'vision 模型不可用',
      )
    })

    it('vision 服务抛出普通错误时应包装为 MarkitdownError', async () => {
      mockedRecognize.mockRejectedValue(new Error('网络异常'))

      const buffer = createMinimalPng()
      await expect(ImageConverter.convertImage(buffer, 'test.png')).rejects.toThrow(
        '图片转换失败',
      )
    })
  })

  describe('ImageConverter 实例 convert 方法', () => {
    it('应该委托到静态 convertImage 方法', async () => {
      mockedRecognize.mockResolvedValue({
        markdown: '实例方法调用结果。',
        modelUsed: 'instance-model',
      })

      const buffer = createMinimalJpeg()
      const input: ConverterInput = {
        filePath: 'instance.jpg',
        textContent: '',
        binaryContent: buffer,
        format: 'jpg',
      }

      const converter = new ImageConverter()
      const result = await converter.convert(input)

      expect(result.markdown).toContain('实例方法调用结果')
      // 确认静态方法被调用（通过 mock 调用次数验证）
      expect(mockedRecognize).toHaveBeenCalledTimes(1)
      expect(mockedRecognize).toHaveBeenCalledWith({
        filePath: 'instance.jpg',
        imageBuffer: buffer,
      })
    })

    it('应该只接受 jpg 格式（基于 format 字段，忽略文件路径）', () => {
      const converter = new ImageConverter()
      expect(converter.accept('a.jpg', 'jpg')).toBe(true)
      expect(converter.accept('a.png', 'jpg')).toBe(true)
      expect(converter.accept('a.pdf', 'pdf')).toBe(false)
      expect(converter.accept('a.docx', 'docx')).toBe(false)
    })
  })
})
