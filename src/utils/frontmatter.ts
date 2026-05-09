import matter from 'gray-matter'

export interface FrontmatterData {
  [key: string]: string
}

export interface ParsedFrontmatter<T extends FrontmatterData = FrontmatterData> {
  data: T
  body: string
}

export function parseFrontmatter<T extends FrontmatterData = FrontmatterData>(content: string): ParsedFrontmatter<T> {
  const parsed = matter(content)
  return { data: stringifyFrontmatterData(parsed.data) as T, body: parsed.content }
}

function stringifyFrontmatterData(data: Record<string, unknown>): FrontmatterData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, stringifyFrontmatterValue(value)]),
  )
}

function stringifyFrontmatterValue(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  return String(value)
}
