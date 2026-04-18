export interface FrontmatterData {
  [key: string]: string
}

export interface ParsedFrontmatter<T extends FrontmatterData = FrontmatterData> {
  data: T
  body: string
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter<T extends FrontmatterData = FrontmatterData>(content: string): ParsedFrontmatter<T> {
  const match = content.match(FRONTMATTER_PATTERN)
  if (!match) {
    return {
      data: {} as T,
      body: content,
    }
  }

  const frontmatter = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf(':')
        if (index === -1) {
          return [line, '']
        }

        const key = line.slice(0, index).trim()
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
        return [key, value]
      }),
  ) as T

  return {
    data: frontmatter,
    body: match[2],
  }
}
