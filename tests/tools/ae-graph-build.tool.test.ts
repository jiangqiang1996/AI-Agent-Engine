import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { aeGraphBuildTool } from '../../src/tools/ae-graph-build.tool.js'
import { aeGraphQueryTool } from '../../src/tools/ae-graph-query.tool.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-build-'))
  tempRoots.push(root)
  return root
}

function write(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content)
}

function createMockContext(worktree: string) {
  return {
    worktree,
    directory: worktree,
    sessionID: 'test-session',
    messageID: 'test-message',
    agent: 'test-agent',
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: () => Effect.succeed(undefined),
  } as unknown as ToolContext
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-graph-build 工具', () => {
  it('应该全量构建 fixture 项目的图谱', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import x from './b'")
    write(root, 'src/b.ts', 'export const b = 1')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string; files: number; relations: number }

    expect(parsed.mode).toBe('full')
    expect(parsed.files).toBeGreaterThan(0)
    expect(parsed.relations).toBeGreaterThan(0)
  })

  it('应该拒绝越界 target', async () => {
    const root = createTempRoot()
    const result = await aeGraphBuildTool.execute({ target: '..', mode: 'full' }, createMockContext(root))

    expect(result).toContain('目标路径不在当前工作区内')
  })

  it('应该拒绝包含中间目录符号链接的 target', async () => {
    const root = createTempRoot()
    write(root, 'src/sub/a.ts', '')
    try {
      symlinkSync(join(root, 'src'), join(root, 'linked-src'), 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }

    const result = await aeGraphBuildTool.execute({ target: 'linked-src/sub', mode: 'full' }, createMockContext(root))

    expect(result).toContain('目标路径不在当前工作区内')
  })

  it('应该在首次 auto 构建时创建图谱', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', "import x from './b'")
    write(root, 'src/b.ts', 'export const b = 1')
    execFileSync('git', ['add', 'src/a.ts', 'src/b.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })

    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string; files: number }

    expect(parsed.mode).toBe('full')
    expect(parsed.files).toBeGreaterThan(0)
  })

  it('应该在授权被拒绝时取消写入图谱文件', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    const ctx = {
      ...createMockContext(root),
      ask: () => {
        throw new Error('denied')
      },
    } as unknown as ToolContext

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)

    expect(result).toContain('未授权写入')
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json'))).toBe(false)
  })

  it('应该在无法确认写入授权时取消构建', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    const ctx = createMockContext(root) as unknown as Record<string, unknown>
    delete ctx.ask

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx as unknown as ToolContext)

    expect(result).toContain('未授权写入')
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json'))).toBe(false)
  })

  it('应该返回相对图谱文件路径', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { database: string }

    expect(parsed.database).toBe('docs/ae/graphs/graph.json')
  })

  it('Git diff 无变更时应该跳过增量构建并返回图谱文件路径', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { message: string; database: string }

    expect(parsed.message).toContain('图谱无需更新')
    expect(parsed.database).toBe('docs/ae/graphs/graph.json')
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
  })

  it('新增被既有文件引用的目标文件时应该回退全量构建', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', "import b from './b'")
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    write(root, 'src/b.ts', 'export const b = 1')
    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/a.ts' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { dependencies: Array<{ targetPath: string; relationType: string }> } }

    expect(parsed.mode).toBe('full')
    expect(query.result.dependencies.some((relation) => relation.relationType === 'import' && relation.targetPath === 'src/b.ts')).toBe(true)
  })

  it('删除被既有文件引用的目标文件时应该回退全量构建', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', "import b from './b'")
    write(root, 'src/b.ts', 'export const b = 1')
    execFileSync('git', ['add', 'src/a.ts', 'src/b.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    rmSync(join(root, 'src/b.ts'), { force: true })
    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/a.ts' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { dependencies: Array<{ targetPath: string; relationType: string }> } }

    expect(parsed.mode).toBe('full')
    expect(query.result.dependencies.some((relation) => relation.relationType === 'import' && relation.targetPath === 'src/b.ts')).toBe(false)
    expect(query.result.dependencies.some((relation) => relation.relationType === 'external' && relation.targetPath === './b')).toBe(true)
  })

  it('普通修改被依赖文件时增量构建应该保留入边', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', "import b from './b'")
    write(root, 'src/b.ts', 'export const b = 1')
    execFileSync('git', ['add', 'src/a.ts', 'src/b.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    write(root, 'src/b.ts', 'export const b = 2')
    const result = await aeGraphBuildTool.execute({ mode: 'incremental' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'impact', file: 'src/b.ts' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { impacted: string[] } }

    expect(parsed.mode).toBe('incremental')
    expect(query.result.impacted).toContain('src/a.ts')
  })
})
