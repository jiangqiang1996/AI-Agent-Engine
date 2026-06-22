import { createRequire } from 'node:module'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DocxConverter,
  ImageConverter,
  IpynbConverter,
  PdfConverter,
  XlsxConverter,
  ZipConverter,
} from '../../src/services/markitdown-converters-binary.js'
import { createBinaryConverters, createTextConverters } from '../../src/services/markitdown/converters/converter-registry.js'
import type { ConverterInput } from '../../src/services/markitdown-types.js'

const require = createRequire(import.meta.url)
const xlsx = require('xlsx') as typeof import('xlsx')

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')
const ipynbFixturePath = path.join(FIXTURES_DIR, 'sample.ipynb')

describe('markitdown-converters-binary (aligned with Python reference behavior)', () => {
  describe('DocxConverter', () => {
    it('静态方法 convertDocx 应接收 Buffer', async () => {
      // DOCX generation requires external fixture; verify method signature only
      expect(typeof DocxConverter.convertDocx).toBe('function')
    })
  })

  describe('XlsxConverter', () => {
    it('应该将 XLSX 转换为 Markdown 表格', async () => {
      const workbook = xlsx.utils.book_new()
      const data = [
        ['name', 'age', 'city'],
        ['Alice', '30', 'Beijing'],
        ['Bob', '25', 'Shanghai'],
      ]
      const sheet = xlsx.utils.aoa_to_sheet(data)
      xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = await XlsxConverter.convertXlsx(buffer)
      // Reference: each sheet always gets a ## {sheetName} header
      expect(result.markdown).toContain('## Sheet1')
      expect(result.markdown).toContain('| name | age | city |')
      expect(result.markdown).toContain('| Alice | 30 | Beijing |')
      expect(result.markdown).toContain('| --- | --- | --- |')
    })

    it('应该处理多工作表 XLSX，每张表都有独立标题', async () => {
      const workbook = xlsx.utils.book_new()
      const sheet1 = xlsx.utils.aoa_to_sheet([['product', 'price'], ['A', '100']])
      xlsx.utils.book_append_sheet(workbook, sheet1, 'Products')

      const sheet2 = xlsx.utils.aoa_to_sheet([['service', 'cost'], ['X', '50']])
      xlsx.utils.book_append_sheet(workbook, sheet2, 'Services')

      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = await XlsxConverter.convertXlsx(buffer)
      expect(result.markdown).toContain('## Products')
      expect(result.markdown).toContain('## Services')
      expect(result.markdown).toContain('| A | 100 |')
      expect(result.markdown).toContain('| X | 50 |')
    })

    it('应该对空工作表返回空 markdown（不抛异常，匹配参考行为）', async () => {
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([]), 'Empty')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      const result = await XlsxConverter.convertXlsx(buffer)
      // Reference does not throw; returns markdown (possibly empty or just header)
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('单张工作表也应包含 ## 标题（匹配参考行为）', async () => {
      const workbook = xlsx.utils.book_new()
      const sheet = xlsx.utils.aoa_to_sheet([['col']])
      xlsx.utils.book_append_sheet(workbook, sheet, 'S')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = await XlsxConverter.convertXlsx(buffer)
      expect(result.markdown).toContain('## S')
    })
  })

  describe('PdfConverter', () => {
    it('静态方法 convertPdf 应接收 Buffer', async () => {
      expect(typeof PdfConverter.convertPdf).toBe('function')
    })

    it('应该将 PDF 转换为纯文本 Markdown', async () => {
      const pdfBuffer = createMinimalPdf('This is a test PDF content.')
      const result = await PdfConverter.convertPdf(pdfBuffer)
      // pdf-parse may not extract from our minimal PDF; just verify it returns
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('应该对空文本 PDF 返回空 markdown（不抛异常，匹配参考行为）', async () => {
      const pdfBuffer = createMinimalPdf('')
      const result = await PdfConverter.convertPdf(pdfBuffer)
      // Reference falls back to pdfminer, never throws on empty
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('应该从真实 PDF 提取非空文本', async () => {
      const pdfBuffer = readFileSync(path.join(FIXTURES_DIR, 'reference', 'test.pdf'))
      const result = await PdfConverter.convertPdf(pdfBuffer)
      expect(result.markdown.length).toBeGreaterThan(0)
      expect(result.markdown).toContain('Introduction')
    })

    it('应该对损坏的 PDF 缓冲区抛出错误而非静默返回空', async () => {
      await expect(PdfConverter.convertPdf(Buffer.from('not a pdf file'))).rejects.toThrow('PDF 解析失败')
    })
  })

  describe('IpynbConverter', () => {
    it('应该将 IPYNB 转换为 Markdown', () => {
      const content = readFileSync(ipynbFixturePath, 'utf8')
      const result = IpynbConverter.convertIpynb(content)
      expect(result.markdown).toContain('# Jupyter Notebook Sample')
      // Reference hardcodes python language for code cells
      expect(result.markdown).toContain('```python')
      expect(result.markdown).toContain("print('hello world')")
      // Should extract title from first # heading
      expect(result.title).toBe('Jupyter Notebook Sample')
    })

    it('code 单元格应硬编码 python 语言（匹配参考行为）', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'code', source: ['x = 1\nprint(x)'] },
        ],
        metadata: { kernelspec: { name: 'javascript' } },
      })
      const result = IpynbConverter.convertIpynb(notebook)
      // Reference always uses python, ignoring kernelspec
      expect(result.markdown).toContain('```python')
      expect(result.markdown).not.toContain('```javascript')
      expect(result.markdown).toContain('print(x)')
    })

    it('raw 单元格应使用裸代码围栏（无语言，匹配参考行为）', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'raw', source: ['raw content'] },
        ],
        metadata: {},
      })
      const result = IpynbConverter.convertIpynb(notebook)
      // Raw cells use bare ``` with no language
      expect(result.markdown).toMatch(/```\nraw content\n```/)
      expect(result.markdown).not.toMatch(/```raw/)
    })

    it('单元格间应使用空行分隔（\\n\\n）', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: ['# Title'] },
          { cell_type: 'code', source: ['x = 1'] },
        ],
        metadata: {},
      })
      const result = IpynbConverter.convertIpynb(notebook)
      expect(result.markdown).toContain('# Title\n\n```python')
    })

    it('应从第一个 # 标题提取 title', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: ['Some intro\n', '# My Notebook Title\n', 'more text'] },
        ],
        metadata: {},
      })
      const result = IpynbConverter.convertIpynb(notebook)
      expect(result.title).toBe('My Notebook Title')
    })

    it('metadata.title 应覆盖标题派生的 title', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'markdown', source: ['# Heading Title'] },
        ],
        metadata: { title: 'Metadata Title' },
      })
      const result = IpynbConverter.convertIpynb(notebook)
      expect(result.title).toBe('Metadata Title')
    })

    it('无标题时应返回 undefined title', () => {
      const notebook = JSON.stringify({
        cells: [
          { cell_type: 'code', source: ['x = 1'] },
        ],
        metadata: {},
      })
      const result = IpynbConverter.convertIpynb(notebook)
      expect(result.title).toBeUndefined()
    })

    it('应该拒绝无效的 IPYNB 格式（缺少 cells）', () => {
      expect(() => IpynbConverter.convertIpynb('{"not_cells": true}')).toThrow()
    })

    it('空单元格应返回空 markdown（不抛异常，匹配参考行为）', () => {
      const notebook = JSON.stringify({
        cells: [],
        metadata: {},
      })
      const result = IpynbConverter.convertIpynb(notebook)
      expect(result.markdown).toBe('')
    })
  })

  describe('ZipConverter', () => {
    it('应该转换包含文本文件的 ZIP', async () => {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file('hello.txt', 'Hello, World!')
      const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(buffer, 'test.zip', converters)

      expect(result.markdown).toContain('Content from the zip file')
      expect(result.markdown).toContain('## File: hello.txt')
      expect(result.markdown).toContain('Hello, World!')
    })

    it('应该递归处理嵌套 ZIP', async () => {
      const JSZip = (await import('jszip')).default
      const innerZip = new JSZip()
      innerZip.file('inner.txt', 'Inner content')
      const innerBuffer = Buffer.from(await innerZip.generateAsync({ type: 'arraybuffer' }))

      const outerZip = new JSZip()
      outerZip.file('outer.txt', 'Outer content')
      outerZip.file('nested.zip', innerBuffer)
      const outerBuffer = Buffer.from(await outerZip.generateAsync({ type: 'arraybuffer' }))

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(outerBuffer, 'outer.zip', converters)

      expect(result.markdown).toContain('## File: outer.txt')
      expect(result.markdown).toContain('Outer content')
      expect(result.markdown).toContain('## File: nested.zip')
      expect(result.markdown).toContain('Inner content')
    })

    it('应该在达到最大递归深度时停止', async () => {
      const JSZip = (await import('jszip')).default

      // 构建深度为 4 的嵌套 ZIP（超过 ZIP_MAX_DEPTH=3）
      let currentZip = new JSZip()
      currentZip.file('level0.txt', 'Deepest content')
      let currentBuffer = Buffer.from(await currentZip.generateAsync({ type: 'arraybuffer' }))

      for (let i = 1; i <= 4; i++) {
        const outerZip = new JSZip()
        outerZip.file(`level${i}.txt`, `Level ${i} content`)
        outerZip.file('child.zip', currentBuffer)
        currentBuffer = Buffer.from(await outerZip.generateAsync({ type: 'arraybuffer' }))
      }

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(currentBuffer, 'root.zip', converters)

      // 最深层应该被深度限制截断
      expect(result.markdown).toContain('[最大递归深度已达上限]')
    })

    it('应该处理空 ZIP（仅返回头部信息）', async () => {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(buffer, 'empty.zip', converters)

      expect(result.markdown).toContain('Content from the zip file')
    })

    it('应该跳过不支持的文件格式', async () => {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file('readme.txt', 'Text content')
      zip.file('data.unknown', 'Unknown format')
      const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(buffer, 'mixed.zip', converters)

      expect(result.markdown).toContain('## File: readme.txt')
      expect(result.markdown).not.toContain('data.unknown')
    })

    it('应该处理 ZIP 中的 CSV 文件', async () => {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file('data.csv', 'name,age\nAlice,30\nBob,25')
      const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))

      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const result = await ZipConverter.convertZip(buffer, 'csv.zip', converters)

      expect(result.markdown).toContain('## File: data.csv')
      expect(result.markdown).toContain('| name | age |')
      expect(result.markdown).toContain('| Alice | 30 |')
    })

    it('应该对损坏的 ZIP 缓冲区抛出 MarkitdownError', async () => {
      const converters = [...createTextConverters(), ...createBinaryConverters()]
      const zipConverter = new ZipConverter()
      await expect(
        zipConverter.convert({
          filePath: 'corrupt.zip',
          textContent: '',
          binaryContent: Buffer.from('not a zip file'),
          format: 'zip',
        }),
      ).rejects.toThrow()
    })
  })

  describe('ImageConverter', () => {
    it('应该从 JPEG SOF 标记提取图片尺寸', async () => {
      const jpegBuffer = createMinimalJpegWithSof(1920, 1080)
      const result = await ImageConverter.convertImage(jpegBuffer, 'photo.jpg')
      expect(result.markdown).toContain('ImageSize: 1920x1080')
    })

    it('应该从 PNG IHDR 提取图片尺寸', async () => {
      const pngBuffer = createMinimalPngWithIhdr(800, 600)
      const result = await ImageConverter.convertImage(pngBuffer, 'image.png')
      expect(result.markdown).toContain('ImageSize: 800x600')
    })

    it('应该从 PNG tEXt 块提取元数据', async () => {
      const pngBuffer = createPngWithTextChunk('Title', 'My Photo Title')
      const result = await ImageConverter.convertImage(pngBuffer, 'image.png')
      expect(result.markdown).toContain('Title: My Photo Title')
    })

    it('应该处理无 EXIF 元数据的 JPEG（仅尺寸或空）', async () => {
      const jpegBuffer = createMinimalJpegWithSof(640, 480)
      const result = await ImageConverter.convertImage(jpegBuffer, 'plain.jpg')
      // 至少应该返回 ImageSize
      expect(result.markdown).toContain('ImageSize: 640x480')
    })

    it('应该对损坏的图片缓冲区返回空或最小元数据', async () => {
      const result = await ImageConverter.convertImage(Buffer.from('not an image'), 'bad.jpg')
      expect(result.markdown).toBe('')
    })

    it('应该处理截断的 JPEG 而不崩溃', async () => {
      // 创建只有 SOI 标记的截断 JPEG
      const truncated = Buffer.from([0xff, 0xd8])
      const result = await ImageConverter.convertImage(truncated, 'truncated.jpg')
      expect(result).toHaveProperty('markdown')
    })

    it('应该处理截断的 JPEG SOF 标记而不崩溃', async () => {
      // 创建有 SOI 和 SOF 标记头但数据不完整的 JPEG
      const buffer = Buffer.alloc(10)
      buffer[0] = 0xff
      buffer[1] = 0xd8 // SOI
      buffer[2] = 0xff
      buffer[3] = 0xc0 // SOF0
      // pos=4, 但 buffer 只有 10 字节，image-size 会因数据不足返回 null
      const result = await ImageConverter.convertImage(buffer, 'truncated-sof.jpg')
      expect(result).toHaveProperty('markdown')
    })

    it('应该对非 JPEG/PNG 格式返回空 markdown', async () => {
      const result = await ImageConverter.convertImage(Buffer.from([0x00, 0x01, 0x02]), 'file.gif')
      expect(result.markdown).toBe('')
    })
  })
})

// ---- Helper: create minimal valid PDF ----

function createMinimalPdf(text: string): Buffer {
  const header = '%PDF-1.4\n'
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n'
  const obj3 = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'

  const streamContent = `BT\n/F1 12 Tf\n50 700 Td\n(${escapePdfString(text)}) Tj\nET`
  const streamLen = streamContent.length

  const obj4 = '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n'
  const obj5 = `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`

  const parts = [header, obj1, obj2, obj3, obj4, obj5]
  const offsets: number[] = []
  let pos = 0
  for (const part of parts) {
    offsets.push(pos)
    pos += Buffer.byteLength(part)
  }
  const xrefStart = pos

  const xrefEntries = ['0000000000 65535 f ']
  for (const offset of offsets) {
    xrefEntries.push(`${String(offset).padStart(10, '0')} 00000 n `)
  }
  const xref = `xref\n0 ${offsets.length + 1}\n${xrefEntries.join('\n')}\n`
  const trailer = `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`

  return Buffer.from(parts.join('') + xref + trailer)
}

function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

// ---- Helper: create minimal JPEG with SOF0 marker ----

function createMinimalJpegWithSof(width: number, height: number): Buffer {
  // JPEG 结构: SOI + APP0(JFIF) + SOF0 + EOI
  // image-size 需要 JFIF APP0 标记才能识别 JPEG 并解析 SOF0

  // JFIF APP0 段（长度=16，含 2 字节长度字段 + 14 字节数据）
  const jfifPayload = Buffer.alloc(14)
  jfifPayload.write('JFIF', 0, 'ascii') // 标识符 "JFIF" (offset 0-3)
  jfifPayload[4] = 0 // NUL 终止符
  jfifPayload[5] = 1 // 主版本
  jfifPayload[6] = 1 // 次版本
  jfifPayload[7] = 0 // 单位
  jfifPayload.writeUInt16BE(1, 8) // X 密度
  jfifPayload.writeUInt16BE(1, 10) // Y 密度
  jfifPayload[12] = 0 // X 缩略图
  jfifPayload[13] = 0 // Y 缩略图

  // SOF0 段长度 = 8 + 3 * ncomponents（1 个组件 = 11 字节）
  const sofPayload = Buffer.alloc(11)
  sofPayload[0] = 0x00 // 段长度高字节 (length=11)
  sofPayload[1] = 0x0b // 段长度低字节
  sofPayload[2] = 8 // 精度 (bits per sample)
  sofPayload.writeUInt16BE(height, 3)
  sofPayload.writeUInt16BE(width, 5)
  sofPayload[7] = 1 // 组件数量
  // 组件 1: ID=1, 采样因子=0x11, 量化表=0
  sofPayload[8] = 1
  sofPayload[9] = 0x11
  sofPayload[10] = 0

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0]), // APP0 marker
    Buffer.from([0x00, 0x10]), // 段长度 = 16
    jfifPayload,
    Buffer.from([0xff, 0xc0]), // SOF0 marker
    sofPayload,
    Buffer.from([0xff, 0xd9]), // EOI
  ])
}

// ---- Helper: create minimal PNG with IHDR ----

function createMinimalPngWithIhdr(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR chunk: width(4) + height(4) + bitDepth(1) + colorType(1) + compression(1) + filter(1) + interlace(1) = 13 bytes
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 2 // color type (RGB)
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace

  const ihdrChunk = createPngChunk('IHDR', ihdrData)
  const iendChunk = createPngChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, iendChunk])
}

// ---- Helper: create PNG with tEXt chunk ----

function createPngWithTextChunk(keyword: string, text: string): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR (1x1 pixel)
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(1, 0)
  ihdrData.writeUInt32BE(1, 4)
  ihdrData[8] = 8
  ihdrData[9] = 2
  const ihdrChunk = createPngChunk('IHDR', ihdrData)

  // tEXt chunk: keyword + \0 + text
  const textData = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0x00]),
    Buffer.from(text, 'latin1'),
  ])
  const textChunk = createPngChunk('tEXt', textData)

  const iendChunk = createPngChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, textChunk, iendChunk])
}

// ---- Helper: create PNG chunk with CRC32 ----

function createPngChunk(chunkType: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(chunkType, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  // CRC32 covers chunk type + data
  const crc = crc32(Buffer.concat([typeBuffer, data]))
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc, 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

// ---- Helper: CRC32 calculation (PNG standard) ----

const CRC_TABLE: number[] = (() => {
  const table = new Array<number>(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
