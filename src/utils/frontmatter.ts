import matter from 'gray-matter'

export interface FrontmatterData {
  [key: string]: unknown
}

export interface ParsedFrontmatter<T extends FrontmatterData = FrontmatterData> {
  data: T
  body: string
}

export function parseFrontmatter<T extends FrontmatterData = FrontmatterData>(content: string): ParsedFrontmatter<T> {
  const parsed = matter(content)
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
