import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = join(tmpdir(), `ae-doc-extract-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  roots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function callTool(root: string, args: Record<string, unknown>, directory = root) {
  const { aeDocExtractTool: tool } = await import('../../src/tools/ae-doc-extract.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }
  const cwd = process.cwd()
  process.chdir(root)
  try {
    return await definition.execute(args, { metadata: vi.fn(), directory, worktree: root })
  } finally {
    process.chdir(cwd)
  }
}

async function callToolFromDifferentCwd(root: string, cwd: string, args: Record<string, unknown>) {
  const { aeDocExtractTool: tool } = await import('../../src/tools/ae-doc-extract.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }
  const previousCwd = process.cwd()
  process.chdir(cwd)
  try {
    return await definition.execute(args, { metadata: vi.fn(), directory: root, worktree: root })
  } finally {
    process.chdir(previousCwd)
  }
}

describe('ae-doc-extract 工具', () => {
  it('应该返回 JSON 格式的提取结果', async () => {
    const root = createRoot()
    mkdirSync(join(root, 'ae', 'plans'), { recursive: true })
    writeFileSync(join(root, 'ae', 'plans', 'main.md'), [
      '---',
      'type: plan',
      'status: drafted',
      'date: 2026-05-22',
      'title: plan',
      '---',
      '# 计划',
      '## 实现单元',
      '- U1. 处理 R1。',
    ].join('\n'), 'utf8')

    const output = await callTool(root, { path: 'ae/plans/main.md', ids: ['U1'] })
    const parsed = JSON.parse(output) as { implementationUnits: Array<{ id: string }> }

    expect(parsed.implementationUnits).toEqual([expect.objectContaining({ id: 'U1' })])
  })

  it('应该返回可恢复的中文错误', async () => {
    const root = createRoot()

    const output = await callTool(root, { path: 'missing.md' })

    expect(output).toContain('文档提取失败：')
    expect(output).toContain('文档不存在或不是文件')
  })

  it('应该使用 ToolContext worktree 而不是进程 cwd', async () => {
    const root = createRoot()
    const cwd = createRoot()
    mkdirSync(join(root, 'ae', 'plans'), { recursive: true })
    writeFileSync(join(root, 'ae', 'plans', 'main.md'), [
      '---',
      'type: plan',
      'status: drafted',
      'date: 2026-05-22',
      'title: plan',
      '---',
      '# 计划',
      '## 实现单元',
      '- U1. 处理 R1。',
    ].join('\n'), 'utf8')

    const output = await callToolFromDifferentCwd(root, cwd, { path: 'ae/plans/main.md', ids: ['U1'] })
    const parsed = JSON.parse(output) as { metadata: { source: string } }

    expect(parsed.metadata.source).toBe('ae/plans/main.md')
  })

  it('应该拒绝当前 worktree 外的绝对路径', async () => {
    const root = createRoot()
    const outside = createRoot()
    writeFileSync(join(outside, 'outside.md'), '# outside', 'utf8')

    const output = await callTool(root, { path: resolve(outside, 'outside.md') })

    expect(output).toContain('文档提取失败：')
    expect(output).toContain('路径必须位于当前工作区内')
  })

  it('应该按 ToolContext directory 解析相对路径', async () => {
    const root = createRoot()
    const directory = join(root, 'ae', 'plans')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'main.md'), [
      '---',
      'type: plan',
      'status: drafted',
      'date: 2026-05-22',
      'title: plan',
      '---',
      '# 计划',
      '## 实现单元',
      '- U1. 处理 R1。',
    ].join('\n'), 'utf8')

    const output = await callTool(root, { path: 'main.md', ids: ['U1'] }, directory)
    const parsed = JSON.parse(output) as { metadata: { source: string } }

    expect(parsed.metadata.source).toBe('ae/plans/main.md')
  })
})
