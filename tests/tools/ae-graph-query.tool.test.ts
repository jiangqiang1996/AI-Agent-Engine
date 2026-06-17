import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { ToolContext } from '@opencode-ai/plugin'

import { createGraphStorage } from '../../src/services/graph-storage-service.js'
import {
  createGraphRequestFingerprint,
  createUpdatingGraphBuildState,
  normalizeGraphBuildInput,
  writeGraphBuildState,
} from '../../src/services/graph-freshness-service.js'
import { loadGraphConfig } from '../../src/services/graph-config-service.js'
import { aeGraphQueryTool } from '../../src/tools/ae-graph-query.tool.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-query-'))
  tempRoots.push(root)
  return root
}

function createMockContext(worktree: string, directory = worktree) {
  return {
    worktree,
    directory,
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

function initGitRepo(root: string): void {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' })
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
    const parsed = JSON.parse(result as string) as { result: { dependencies: unknown[] }; queryCost: { indexesUsed: string[] } }

    expect(parsed.result.dependencies).toHaveLength(1)
    expect(parsed.queryCost.indexesUsed).toContain('source-to-relation-chunks')
  })

  it('查询结果应该包含 freshness，旧图谱降级为 maybe_stale', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      freshness: { status: string; canUseAsEvidence: boolean; requiresRefreshFor: string[] }
    }

    expect(parsed.freshness.status).toBe('maybe_stale')
    expect(parsed.freshness.canUseAsEvidence).toBe(false)
    expect(parsed.freshness.requiresRefreshFor).toContain('无影响、无依赖、完整覆盖等高影响结论')
  })

  it('查询结果应该在输入指纹匹配时标记 fresh 且可作为证据', async () => {
    const root = createTempRoot()
    initGitRepo(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), '')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
    const input = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: loadGraphConfig(root),
    })
    const fingerprint = createGraphRequestFingerprint(input)
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [], 'HEAD', [], {
      buildInputFingerprint: fingerprint,
      buildInput: input,
      endInputFingerprint: fingerprint,
      inputChangedDuringBuild: false,
      completedAt: new Date().toISOString(),
    })
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { freshness: { status: string; canUseAsEvidence: boolean } }

    expect(parsed.freshness.status).toBe('fresh')
    expect(parsed.freshness.canUseAsEvidence).toBe(true)
  })

  it('查询结果应该在存在有效构建状态时标记 updating', async () => {
    const root = createTempRoot()
    initGitRepo(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'a.ts'), '')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
    const input = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: loadGraphConfig(root),
    })
    const fingerprint = createGraphRequestFingerprint(input)
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [], 'HEAD', [], {
      buildInputFingerprint: fingerprint,
      buildInput: input,
      endInputFingerprint: fingerprint,
      inputChangedDuringBuild: false,
      completedAt: new Date().toISOString(),
    })
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    storage.closeDatabase()
    writeGraphBuildState(root, createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: '.',
      requestFingerprint: fingerprint,
      requestSummary: input,
      activeVersionAtStart: versionId,
    }))

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { freshness: { status: string; canUseAsEvidence: boolean; buildState?: { status: string } } }

    expect(parsed.freshness.status).toBe('updating')
    expect(parsed.freshness.canUseAsEvidence).toBe(false)
    expect(parsed.freshness.buildState?.status).toBe('updating')
  })

  it('应该在图谱文件不存在时提示先构建', async () => {
    const root = createTempRoot()

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))

    expect(result).toContain('请先执行 ae-graph-build')
    expect(result).toContain('未找到文件关系图谱')
  })

  it('应该在图谱文件损坏时返回可恢复提示', async () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'graphs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'graphs', 'graph.json'), '{broken', 'utf8')

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))

    const parsed = JSON.parse(result as string) as { status: string; diagnostic: { code: string; recoverBy: string } }

    expect(parsed.status).toBe('diagnostic')
    expect(parsed.diagnostic.code).toBe('invalid_json')
    expect(parsed.diagnostic.recoverBy).toContain('ae-graph-build')
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
    const parsed = JSON.parse(result as string) as { scopeRoot: string; versionId: number; status: string }

    expect(parsed.status).toBe('ok')
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

  it('应该按当前目录解析相对路径并返回 worktree 相对结果', async () => {
    const root = createTempRoot()
    seedGraph(root)
    const context = createMockContext(root, join(root, 'src'))

    const result = await aeGraphQueryTool.execute({ mode: 'deps', file: 'a.ts', exclude: ['c.ts'] }, context)
    const pathResult = await aeGraphQueryTool.execute({ mode: 'path', file: 'a.ts', target: 'f.ts' }, context)
    const filterResult = await aeGraphQueryTool.execute({ mode: 'filter', directory: '.' }, context)
    const parsed = JSON.parse(result as string) as { status: string; result: { dependencies: Array<{ targetPath: string }> } }
    const pathParsed = JSON.parse(pathResult as string) as { result: { path: string[] } }
    const filterParsed = JSON.parse(filterResult as string) as { result: { files: Array<{ relativePath: string }> } }

    expect(parsed.status).toBe('ok')
    expect(parsed.result.dependencies).toEqual([
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
    ])
    expect(pathParsed.result.path).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'])
    expect(filterParsed.result.files.map((file) => file.relativePath)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
    ])
  })

  it('应该让 exclude 影响 stats 和 core 结果', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const statsResult = await aeGraphQueryTool.execute({ mode: 'stats', exclude: ['src/b.ts'] }, createMockContext(root))
    const coreResult = await aeGraphQueryTool.execute({ mode: 'core', exclude: ['src/b.ts'] }, createMockContext(root))
    const statsParsed = JSON.parse(statsResult as string) as { result: Record<string, number>; queryCost: { indexesUsed: string[] } }
    const coreParsed = JSON.parse(coreResult as string) as { result: Array<{ path: string; count: number }>; queryCost: { indexesUsed: string[] } }

    expect(statsParsed.result).toEqual({ import: 3 })
    expect(statsParsed.queryCost.indexesUsed).toEqual([])
    expect(coreParsed.result).toEqual([
      { path: 'src/d.ts', count: 1 },
      { path: 'src/e.ts', count: 1 },
      { path: 'src/f.ts', count: 1 },
    ])
    expect(coreParsed.queryCost.indexesUsed).toEqual([])
  })

  it('应该让 v3 relation.type 在 stats 和 filter 中保持一致', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ id: 'symbol:src/a.ts#fn:main', kind: 'symbol', relativePath: 'src/a.ts', fileType: 'source' }])
    storage.insertRelations(versionId, [
      {
        sourceId: 'symbol:src/a.ts#fn:main',
        targetId: 'external:npm:pkg',
        sourcePath: 'src/a.ts',
        targetPath: 'pkg',
        relationType: 'external',
        type: 'call',
      },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const statsResult = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const filterResult = await aeGraphQueryTool.execute({ mode: 'filter', relation_type: 'call' }, createMockContext(root))
    const statsParsed = JSON.parse(statsResult as string) as { result: Record<string, number> }
    const filterParsed = JSON.parse(filterResult as string) as { result: { relations: Array<{ type?: string; relationType: string }> } }

    expect(statsParsed.result).toEqual({ call: 1 })
    expect(filterParsed.result.relations).toEqual([{ sourceId: 'symbol:src/a.ts#fn:main', targetId: 'external:npm:pkg', sourcePath: 'src/a.ts', targetPath: 'pkg', relationType: 'external', type: 'call' }])
  })

  it('core 模式 top 超过索引覆盖时应该回退完整关系计算', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, Array.from({ length: 25 }, (_, index) => ({
      relativePath: `src/${String(index).padStart(2, '0')}.ts`,
      fileType: 'source',
    })))
    storage.insertRelations(versionId, Array.from({ length: 24 }, (_, index) => ({
      sourcePath: 'src/00.ts',
      targetPath: `src/${String(index + 1).padStart(2, '0')}.ts`,
      relationType: 'import',
    })))
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'core', top: 24 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: Array<{ path: string; count: number }> }

    expect(parsed.result).toHaveLength(24)
    expect(parsed.result[23]).toEqual({ path: 'src/24.ts', count: 1 })
  })

  it('应该在 deps 分片同时命中 source 和 target 时去重', async () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src'), { recursive: true })
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src/a.ts', relationType: 'import' },
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/a.ts' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      result: { dependencies: Array<{ targetPath: string }>; dependents: Array<{ sourcePath: string }> }
    }

    expect(parsed.result.dependencies.filter((relation) => relation.targetPath === 'src/a.ts')).toHaveLength(1)
    expect(parsed.result.dependents.filter((relation) => relation.sourcePath === 'src/a.ts')).toHaveLength(1)
  })

  it('文件级查询不应该把 contains 当作文件依赖或循环', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { id: 'file:src/a.ts', kind: 'file', relativePath: 'src/a.ts', fileType: 'source' },
      { id: 'symbol:src/a.ts#function:run:1', kind: 'symbol', relativePath: 'src/a.ts', fileType: 'source', parentId: 'file:src/a.ts', symbolKind: 'function' },
    ])
    storage.insertRelations(versionId, [
      { sourceId: 'file:src/a.ts', targetId: 'symbol:src/a.ts#function:run:1', sourcePath: 'src/a.ts', targetPath: 'src/a.ts', relationType: 'contains', type: 'contains' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const depsResult = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/a.ts' }, createMockContext(root))
    const patternResult = await aeGraphQueryTool.execute({ mode: 'pattern', pattern_type: 'cycle' }, createMockContext(root))
    const healthResult = await aeGraphQueryTool.execute({ mode: 'health' }, createMockContext(root))
    const depsParsed = JSON.parse(depsResult as string) as { result: { dependencies: unknown[]; dependents: unknown[] } }
    const patternParsed = JSON.parse(patternResult as string) as { result: { cycles: string[][] } }
    const healthParsed = JSON.parse(healthResult as string) as { result: { cycles: string[][]; isolatedFiles: string[] } }

    expect(depsParsed.result.dependencies).toEqual([])
    expect(depsParsed.result.dependents).toEqual([])
    expect(patternParsed.result.cycles).toEqual([])
    expect(healthParsed.result.cycles).toEqual([])
    expect(healthParsed.result.isolatedFiles).toEqual(['src/a.ts'])
  })

  it('core 模式不应该把 contains 计数当作文件入度', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { id: 'file:src/a.ts', kind: 'file', relativePath: 'src/a.ts', fileType: 'source' },
      { id: 'file:src/b.ts', kind: 'file', relativePath: 'src/b.ts', fileType: 'source' },
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `symbol:src/a.ts#function:item${index}:1`,
        kind: 'symbol' as const,
        relativePath: 'src/a.ts',
        fileType: 'source' as const,
        parentId: 'file:src/a.ts',
        symbolKind: 'function' as const,
      })),
    ])
    storage.insertRelations(versionId, [
      ...Array.from({ length: 5 }, (_, index) => ({
        sourceId: 'file:src/a.ts',
        targetId: `symbol:src/a.ts#function:item${index}:1`,
        sourcePath: 'src/a.ts',
        targetPath: 'src/a.ts',
        relationType: 'contains' as const,
        type: 'contains' as const,
      })),
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' as const },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'core', top: 1 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: Array<{ path: string; count: number }> }

    expect(parsed.result).toEqual([{ path: 'src/b.ts', count: 1 }])
  })

  it('应该在结果超过 limit 时返回真实截断状态', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'filter', limit: 2 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      result: { files: unknown[]; relations: unknown[] }
      truncation: { truncated: boolean; returnedCount: number; limitApplied: number }
    }

    expect(parsed.result.files).toHaveLength(2)
    expect(parsed.result.relations).toHaveLength(2)
    expect(parsed.truncation.truncated).toBe(true)
    expect(parsed.truncation.returnedCount).toBe(4)
    expect(parsed.truncation.limitApplied).toBe(2)
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

  it('应该限制极大 limit 并返回截断元数据', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, Array.from({ length: 90 }, (_, index) => ({
      relativePath: `src/${index}.ts`,
      fileType: 'source',
    })))
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'filter', limit: 9999 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { files: unknown[] }; truncation: { truncated: boolean; returnedCount: number; limitApplied: number; maxResultItems: number } }

    expect(parsed.result.files).toHaveLength(80)
    expect(parsed.truncation.truncated).toBe(true)
    expect(parsed.truncation.returnedCount).toBe(80)
    expect(parsed.truncation.limitApplied).toBe(80)
    expect(parsed.truncation.maxResultItems).toBe(80)
  })

  it('pattern 模式不应该在结果恰好等于 limit 时误报截断', async () => {
    const root = createTempRoot()
    seedGraph(root)

    const result = await aeGraphQueryTool.execute({ mode: 'pattern', pattern_type: 'long', limit: 1 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { truncation: { truncated: boolean }; result: { longPaths: string[][] } }

    expect(parsed.result.longPaths).toHaveLength(1)
    expect(parsed.truncation.truncated).toBe(false)
  })

  it('health 模式应该返回孤立文件和循环依赖', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    const files = Array.from({ length: 18 }, (_, index) => ({
      relativePath: `src/${index}.ts`,
      fileType: 'source' as const,
    }))
    storage.insertFiles(versionId, files)
    storage.insertRelations(versionId, files.flatMap((source, sourceIndex) => files
      .slice(sourceIndex + 1)
      .map((target) => ({
        sourcePath: source.relativePath,
        targetPath: target.relativePath,
        relationType: 'import' as const,
      }))))
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'health', limit: 5 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      status: string
      result: { cycles: string[][]; isolatedFiles: string[] }
    }

    expect(parsed.status).toBe('ok')
    expect(parsed.result.cycles).toEqual([])
    expect(parsed.result.isolatedFiles).toEqual([])
  })

  it('pattern cycle 模式应该保留循环依赖检测能力', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
      { relativePath: 'src/c.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
      { sourcePath: 'src/b.ts', targetPath: 'src/c.ts', relationType: 'import' },
      { sourcePath: 'src/c.ts', targetPath: 'src/a.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'pattern', pattern_type: 'cycle' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { cycles: string[][] } }

    expect(parsed.result.cycles).toEqual([['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/a.ts']])
  })

  it('stats 快路径在分片缺失时仍应该返回诊断', async () => {
    const root = createTempRoot()
    seedGraph(root)
    const versionDir = join(root, 'ae', 'graphs', 'version-1')
    const chunkFile = readdirSync(versionDir).find((entry) => entry.startsWith('chunk-') && entry.endsWith('.json'))
    if (!chunkFile) {
      throw new Error('测试图谱缺少分片文件')
    }
    rmSync(join(versionDir, chunkFile), { force: true })

    const result = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { status: string; diagnostic: { code: string } }

    expect(parsed.status).toBe('diagnostic')
    expect(parsed.diagnostic.code).toBe('missing_chunk')
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

  it('filter 模式应该按目录过滤关系', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
      { relativePath: 'lib/c.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
      { sourcePath: 'src/a.ts', targetPath: 'lib/c.ts', relationType: 'import' },
      { sourcePath: 'lib/c.ts', targetPath: 'src/b.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'filter', directory: 'src' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { files: Array<{ relativePath: string }>; relations: Array<{ sourcePath: string; targetPath: string }> } }

    expect(parsed.result.files.map((file) => file.relativePath).sort()).toEqual(['src/a.ts', 'src/b.ts'])
    expect(parsed.result.relations).toHaveLength(3)
  })

  it('filter 模式关系应与返回的文件一致', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, Array.from({ length: 10 }, (_, index) => ({
      relativePath: `src/${index}.ts`,
      fileType: 'source',
    })))
    storage.insertRelations(versionId, Array.from({ length: 9 }, (_, index) => ({
      sourcePath: `src/${index}.ts`,
      targetPath: `src/${index + 1}.ts`,
      relationType: 'import' as const,
    })))
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'filter', limit: 3 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { files: Array<{ relativePath: string }>; relations: Array<{ sourcePath: string; targetPath: string }> } }

    const filePaths = new Set(parsed.result.files.map((file) => file.relativePath))
    for (const relation of parsed.result.relations) {
      expect(filePaths.has(relation.sourcePath) || filePaths.has(relation.targetPath)).toBe(true)
    }
  })

  it('impact 模式排除路径不应消耗 limit 预算', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
      { relativePath: 'src/c.ts', fileType: 'source' },
      { relativePath: 'src/d.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src/d.ts', relationType: 'import' },
      { sourcePath: 'src/b.ts', targetPath: 'src/a.ts', relationType: 'import' },
      { sourcePath: 'src/b.ts', targetPath: 'src/d.ts', relationType: 'import' },
      { sourcePath: 'src/c.ts', targetPath: 'src/a.ts', relationType: 'import' },
      { sourcePath: 'src/c.ts', targetPath: 'src/b.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'impact', file: 'src/d.ts', exclude: ['src/b.ts'], limit: 10 }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { impacted: string[] } }

    expect(parsed.result.impacted).not.toContain('src/b.ts')
    expect(parsed.result.impacted).toContain('src/a.ts')
    expect(parsed.result.impacted).toContain('src/c.ts')
  })

  it('deps 模式索引未命中时应回退加载全图而不重复索引查询', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    const files = Array.from({ length: 300 }, (_, index) => ({
      relativePath: `src/${String(index).padStart(3, '0')}.ts`,
      fileType: 'source' as const,
    }))
    storage.insertFiles(versionId, files)
    storage.insertRelations(versionId, [
      { sourcePath: 'src/000.ts', targetPath: 'src/001.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'deps', file: 'src/000.ts' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { status: string; result: { dependencies: unknown[]; dependents: unknown[] } }

    expect(parsed.status).toBe('ok')
    expect(parsed.result.dependencies).toHaveLength(1)
  })

  it('health 模式应始终同时返回循环和孤立文件', async () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/b.ts', fileType: 'source' },
      { relativePath: 'src/orphan.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' },
      { sourcePath: 'src/b.ts', targetPath: 'src/a.ts', relationType: 'import' },
    ])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const result = await aeGraphQueryTool.execute({ mode: 'health' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { result: { cycles: string[][]; isolatedFiles: string[] } }

    expect(parsed.result.cycles.length).toBeGreaterThan(0)
    expect(parsed.result.isolatedFiles).toContain('src/orphan.ts')
  })
})
