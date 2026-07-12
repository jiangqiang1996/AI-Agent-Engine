import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createGraphRequestFingerprint,
  createUpdatingGraphBuildState,
  evaluateGraphFreshnessBasis,
  normalizeGraphBuildInput,
  readGraphBuildState,
  resolveGraphBuildStatePath,
  writeGraphBuildState,
} from '../../src/services/graph-freshness-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-freshness-'))
  tempRoots.push(root)
  return root
}

function write(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content)
}

function initGit(root: string): void {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'test'], { cwd: root, stdio: 'ignore' })
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('graph-freshness-service', () => {
  it('规则顺序不同应该生成相同指纹', () => {
    const root = createTempRoot()
    initGit(root)

    const first = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'auto',
      effectiveMode: 'full',
      config: { include: ['b', 'a'], exclude: ['d', 'c'] },
    })
    const second = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'auto',
      effectiveMode: 'full',
      config: { include: ['a', 'b'], exclude: ['c', 'd'] },
    })

    expect(createGraphRequestFingerprint(first)).toBe(createGraphRequestFingerprint(second))
  })

  it('旧 active 缺少构建指纹时 freshness 应该降级', () => {
    const root = createTempRoot()
    initGit(root)

    const freshness = evaluateGraphFreshnessBasis({
      worktree: root,
      scopeRoot: '.',
      activeVersionId: 1,
      config: { include: [], exclude: [] },
    })

    expect(freshness.status).toBe('maybe_stale')
    expect(freshness.canUseAsEvidence).toBe(false)
    expect(freshness.message).toContain('低风险定位')
  })

  it('当前输入变化时 freshness 不应该为 fresh', () => {
    const root = createTempRoot()
    initGit(root)
    const input = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    const fingerprint = createGraphRequestFingerprint(input)
    write(root, 'src/a.ts', 'export const a = 1')

    const freshness = evaluateGraphFreshnessBasis({
      worktree: root,
      scopeRoot: '.',
      activeVersionId: 1,
      activeMetadata: { buildInputFingerprint: fingerprint, buildInput: input, completedAt: new Date().toISOString() },
      config: { include: [], exclude: [] },
    })

    expect(freshness.status).toBe('maybe_stale')
    expect(freshness.basis.join('\n')).toContain('当前输入摘要')
  })

  it('同等行数的内容变化也应该改变输入指纹', () => {
    const root = createTempRoot()
    initGit(root)
    write(root, 'src/a.ts', "import './b'\n")
    const first = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    write(root, 'src/a.ts', "import './c'\n")

    const second = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })

    expect(createGraphRequestFingerprint(first)).not.toBe(createGraphRequestFingerprint(second))
  })

  it('运行产物变化不应该改变输入指纹', () => {
    const root = createTempRoot()
    initGit(root)
    const first = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    write(root, 'ae/graphs/graph-build-state.json', '{"status":"completed"}')
    write(root, 'ae/graphs/graph-build-state-0123456789abcdef.json', '{"status":"completed"}')
    write(root, 'ae/screenshot/test.png', '...')

    const second = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })

    expect(createGraphRequestFingerprint(first)).toBe(createGraphRequestFingerprint(second))
  })

  it('有效 updating 状态应该让 freshness 返回 updating', () => {
    const root = createTempRoot()
    initGit(root)
    const input = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    const state = createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: '.',
      requestFingerprint: createGraphRequestFingerprint(input),
      requestSummary: input,
      activeVersionAtStart: 1,
    })
    writeGraphBuildState(root, state)

    const freshness = evaluateGraphFreshnessBasis({
      worktree: root,
      scopeRoot: '.',
      activeVersionId: 1,
      buildState: readGraphBuildState(root, '.'),
      config: { include: [], exclude: [] },
    })

    expect(freshness.status).toBe('updating')
    expect(freshness.canUseAsEvidence).toBe(false)
  })

  it('其他 scope 的 failed 状态不应该污染当前 freshness', () => {
    const root = createTempRoot()
    initGit(root)
    const input = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    const fingerprint = createGraphRequestFingerprint(input)
    const failedState = {
      ...createUpdatingGraphBuildState({
        worktree: root,
        scopeRoot: 'src',
        requestFingerprint: fingerprint,
        requestSummary: input,
      }),
      status: 'failed' as const,
    }

    const freshness = evaluateGraphFreshnessBasis({
      worktree: root,
      scopeRoot: '.',
      activeVersionId: 1,
      activeMetadata: { buildInputFingerprint: fingerprint, buildInput: input, endInputFingerprint: fingerprint },
      buildState: failedState,
      config: { include: [], exclude: [] },
    })

    expect(freshness.status).toBe('fresh')
  })

  it('不同 scope 的 build state 应该写入不同文件', () => {
    const root = createTempRoot()
    initGit(root)
    const rootInput = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: '.',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })
    const srcInput = normalizeGraphBuildInput({
      worktree: root,
      scopeRoot: 'src',
      requestedMode: 'full',
      effectiveMode: 'full',
      config: { include: [], exclude: [] },
    })

    writeGraphBuildState(root, createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: '.',
      requestFingerprint: createGraphRequestFingerprint(rootInput),
      requestSummary: rootInput,
    }))
    writeGraphBuildState(root, createUpdatingGraphBuildState({
      worktree: root,
      scopeRoot: 'src',
      requestFingerprint: createGraphRequestFingerprint(srcInput),
      requestSummary: srcInput,
    }))

    expect(resolveGraphBuildStatePath(root, '.')).not.toBe(resolveGraphBuildStatePath(root, 'src'))
    expect(readGraphBuildState(root, '.')?.scopeRoot).toBe('.')
    expect(readGraphBuildState(root, 'src')?.scopeRoot).toBe('src')
  })
})
