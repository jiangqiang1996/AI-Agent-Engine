import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { ToolContext } from '@opencode-ai/plugin/tool'

import { createGraphStorage } from '../../src/services/graph-storage-service.js'
import { aeGraphQueryTool } from '../../src/tools/ae-graph-query.tool.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-query-'))
  tempRoots.push(root)
  return root
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
  } as unknown as ToolContext
}

function seedGraph(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.ts'), '')
  writeFileSync(join(root, 'src', 'b.ts'), '')
  const storage = createGraphStorage(root)
  const versionId = storage.createVersion(root, '.', [])
  storage.insertFiles(versionId, [
    { relativePath: 'src/a.ts', fileType: 'source' },
    { relativePath: 'src/b.ts', fileType: 'source' },
    { relativePath: 'src/c.ts', fileType: 'source' },
    { relativePath: 'src/d.ts', fileType: 'source' },
    { relativePath: 'src/e.ts', fileType: 'source' },
    { relativePath: 'src/f.ts', fileType: 'source' },
  ])
  storage.insertRelations(versionId, [
    { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
    { sourcePath: 'src/b.ts', targetPath: 'src/c.ts', relationType: 'import' },
    { sourcePath: 'src/c.ts', targetPath: 'src/d.ts', relationType: 'import' },
    { sourcePath: 'src/d.ts', targetPath: 'src/e.ts', relationType: 'import' },
    { sourcePath: 'src/e.ts', targetPath: 'src/f.ts', relationType: 'import' },
  ])
  storage.activateVersion(versionId)
  storage.closeDatabase()
}

function seedScopedGraph(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.ts'), '')
  const storage = createGraphStorage(root)
  const versionId = storage.createVersion(root, 'src', [])
  storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
  storage.activateVersion(versionId)
  storage.closeDatabase()
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-graph-query 工具', () => {
  it('应该查询 deps 模式', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/a.ts' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { dependencies: unknown[] } }

    expect(parsed.result.dependencies).toHaveLength(1)
  })

  it('应该在数据库不存在时提示先构建', async () => {
    const root = createTempRoot()

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))

    expect(result).toContain('请先执行 ae-graph-build')
    expect(result).toContain('未找到文件关系图谱')
  })

  it('应该拒绝越界路径参数', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'deps', file: '../x.ts' }, createMockContext(root))

    expect(result).toContain('路径不在当前工作区内')
  })

  it('应该按 scope 查询 target 构建的图谱', async () => {
    const root = createTempRoot()
    seedScopedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'stats', scope: 'src' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { scopeRoot: string; versionId: number }

    expect(parsed.scopeRoot).toBe('src')
    expect(parsed.versionId).toBeGreaterThan(0)
  })

  it('应该使用目录边界筛选文件', async () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src-other'), { recursive: true })
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src-other/a.ts', fileType: 'source' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'filter', directory: 'src' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { files: Array<{ relativePath: string }> } }

    expect(parsed.result.files.map((file) => file.relativePath)).toEqual(['src/a.ts'])
  })

  it('core 模式不应该把目录节点识别为核心模块', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src', fileType: 'directory' },
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src', relationType: 'directory' },
      { sourcePath: 'src/b.ts', targetPath: 'src', relationType: 'directory' },
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'core', top: 1 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: Array<{ path: string; count: number }> }

    expect(parsed.result).toEqual([{ path: 'src/b.ts', count: 1 }])
  })

  it('应该查询 impact、path、core 和 pattern 模式', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const impactResult = await aeGraphQueryTool.execute({ mode: 'impact', file: 'src/f.ts' }, createMockContext(root))
    const pathResult = await aeGraphQueryTool.execute({ mode: 'path', file: 'src/a.ts', target: 'src/f.ts' }, createMockContext(root))
    const coreResult = await aeGraphQueryTool.execute({ mode: 'core', top: 1 }, createMockContext(root))
    const patternResult = await aeGraphQueryTool.execute({ mode: 'pattern', pattern_type: 'long' }, createMockContext(root))

    const impactParsed = JSON.parse(impactResult as string) as { result: { impacted: string[] } }
    const pathParsed = JSON.parse(pathResult as string) as { result: { path: string[] } }
    const coreParsed = JSON.parse(coreResult as string) as { result: Array<{ path: string; count: number }> }
    const patternParsed = JSON.parse(patternResult as string) as { result: { longPaths: string[][] } }

    expect(impactParsed.result.impacted).toContain('src/a.ts')
    expect(pathParsed.result.path).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'])
    expect(coreParsed.result[0].count).toBe(1)
    expect(patternParsed.result.longPaths[0]).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'])
  })
})
