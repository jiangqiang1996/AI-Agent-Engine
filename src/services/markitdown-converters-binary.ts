import { createRequire } from 'node:module'
import mammoth from 'mammoth'
import * as xlsx from 'xlsx'
import TurndownService from 'turndown'

import { MarkitdownError } from './markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter } from './markitdown-types.js'

const require = createRequire(import.meta.url)
const pdfParse: (buffer: Buffer, options?: { max?: number }) => Promise<{ text: string }> =
  require('pdf-parse')

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

const MAX_SHEET_ROWS = 5000
const MAX_TABLE_COLUMNS = 50
const MAX_PDF_PAGES = 500

export class DocxConverter implements DocumentConverter {
  format = 'docx' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'docx'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const result = await mammoth.convertToHtml({ buffer: input.binaryContent })
      const html = result.value
      if (!html.trim()) {
        throw new MarkitdownError('docx_convert_failed', 'DOCX 转换结果为空：文档可能不包含文本内容。')
      }
      const markdown = turndownService.turndown(html)
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'docx_convert_failed',
        `DOCX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

function sheetToMarkdownTable(sheet: xlsx.WorkSheet): string {
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (rows.length === 0) return ''

  const limitedRows = rows.slice(0, MAX_SHEET_ROWS)
  const maxCols = Math.min(
    Math.max(...limitedRows.map((row) => Array.isArray(row) ? row.length : 0)),
    MAX_TABLE_COLUMNS,
  )
  const normalizedRows = limitedRows.map((row) => {
    const arr = Array.isArray(row) ? row : [row]
    const normalized = [...arr.map(String)]
    while (normalized.length < maxCols) normalized.push('')
    return normalized.slice(0, maxCols)
  })

  if (normalizedRows.length === 0) return ''

  const header = normalizedRows[0]
  const separator = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ]
  return lines.join('\n')
}

export class XlsxConverter implements DocumentConverter {
  format = 'xlsx' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'xlsx'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const workbook = xlsx.read(input.binaryContent, { type: 'buffer' })
      if (workbook.SheetNames.length === 0) {
        throw new MarkitdownError('xlsx_convert_failed', 'XLSX 文件不包含任何工作表。')
      }

      const sections = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName]
        if (!sheet) return ''
        const table = sheetToMarkdownTable(sheet)
        if (!table) return ''
        if (workbook.SheetNames.length > 1) {
          return `## ${sheetName}\n\n${table}`
        }
        return table
      }).filter(Boolean)

      const markdown = sections.join('\n\n')
      if (!markdown.trim()) {
        throw new MarkitdownError('xlsx_convert_failed', 'XLSX 转换结果为空：工作表可能不包含数据。')
      }
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'xlsx_convert_failed',
        `XLSX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class PdfConverter implements DocumentConverter {
  format = 'pdf' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'pdf'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const data = await pdfParse(input.binaryContent, { max: MAX_PDF_PAGES })
      const text = data.text?.trim()
      if (!text) {
        throw new MarkitdownError('pdf_convert_failed', 'PDF 提取文本为空：文件可能是扫描件或纯图片 PDF。')
      }
      return { markdown: text }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'pdf_convert_failed',
        `PDF 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

interface IpynbNotebook {
  cells: Array<{
    cell_type: string
    source: string | string[]
    outputs?: unknown[]
  }>
  metadata?: {
    kernelspec?: { name?: string; display_name?: string }
  }
}

export class IpynbConverter implements DocumentConverter {
  format = 'ipynb' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'ipynb'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const notebook: IpynbNotebook = JSON.parse(input.textContent)
      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        throw new MarkitdownError('ipynb_convert_failed', 'IPYNB 文件格式无效：缺少 cells 字段。')
      }

      const language = notebook.metadata?.kernelspec?.name ?? 'python'

      const sections = notebook.cells.map((cell) => {
        const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source

        if (cell.cell_type === 'markdown') {
          return source
        }
        if (cell.cell_type === 'code') {
          return '```' + language + '\n' + source + '\n```'
        }
        if (cell.cell_type === 'raw') {
          return '```\n' + source + '\n```'
        }
        return ''
      })

      const markdown = sections.filter(Boolean).join('\n\n')
      if (!markdown.trim()) {
        throw new MarkitdownError('ipynb_convert_failed', 'IPYNB 转换结果为空：notebook 不包含有效单元格。')
      }
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'ipynb_convert_failed',
        `IPYNB 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export function createBinaryConverters(): DocumentConverter[] {
  return [new DocxConverter(), new XlsxConverter(), new PdfConverter(), new IpynbConverter()]
}
