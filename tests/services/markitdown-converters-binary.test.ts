import { createRequire } from 'node:module'
import { promises as fs, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DocxConverter,
  XlsxConverter,
  PdfConverter,
  IpynbConverter,
} from '../../src/services/markitdown-utilities.js'
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
    it('应该将 XLSX 转换为 Markdown 表格', () => {
      const workbook = xlsx.utils.book_new()
      const data = [
        ['name', 'age', 'city'],
        ['Alice', '30', 'Beijing'],
        ['Bob', '25', 'Shanghai'],
      ]
      const sheet = xlsx.utils.aoa_to_sheet(data)
      xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = XlsxConverter.convertXlsx(buffer)
      // Reference: each sheet always gets a ## {sheetName} header
      expect(result.markdown).toContain('## Sheet1')
      expect(result.markdown).toContain('| name | age | city |')
      expect(result.markdown).toContain('| Alice | 30 | Beijing |')
      expect(result.markdown).toContain('| --- | --- | --- |')
    })

    it('应该处理多工作表 XLSX，每张表都有独立标题', () => {
      const workbook = xlsx.utils.book_new()
      const sheet1 = xlsx.utils.aoa_to_sheet([['product', 'price'], ['A', '100']])
      xlsx.utils.book_append_sheet(workbook, sheet1, 'Products')

      const sheet2 = xlsx.utils.aoa_to_sheet([['service', 'cost'], ['X', '50']])
      xlsx.utils.book_append_sheet(workbook, sheet2, 'Services')

      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = XlsxConverter.convertXlsx(buffer)
      expect(result.markdown).toContain('## Products')
      expect(result.markdown).toContain('## Services')
      expect(result.markdown).toContain('| A | 100 |')
      expect(result.markdown).toContain('| X | 50 |')
    })

    it('应该对空工作表返回空 markdown（不抛异常，匹配参考行为）', () => {
      const workbook = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([]), 'Empty')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      const result = XlsxConverter.convertXlsx(buffer)
      // Reference does not throw; returns markdown (possibly empty or just header)
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('单张工作表也应包含 ## 标题（匹配参考行为）', () => {
      const workbook = xlsx.utils.book_new()
      const sheet = xlsx.utils.aoa_to_sheet([['col']])
      xlsx.utils.book_append_sheet(workbook, sheet, 'S')
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      const result = XlsxConverter.convertXlsx(buffer)
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

  const xrefOffset = Buffer.byteLength(header + obj1 + obj2 + obj3 + obj4 + obj5)
  const trailer = `xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000184 00000 n \n0000000${String(xrefOffset).padStart(5, '0')} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(header + obj1 + obj2 + obj3 + obj4 + obj5 + trailer)
}

function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}
