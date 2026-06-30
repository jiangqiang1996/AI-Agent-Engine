import { parse as parseYaml } from 'yaml'

export interface FrontmatterData {
  [key: string]: unknown
}

export interface ParsedFrontmatter<T extends FrontmatterData = FrontmatterData> {
  data: T
  body: string
}

function parseMatter(content: string): { data: Record<string, unknown>; content: string } {
  const text = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/)
  if (!match) {
    return { data: {}, content: text }
  }
  const [, yamlContent, body] = match
  let data: Record<string, unknown>
  try {
    data = parseYaml(yamlContent) ?? {}
  } catch {
    data = {}
  }
  return { data, content: body }
}

export function parseFrontmatter<T extends FrontmatterData = FrontmatterData>(content: string): ParsedFrontmatter<T> {
  const parsed = parseMatter(content)
  return { data: normalizeFrontmatterData(parsed.data) as T, body: parsed.content }
}

export function getFrontmatterString(data: FrontmatterData, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' ? value : undefined
}

function normalizeFrontmatterData(data: Record<string, unknown>): FrontmatterData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, normalizeFrontmatterValue(value)]),
  )
}

function normalizeFrontmatterValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return value
}
