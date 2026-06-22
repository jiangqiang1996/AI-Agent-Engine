import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { rowsToMarkdownTable } from '../table-utils.js'

async function sheetToMarkdownTable(sheet: unknown): Promise<string> {
  const xlsx = await import('xlsx')
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet as import('xlsx').WorkSheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (rows.length === 0) return ''

  // 将 unknown[][] 转换为 string[][]，委托共享工具生成 Markdown 表格
  const stringRows = rows.map((row) => {
    const arr = Array.isArray(row) ? row : [row]
    return arr.map(String)
  })

  return rowsToMarkdownTable(stringRows)
}

export class XlsxConverter implements DocumentConverter {
  format = 'xlsx' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'xlsx'
  }

  static async convertXlsx(buffer: Buffer): Promise<ConverterResult> {
    const xlsx = await import('xlsx')
    const workbook = xlsx.read(buffer, { type: 'buffer' })

    const sections: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) {
        sections.push(`## ${sheetName}`)
        continue
      }
      const table = await sheetToMarkdownTable(sheet)
      sections.push(`## ${sheetName}\n\n${table}`.trimEnd())
    }

    return { markdown: sections.join('\n\n') }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await XlsxConverter.convertXlsx(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'xlsx_convert_failed',
        `XLSX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
