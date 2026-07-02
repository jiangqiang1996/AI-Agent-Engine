import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type OutputMode = 'file' | 'inline'

export interface MarkdownOutputResult {
  outputPath?: string
  summary: string
  content: string
}

export function writeMarkdownOutput(
  markdown: string,
  worktree: string,
  formatName: string,
  outputPath?: string,
  outputMode?: OutputMode,
): MarkdownOutputResult {
  const content = markdown
  const mode = outputMode ?? 'file'

  if (mode === 'inline') {
    return { summary: `${formatName} 已转为 Markdown（内联返回）`, content }
  }

  if (outputPath) {
    const resolved = path.resolve(worktree, outputPath)
    const dir = path.dirname(resolved)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolved, content, 'utf-8')
    return { outputPath: resolved, summary: `${formatName} 已转为 Markdown 并写入 ${resolved}`, content }
  }

  const defaultDir = path.resolve(worktree, 'ae/markdown')
  mkdirSync(defaultDir, { recursive: true })
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const filename = `${formatName}-to-markdown-${timestamp}-${random}.md`
  const defaultPath = path.join(defaultDir, filename)
  writeFileSync(defaultPath, content, 'utf-8')
  return { outputPath: defaultPath, summary: `${formatName} 已转为 Markdown 并写入 ${defaultPath}`, content }
}
