import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-markitdown-tool-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function callTool(
  root: string,
  args: Record<string, unknown>,
): Promise<string | { output: string; metadata?: Record<string, unknown> }> {
  const { aeMarkitdownTool: tool } = await import('../../src/tools/ae-markitdown.tool.js')
  const definition = tool as unknown as {
    execute: (
      args: Record<string, unknown>,
      ctx: Record<string, unknown>,
    ) => Promise<string | { output: string; metadata?: Record<string, unknown> }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? result : result
}

describe('ae-markitdown 工具', () => {
  it('转换后应自动写入 ae/markitdown 并返回 outputPath', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'note.html'), '<h1>标题</h1>\n<p>正文内容</p>')

    const result = await callTool(root, { file: 'note.html' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    expect(obj.output).toContain('标题')

    const outputPath = obj.metadata.outputPath as string
    expect(outputPath).toBeTruthy()
    // 输出路径位于 ae/markitdown 子目录下
    expect(outputPath).toContain(join('ae', 'markitdown') + sep)
    // 文件名保留原始文件名
    expect(outputPath).toContain('note.html-')
    // 以 .md 结尾
    expect(outputPath.endsWith('.md')).toBe(true)
    // 文件真实写入
    expect(existsSync(outputPath)).toBe(true)
    expect(readFileSync(outputPath, 'utf8')).toContain('标题')
  })

  it('ae/markitdown 目录不存在时应自动创建', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'data.json'), '{"a":1}')

    const result = await callTool(root, { file: 'data.json' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    const outputPath = obj.metadata.outputPath as string
    expect(existsSync(outputPath)).toBe(true)
    expect(existsSync(join(root, 'ae', 'markitdown'))).toBe(true)
  })

  it('同一文件反复转换时文件名不得冲突', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'a.json'), '{"key":"value"}')

    const r1 = await callTool(root, { file: 'a.json' })
    const r2 = await callTool(root, { file: 'a.json' })

    const p1 = (r1 as { metadata: Record<string, unknown> }).metadata.outputPath as string
    const p2 = (r2 as { metadata: Record<string, unknown> }).metadata.outputPath as string

    expect(p1).not.toBe(p2)
    expect(existsSync(p1)).toBe(true)
    expect(existsSync(p2)).toBe(true)
    // 两个文件名都保留原始文件名
    expect(p1).toContain('a.json-')
    expect(p2).toContain('a.json-')
  })

  it('嵌套路径文件应取 basename 作为输出文件名前缀', async () => {
    const root = createRoot()
    mkdirSync(join(root, 'docs', 'sub'), { recursive: true })
    writeFileSync(join(root, 'docs', 'sub', 'report.html'), '<h1>报告</h1>')

    const result = await callTool(root, { file: 'docs/sub/report.html' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    const outputPath = obj.metadata.outputPath as string
    expect(outputPath).toContain('report.html-')
    expect(existsSync(outputPath)).toBe(true)
  })

  it('文件不存在时应返回可恢复的中文错误', async () => {
    const root = createRoot()

    const result = await callTool(root, { file: 'missing.html' })
    const output = typeof result === 'string' ? result : result.output

    expect(output).toContain('路径不存在')
  })
})
