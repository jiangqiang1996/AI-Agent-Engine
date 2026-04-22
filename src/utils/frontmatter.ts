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
        let value = line.slice(index + 1).trim()
        // 仅当成对引号包裹时才去除，避免错配或残留
        if (value.length >= 2) {
          const first = value[0]
          const last = value[value.length - 1]
          if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            value = value.slice(1, -1)
          }
        }
        return [key, value]
      }),
  ) as T

  return {
    data: frontmatter,
    body: match[2],
  }
}
