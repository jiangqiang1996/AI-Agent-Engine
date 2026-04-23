export interface FrontmatterData {
  [key: string]: string
}

export interface ParsedFrontmatter<T extends FrontmatterData = FrontmatterData> {
  data: T
  body: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function parseFrontmatter<T extends FrontmatterData = FrontmatterData>(content: string): ParsedFrontmatter<T> {
  const captured = content.match(FRONTMATTER_RE)
  if (!captured) {
    return { data: {} as T, body: content }
  }

  const data = Object.fromEntries(
    captured[1]
      .split(/\r?\n/)
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) return [line, '']

        const key = line.slice(0, colonIdx).trim()
        let val = line.slice(colonIdx + 1).trim()

        if (val.length >= 2) {
          const head = val[0]
          const tail = val[val.length - 1]
          if ((head === '"' && tail === '"') || (head === "'" && tail === "'")) {
            val = val.slice(1, -1)
          }
        }

        return [key, val]
      }),
  ) as T

  return { data, body: captured[2] }
}
