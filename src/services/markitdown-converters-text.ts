import TurndownService from 'turndown'
import { parse as parseYaml } from 'yaml'

import { MarkitdownError } from './markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter } from './markitdown-types.js'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'] as unknown as TurndownService.Filter,
  replacement: (content) => `~~${content}~~`,
})

const MAX_CSV_ROWS = 5000
const MAX_TABLE_COLUMNS = 50

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return undefined
  const title = match[1].trim()
  return title || undefined
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

export class HtmlConverter implements DocumentConverter {
  format = 'html' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'html'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const html = stripHtmlComments(input.textContent)
      const title = extractHtmlTitle(html)
      const markdown = turndownService.turndown(html)
      if (!markdown.trim()) {
        throw new MarkitdownError('html_convert_failed', 'HTML 转换结果为空：文件可能不包含有效内容。')
      }
      return { markdown, title }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'html_convert_failed',
        `HTML 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      current += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      fields.push(current)
      current = ''
      i++
      continue
    }
    current += char
    i++
  }
  fields.push(current)
  return fields
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      currentField += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === delimiter) {
      currentRow.push(currentField)
      currentField = ''
      i++
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      currentRow.push(currentField)
      currentField = ''
      if (currentRow.some((f) => f !== '')) {
        rows.push(currentRow)
      }
      currentRow = []
      i++
      continue
    }
    currentField += char
    i++
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some((f) => f !== '')) {
      rows.push(currentRow)
    }
  }
  return rows
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return ''
  const limitedRows = rows.slice(0, MAX_CSV_ROWS)
  const maxCols = Math.min(
    Math.max(...limitedRows.map((r) => r.length)),
    MAX_TABLE_COLUMNS,
  )
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

export class CsvConverter implements DocumentConverter {
  format = 'csv' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'csv'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const isTsv = input.filePath.toLowerCase().endsWith('.tsv')
      const delimiter = isTsv ? '\t' : ','
      const rows = parseCsv(input.textContent, delimiter)
      if (rows.length === 0) {
        throw new MarkitdownError('text_parse_failed', 'CSV 解析结果为空：文件不包含有效数据行。')
      }
      const markdown = rowsToMarkdownTable(rows)
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

export class JsonConverter implements DocumentConverter {
  format = 'json' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'json'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const parsed: unknown = JSON.parse(input.textContent)
      let markdown: string

      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => isPlainObject(item))) {
        markdown = jsonObjectsToTable(parsed as Record<string, unknown>[])
      } else {
        markdown = '```json\n' + JSON.stringify(parsed, null, 2) + '\n```'
      }
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'json_parse_failed',
        `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonObjectsToTable(objects: Record<string, unknown>[]): string {
  const keys = Array.from(
    objects.reduce((set, obj) => {
      Object.keys(obj).forEach((key) => set.add(key))
      return set
    }, new Set<string>()),
  ).slice(0, MAX_TABLE_COLUMNS)

  const header = `| ${keys.join(' | ')} |`
  const separator = `| ${keys.map(() => '---').join(' | ')} |`
  const rows = objects.slice(0, MAX_CSV_ROWS).map((obj) => {
    const values = keys.map((key) => formatJsonValue(obj[key]))
    return `| ${values.join(' | ')} |`
  })
  return [header, separator, ...rows].join('\n')
}

function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'object') return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return String(value)
}

export class XmlConverter implements DocumentConverter {
  format = 'xml' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'xml'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const markdown = '```xml\n' + input.textContent.trim() + '\n```'
      return { markdown }
    } catch (error) {
      throw new MarkitdownError(
        'xml_parse_failed',
        `XML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class YamlConverter implements DocumentConverter {
  format = 'yaml' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'yaml'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      parseYaml(input.textContent)
      return { markdown: '```yaml\n' + input.textContent.trim() + '\n```' }
    } catch (error) {
      throw new MarkitdownError(
        'yaml_parse_failed',
        `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class TextConverter implements DocumentConverter {
  format = 'text' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'text'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return { markdown: input.textContent }
  }
}

export class MarkdownConverter implements DocumentConverter {
  format = 'markdown' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'markdown'
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return { markdown: input.textContent }
  }
}

export function createTextConverters(): DocumentConverter[] {
  return [
    new HtmlConverter(),
    new CsvConverter(),
    new JsonConverter(),
    new XmlConverter(),
    new YamlConverter(),
    new TextConverter(),
    new MarkdownConverter(),
  ]
}
