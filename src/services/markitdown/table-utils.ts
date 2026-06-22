import { MAX_CSV_ROWS, MAX_TABLE_COLUMNS } from './constants.js'

/**
 * 将二维字符串数组转换为 Markdown 表格
 * - 限制最大行数和列数，防止超大表格
 * - 自动补齐短行到最大列数
 * - CSV 和 XLSX 共享此实现
 */
export function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return ''

  const limitedRows = rows.slice(0, MAX_CSV_ROWS)
  const maxCols = Math.min(
    Math.max(...limitedRows.map((r) => r.length)),
    MAX_TABLE_COLUMNS,
  )
  if (maxCols === 0) return ''

  const normalizedRows = limitedRows.map((row) => {
    const normalized = [...row]
    while (normalized.length < maxCols) normalized.push('')
    return normalized.slice(0, maxCols)
  })

  const header = normalizedRows[0]
  const separator = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ]
  return lines.join('\n')
}
