import { parse as parseCsvSync } from 'csv-parse/sync'

import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { rowsToMarkdownTable } from '../table-utils.js'

/**
 * 使用 csv-parse 库解析 CSV/TSV 文本为二维数组。
 *
 * 行为对齐参考实现：
 * - 跳过完全为空的行（所有字段均为空字符串）
 * - 保留短行原样，由 rowsToMarkdownTable 负责补齐
 * - 支持引号包裹的字段（内嵌逗号、换行、转义引号）
 */
function parseCsv(text: string, delimiter: string): string[][] {
  if (text.trim() === '') return []

  const records = parseCsvSync(text, {
    delimiter,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as string[][]

  // 过滤所有字段均为空字符串的行，匹配参考行为
  return records.filter((row) => row.some((f) => f !== ''))
}

export class CsvConverter implements DocumentConverter {
  format = 'csv' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'csv'
  }

  static parseAndConvert(text: string, delimiter: string): string {
    const rows = parseCsv(text, delimiter)
    if (rows.length === 0) {
      return ''
    }
    return rowsToMarkdownTable(rows)
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const isTsv = input.filePath.toLowerCase().endsWith('.tsv')
      const delimiter = isTsv ? '\t' : ','
      const markdown = CsvConverter.parseAndConvert(input.textContent, delimiter)
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'text_parse_failed',
        `CSV 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
