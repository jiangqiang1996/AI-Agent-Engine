import { existsSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { ToolContext } from '@opencode-ai/plugin'

import { aeGraphBuildTool } from '../../src/tools/ae-graph-build.tool.js'
import { aeGraphQueryTool } from '../../src/tools/ae-graph-query.tool.js'
import {
  createGraphRequestFingerprint,
  createUpdatingGraphBuildState,
  normalizeGraphBuildInput,
  writeGraphBuildState,
} from '../../src/services/graph-freshness-service.js'
import { loadGraphConfig } from '../../src/services/graph-config-service.js'
import {
  GRAPH_BUILD_STATE_BASE,
  cleanupTempRoots,
  createAllowExcludeContext,
  createCaptureAskContext,
  createMockContext,
  createTempRoot,
  previewIndexReferencesExistingAssets,
  write,
} from './graph-build-fixture.js'

afterEach(cleanupTempRoots)

describe('ae-graph-build 工具', () => {
  it('应该全量构建 fixture 项目的图谱', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import x from './b'")
    write(root, 'src/b.ts', 'export const b = 1')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      mode: string
      parsedNodes: number
      activeFiles: number
      activeNodes: number
      relations: number
      parserStats: unknown[]
      preview: string
      freshness: { status: string; canUseAsEvidence: boolean }
      buildInputFingerprint: string
      endInputFingerprint: string
    }

    expect(parsed.mode).toBe('full')
    expect(parsed.parsedNodes).toBeGreaterThan(0)
    expect(parsed.activeFiles).toBeGreaterThan(0)
    expect(parsed.activeNodes).toBe(parsed.parsedNodes)
    expect(parsed.relations).toBeGreaterThan(0)
    expect(parsed.parserStats).toEqual([])
    expect(['fresh', 'maybe_stale']).toContain(parsed.freshness.status)
    expect(parsed.freshness.canUseAsEvidence).toBe(parsed.freshness.status === 'fresh')
    expect(parsed.buildInputFingerprint).toBe(parsed.endInputFingerprint)
    expect(parsed.preview).toBe('ae/graphs/index.html')
    expect(existsSync(join(root, 'ae', 'graphs', 'index.html'))).toBe(true)
    expect(previewIndexReferencesExistingAssets(root)).toBe(true)
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
    const parsed = JSON.parse(result as string) as { mode: string; activeNodes: number }

    expect(parsed.mode).toBe('full')
    expect(parsed.activeNodes).toBeGreaterThan(0)
  })

  it('应该在创建图谱产物时不请求文件授权', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { database: string }

    expect(asked).toEqual([])
    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json'))).toBe(true)
  })

  it('应该在没有 ask 能力时仍写入图谱文件', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    const ctx = createMockContext(root) as unknown as Record<string, unknown>
    delete ctx.ask

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx as unknown as ToolContext)
    const parsed = JSON.parse(result as string) as { database: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json'))).toBe(true)
  })

  it('应该在构建结果中返回被跳过文件的明细', async () => {
    const root = createTempRoot()
    write(root, 'src/large.ts', 'x'.repeat((10 * 1024 * 1024) + 1))
    write(root, 'src/small.ts', 'export const small = 1')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      failedFiles: number
      failedFileDetails: unknown[]
      skippedFiles: number
      skippedFileDetails: Array<{ path: string; reason: string; sizeBytes: number }>
      warnings: string[]
    }

    expect(parsed.failedFiles).toBe(0)
    expect(parsed.failedFileDetails).toEqual([])
    expect(parsed.skippedFiles).toBe(1)
    expect(parsed.skippedFileDetails).toEqual([
      { path: 'src/large.ts', reason: '文件超过 10485760 字节上限', sizeBytes: (10 * 1024 * 1024) + 1 },
    ])
    expect(parsed.warnings).toContain('已跳过超大文件：src/large.ts - 文件超过 10485760 字节上限')
  })

  it('应该在用户拒绝时保留锁文件并取消构建', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/.opencode", "ae/graphs"] } }')
    const ctx = {
      ...createMockContext(root),
      ask: () => {
        throw new Error('denied')
      },
    } as unknown as ToolContext

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)

    expect(result).toContain('图谱存储正在被其他进程写入')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(true)
  })

  it('应该在用户确认后清理残留锁并重新构建', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, 'ae/graphs/graph-build-state.json', JSON.stringify({
      ...GRAPH_BUILD_STATE_BASE,
      status: 'failed',
      message: '失败',
      recoverBy: '重试',
    }))
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["ae/graphs"] } }')
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { database: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
    expect(JSON.stringify(asked)).toContain('清理残留锁')
    expect(JSON.stringify(asked)).not.toContain('强制覆盖锁文件')
  })

  it('应该在 completed 状态存在残留锁时允许用户确认后恢复', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, 'ae/graphs/graph-build-state.json', JSON.stringify({
      ...GRAPH_BUILD_STATE_BASE,
      status: 'completed',
      completedAt: new Date().toISOString(),
      targetVersionId: 1,
      message: '已完成',
      recoverBy: '无需恢复',
    }))
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { database: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
    expect(JSON.stringify(asked)).toContain('清理残留锁')
  })

  it('应该用默认 scope 的 completed 状态恢复跨 scope 残留锁', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, 'ae/graphs/graph-build-state.json', JSON.stringify({
      ...GRAPH_BUILD_STATE_BASE,
      status: 'completed',
      completedAt: new Date().toISOString(),
      targetVersionId: 1,
      message: '默认 scope 已完成',
      recoverBy: '无需恢复',
    }))
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ target: 'src', mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { database: string; scopeRoot: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(parsed.scopeRoot).toBe('src')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
    expect(JSON.stringify(asked)).toContain('清理残留锁')
  })

  it('不应该在缺少残留构建状态时清理可能活跃的锁', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)

    expect(result).toContain('图谱存储正在被其他进程写入')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(true)
    expect(asked).toEqual([])
  })

  it('不应该清理未过期 updating 状态对应的残留锁', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, 'ae/graphs/graph-build-state.json', JSON.stringify({
      ...GRAPH_BUILD_STATE_BASE,
      status: 'updating',
      message: '构建中',
      recoverBy: '稍后重试',
    }))
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { status: string; message: string }

    expect(parsed.status).toBe('updating')
    expect(parsed.message).toContain('已有其他图谱构建正在进行')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(true)
    expect(asked).toEqual([])
  })

  it('应该在过期 updating 状态存在残留锁时允许用户确认后恢复', async () => {
    const root = createTempRoot()
    const staleTime = new Date(Date.now() - 11 * 60 * 1000).toISOString()
    write(root, 'src/a.ts', '')
    write(root, 'ae/graphs/graph.json.lock', 'other\n')
    write(root, 'ae/graphs/graph-build-state.json', JSON.stringify({
      ...GRAPH_BUILD_STATE_BASE,
      status: 'updating',
      startedAt: staleTime,
      updatedAt: staleTime,
      message: '构建中',
      recoverBy: '确认后恢复',
    }))
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { database: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
    expect(JSON.stringify(asked)).toContain('清理残留锁')
  })

  it('应该返回相对图谱文件路径和预览文件路径', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { database: string; preview: string }

    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(parsed.preview).toBe('ae/graphs/index.html')
  })

  it('Git diff 无变更时应该跳过增量构建并返回图谱文件路径', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { message: string; database: string; preview: string }

    expect(parsed.message).toContain('图谱无需更新')
    expect(parsed.database).toBe('ae/graphs/graph.json')
    expect(parsed.preview).toBe('ae/graphs/index.html')
    expect(existsSync(join(root, 'ae', 'graphs', 'index.html'))).toBe(true)
    expect(previewIndexReferencesExistingAssets(root)).toBe(true)
    expect(existsSync(join(root, 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
  }, 30000)

  it('仅运行产物变化时不应该触发全量重建', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    write(root, 'ae/screenshot/page.png', 'image')
    write(root, 'ae/reviews/run/metadata.json', '{}')
    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { message: string; mode: string }

    expect(parsed.mode).toBe('incremental')
    expect(parsed.message).toContain('图谱无需更新')
  })

  it('应该在 auto 增量构建进行中复用等价请求', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 2')
    const requestSummary = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'auto',
      effectiveMode: 'incremental',
      config: loadGraphConfig(root),
    })
    writeGraphBuildState(root, createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: '.',
      requestFingerprint: createGraphRequestFingerprint(requestSummary),
      requestSummary,
    }))

    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { status: string; reusedExistingBuild: boolean }

    expect(parsed.status).toBe('updating')
    expect(parsed.reusedExistingBuild).toBe(true)
  }, 30000)

  it('不应该复用非等价的进行中构建请求', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 2')
    const requestSummary = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'auto',
      effectiveMode: 'incremental',
      config: { ...loadGraphConfig(root), exclude: ['src/**'] },
    })
    writeGraphBuildState(root, createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: '.',
      requestFingerprint: createGraphRequestFingerprint(requestSummary),
      requestSummary,
    }))

    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { status: string; reusedExistingBuild: boolean; message: string }

    expect(parsed.status).toBe('updating')
    expect(parsed.reusedExistingBuild).toBe(false)
    expect(parsed.message).toContain('已有其他图谱构建正在进行')
  }, 30000)

  it('大图谱应写入分片文件并在查询时返回 summary', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    for (let index = 0; index < 260; index += 1) {
      write(root, `src/file-${index}.ts`, `export const value${index} = ${index}`)
    }
    execFileSync('git', ['add', 'src'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { activeNodes: number }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'stats' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { summary: { chunkIds: string[] } }

    expect(parsed.activeNodes).toBeGreaterThan(0)
    expect(existsSync(join(root, 'ae', 'graphs', 'version-1'))).toBe(true)
    expect(query.summary.chunkIds.length).toBeGreaterThan(0)
  }, 60000)

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

    const { rmSync } = await import('node:fs')
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
    const parsed = JSON.parse(result as string) as { mode: string; activeFiles?: number; activeNodes?: number; activeRelations?: number }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'impact', file: 'src/b.ts' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { impacted: string[] } }

    expect(parsed.mode).toBe('incremental')
    expect(parsed.activeFiles).toBeGreaterThanOrEqual(2)
    expect(parsed.activeNodes).toBeGreaterThanOrEqual(2)
    expect(parsed.activeRelations).toBeGreaterThanOrEqual(1)
    expect(query.result.impacted).toContain('src/a.ts')
  })

  it('过滤规则变化时应该回退全量构建', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    write(root, 'dist/keep.ts', 'export const keep = 1')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/dist"] } }')
    execFileSync('git', ['add', 'src/a.ts', 'dist/keep.ts', '.opencode/ae.jsonc'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    write(root, '.opencode/ae.jsonc', '{ "graph": { "include": ["dist/keep.ts"], "exclude": ["**/dist"] } }')
    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string; modeReason: string }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'filter' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { files: Array<{ relativePath: string }> } }

    expect(parsed.mode).toBe('full')
    expect(parsed.modeReason).toContain('图谱过滤规则变化')
    expect(query.result.files.some((file) => file.relativePath === 'dist/keep.ts')).toBe(true)
  }, 30000)

  it('过滤规则仅顺序变化时不应该回退全量构建', async () => {
    const root = createTempRoot()
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
    write(root, 'src/a.ts', 'export const a = 1')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/dist", "**/build"] } }')
    execFileSync('git', ['add', 'src/a.ts', '.opencode/ae.jsonc'], { cwd: root, stdio: 'ignore' })
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'test'], { cwd: root, stdio: 'ignore' })
    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))

    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/build", "**/dist"] } }')
    const result = await aeGraphBuildTool.execute({ mode: 'auto' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { mode: string; modeReason?: string }

    expect(parsed.mode).toBe('incremental')
    expect(parsed.modeReason).toBe('仅检测到可安全增量刷新的修改文件')
  })
})
