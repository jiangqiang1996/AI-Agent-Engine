import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { MAX_CSV_ROWS, MAX_TABLE_COLUMNS } from '../constants.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'object') return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return String(value)
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

export class JsonConverter implements DocumentConverter {
  format = 'json' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'json'
  }

  static convertJson(text: string): ConverterResult {
    const parsed: unknown = JSON.parse(text)

    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => isPlainObject(item))) {
      return { markdown: jsonObjectsToTable(parsed as Record<string, unknown>[]) }
    }

    return { markdown: '```json\n' + JSON.stringify(parsed, null, 2) + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return JsonConverter.convertJson(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'json_parse_failed',
        `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
