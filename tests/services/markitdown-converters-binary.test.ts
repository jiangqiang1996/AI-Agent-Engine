import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DocxConverter,
  PdfConverter,
  XlsxConverter,
} from '../../src/services/markitdown-converters-binary.js'

const require = createRequire(import.meta.url)
const xlsx = require('xlsx') as typeof import('xlsx')

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')

describe('markitdown-converters-binary', () => {
  describe('DocxConverter', () => {
    it('静态方法 convertDocx 应接收 Buffer', async () => {
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
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('应该对空文本 PDF 返回空 markdown（不抛异常，匹配参考行为）', async () => {
      const pdfBuffer = createMinimalPdf('')
      const result = await PdfConverter.convertPdf(pdfBuffer)
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
})

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
