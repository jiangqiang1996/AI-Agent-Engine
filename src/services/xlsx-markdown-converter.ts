import { rowsToMarkdownTable } from './markdown-table-utils.js'
import type { MarkdownConversionResult } from './markdown-conversion-types.js'

async function sheetToMarkdownTable(sheet: unknown): Promise<string> {
  const xlsx = await import('xlsx')
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet as import('xlsx').WorkSheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (rows.length === 0) return ''

  const stringRows = rows.map((row) => {
    const arr = Array.isArray(row) ? row : [row]
    return arr.map(String)
  })

  return rowsToMarkdownTable(stringRows)
}

export async function convertXlsxToMarkdown(buffer: Buffer): Promise<MarkdownConversionResult> {
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
