import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  it('未提供 outputPath 时仅返回 output 字段', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'note.md'), '# 标题\n\n正文内容')

    const result = await callTool(root, { file: 'note.md' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    expect(obj.output).toContain('标题')
    expect(obj.metadata.outputPath).toBeUndefined()
  })

  it('提供 outputPath 时应写入 .md 文件并返回路径', async () => {
    const root = createRoot()
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'note.md'), '# 原始标题\n\n正文')

    const result = await callTool(root, { file: 'note.md', outputPath: 'docs/out.md' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    expect(obj.output).toContain('原始标题')
    expect(obj.metadata.outputPath).toBe(join(root, 'docs', 'out.md'))
    expect(readFileSync(join(root, 'docs', 'out.md'), 'utf8')).toContain('原始标题')
  })

  it('outputPath 目录不存在时应自动创建', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'note.md'), '简单文本')

    const result = await callTool(root, { file: 'note.md', outputPath: 'nested/dir/out.md' })
    const obj = result as { output: string; metadata: Record<string, unknown> }

    expect(existsSync(join(root, 'nested', 'dir', 'out.md'))).toBe(true)
    expect(obj.metadata.outputPath).toBe(join(root, 'nested', 'dir', 'out.md'))
  })

  it('outputPath 越界时应返回错误且不写文件', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'note.md'), '内容')

    const result = await callTool(root, { file: 'note.md', outputPath: '../escape.md' })
    const output = typeof result === 'string' ? result : result.output

    expect(output).toContain('路径越界')
    expect(existsSync(join(root, '..', 'escape.md'))).toBe(false)
  })

  it('文件不存在时应返回可恢复的中文错误', async () => {
    const root = createRoot()

    const result = await callTool(root, { file: 'missing.md' })
    const output = typeof result === 'string' ? result : result.output

    expect(output).toContain('路径不存在')
  })
})
