import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { isRegularFile } from '../utils/path-utils.js'

import type { GraphConfig } from './graph-config-service.js'
import { getGraphPathDecision } from './graph-filter-suggestion-service.js'
import type { GraphVersionBuildMetadata as StorageGraphVersionBuildMetadata } from './graph-storage-service.js'

export type GraphFreshnessStatus = 'fresh' | 'maybe_stale' | 'stale' | 'updating'
export type GraphBuildLifecycleStatus = 'updating' | 'completed' | 'failed'

export interface GraphBuildInput {
  scopeRoot: string
  depth: 'shallow'
  requestedMode: 'auto' | 'full' | 'incremental'
  effectiveMode: 'full' | 'incremental'
  includeRules: string[]
  excludeRules: string[]
  changedFilesDigest: string
  configDigest: string
  gitHead?: string
  gitStatusDigest?: string
  warning?: string
}

export interface GraphBuildState {
  schemaVersion: 1
  status: GraphBuildLifecycleStatus
  startedAt: string
  updatedAt: string
  completedAt?: string
  worktreeKey: string
  scopeRoot: string
  requestFingerprint: string
  requestSummary: GraphBuildInput
  activeVersionAtStart?: number
  targetVersionId?: number
  processId?: number
  message: string
  recoverBy: string
}

export interface GraphVersionBuildMetadata extends StorageGraphVersionBuildMetadata {
  buildInput?: GraphBuildInput
}

function isGraphBuildInput(value: unknown): value is GraphBuildInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as Partial<GraphBuildInput>
  return typeof candidate.scopeRoot === 'string'
    && candidate.depth === 'shallow'
    && (candidate.requestedMode === 'auto' || candidate.requestedMode === 'full' || candidate.requestedMode === 'incremental')
    && (candidate.effectiveMode === 'full' || candidate.effectiveMode === 'incremental')
    && Array.isArray(candidate.includeRules)
    && Array.isArray(candidate.excludeRules)
    && typeof candidate.changedFilesDigest === 'string'
    && typeof candidate.configDigest === 'string'
}

export interface GraphFreshness {
  status: GraphFreshnessStatus
  activeVersionId?: number
  basis: string[]
  message: string
  requiresRefreshFor: string[]
  canUseAsEvidence: boolean
  buildState?: {
    status: GraphBuildLifecycleStatus
    startedAt: string
    requestFingerprint: string
    equivalentToActive?: boolean
    stale?: boolean
  }
}

const BUILD_STATE_SCHEMA_VERSION = 1
const UPDATING_STALE_MS = 10 * 60 * 1000

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeRules(rules: string[] | undefined): string[] {
  return [...new Set(rules ?? [])].sort((a, b) => a.localeCompare(b))
}

function runGit(worktree: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: worktree,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return undefined
  }
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function isGraphRuntimePath(path: string): boolean {
  const normalizedPath = normalizeGitPath(path)
  return /^ae\/graphs\/graph-build-state(?:-[a-f0-9]{16})?\.json$/.test(normalizedPath)
    || getGraphPathDecision(normalizedPath, { include: [], exclude: [] }).hardExcluded
}

function parseChangedPaths(nameStatus: string, untracked: string): string[] {
  const paths = nameStatus.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const parts = line.split(/\s+/)
    const status = parts[0] ?? ''
    return status.startsWith('R') ? [parts[1], parts[2]].filter(Boolean) : parts[1] ? [parts[1]] : []
  })
  return [...new Set(paths.concat(untracked.split(/\r?\n/).filter(Boolean)).map(normalizeGitPath).filter((path) => !isGraphRuntimePath(path)))].sort((a, b) => a.localeCompare(b))
}

function hashWorktreeFile(worktree: string, path: string): string {
  const absolutePath = join(worktree, path)
  if (!isRegularFile(absolutePath)) {
    return stableHash({ missing: true })
  }
  try {
    return createHash('sha256').update(readFileSync(absolutePath)).digest('hex')
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return stableHash({ missing: true })
    }
    throw error
  }
}

export function createGraphInputDigest(worktree: string): {
  changedFilesDigest: string
  gitHead?: string
  gitStatusDigest?: string
  warning?: string
} {
  const gitHead = runGit(worktree, ['rev-parse', 'HEAD'])
  const nameStatus = runGit(worktree, ['diff', '--name-status', 'HEAD'])
  const untracked = runGit(worktree, ['ls-files', '--others', '--exclude-standard'])
  if (gitHead === undefined || nameStatus === undefined || untracked === undefined) {
    return {
      changedFilesDigest: stableHash({ unavailable: true }),
      warning: '无法读取 Git 输入摘要，图谱 freshness 不能判定为 fresh。',
    }
  }
  const changedPaths = parseChangedPaths(nameStatus, untracked)
  const fileContentDigests = changedPaths.map((path) => ({ path, digest: hashWorktreeFile(worktree, path) }))
  const statusDigestInput = { changedPaths, fileContentDigests }
  return {
    changedFilesDigest: stableHash(statusDigestInput),
    gitHead,
    gitStatusDigest: stableHash(statusDigestInput),
  }
}

export function normalizeGraphBuildInput(args: {
  worktree: string
  scopeRoot: string
  depth?: 'shallow'
  requestedMode: 'auto' | 'full' | 'incremental'
  effectiveMode: 'full' | 'incremental'
  config: GraphConfig
}): GraphBuildInput {
  const digest = createGraphInputDigest(args.worktree)
  const includeRules = normalizeRules(args.config.include)
  const excludeRules = normalizeRules(args.config.exclude)
  const configDigest = stableHash({ includeRules, excludeRules })
  return {
    scopeRoot: args.scopeRoot,
    depth: args.depth ?? 'shallow',
    requestedMode: args.requestedMode,
    effectiveMode: args.effectiveMode,
    includeRules,
    excludeRules,
    changedFilesDigest: digest.changedFilesDigest,
    configDigest,
    gitHead: digest.gitHead,
    gitStatusDigest: digest.gitStatusDigest,
    warning: digest.warning,
  }
}

export function createGraphRequestFingerprint(input: GraphBuildInput): string {
  return stableHash(input)
}

function getBuildStateFileName(scopeRoot: string): string {
  if (scopeRoot === '.') {
    return 'graph-build-state.json'
  }
  return `graph-build-state-${stableHash(scopeRoot).slice(0, 16)}.json`
}

export function resolveGraphBuildStatePath(worktree: string, scopeRoot = '.'): string {
  return join(resolve(worktree), docsAePath(DOCS_AE_SUBDIRS.GRAPHS), getBuildStateFileName(scopeRoot))
}

export function readGraphBuildState(worktree: string, scopeRoot = '.'): GraphBuildState | undefined {
  const path = resolveGraphBuildStatePath(worktree, scopeRoot)
  if (!isRegularFile(path)) {
    return undefined
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    const candidate = parsed as Partial<GraphBuildState>
    if (candidate.schemaVersion !== BUILD_STATE_SCHEMA_VERSION || !candidate.status || !candidate.requestFingerprint) {
      return undefined
    }
    return candidate as GraphBuildState
  } catch {
    return undefined
  }
}

export function writeGraphBuildState(worktree: string, state: GraphBuildState): void {
  const path = resolveGraphBuildStatePath(worktree, state.scopeRoot)
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(tempPath, path)
}

export function clearGraphBuildState(worktree: string, scopeRoot = '.'): void {
  rmSync(resolveGraphBuildStatePath(worktree, scopeRoot), { force: true })
}

export function createUpdatingGraphBuildState(args: {
  worktree: string
  scopeRoot: string
  requestFingerprint: string
  requestSummary: GraphBuildInput
  activeVersionAtStart?: number
}): GraphBuildState {
  const now = new Date().toISOString()
  return {
    schemaVersion: BUILD_STATE_SCHEMA_VERSION,
    status: 'updating',
    startedAt: now,
    updatedAt: now,
    worktreeKey: '.',
    scopeRoot: args.scopeRoot,
    requestFingerprint: args.requestFingerprint,
    requestSummary: args.requestSummary,
    activeVersionAtStart: args.activeVersionAtStart,
    processId: process.pid,
    message: '图谱正在构建，查询会继续使用最后一个完整 active version。',
    recoverBy: '等待当前构建完成；若确认构建已终止，可删除 ae/graphs/graph-build-state.json 后重试。',
  }
}

export function isGraphBuildStateStale(state: GraphBuildState): boolean {
  if (state.status !== 'updating') {
    return false
  }
  const timestamp = Date.parse(state.updatedAt || state.startedAt)
  return Number.isNaN(timestamp) || Date.now() - timestamp > UPDATING_STALE_MS
}

export function evaluateGraphFreshnessBasis(args: {
  worktree: string
  scopeRoot: string
  activeVersionId?: number
  activeMetadata?: StorageGraphVersionBuildMetadata
  buildState?: GraphBuildState
  config: GraphConfig
}): GraphFreshness {
  const basis: string[] = []
  const requiresRefreshFor = ['无影响、无依赖、完整覆盖等高影响结论']
  const state = args.buildState
  const stateStale = state ? isGraphBuildStateStale(state) : false
  if (state?.status === 'updating' && !stateStale && state.scopeRoot === args.scopeRoot) {
    return {
      status: 'updating',
      activeVersionId: args.activeVersionId,
      basis: ['检测到有效构建中状态，查询继续使用旧 active version。'],
      message: '图谱正在更新；当前查询结果来自最后一个完整 active version，只能作为定位线索。',
      requiresRefreshFor,
      canUseAsEvidence: false,
      buildState: {
        status: state.status,
        startedAt: state.startedAt,
        requestFingerprint: state.requestFingerprint,
        equivalentToActive: state.requestFingerprint === args.activeMetadata?.buildInputFingerprint,
        stale: false,
      },
    }
  }
  const activeBuildInput = isGraphBuildInput(args.activeMetadata?.buildInput) ? args.activeMetadata.buildInput : undefined
  if (!args.activeMetadata?.buildInputFingerprint || !activeBuildInput) {
    return {
      status: 'maybe_stale',
      activeVersionId: args.activeVersionId,
      basis: ['active version 缺少构建输入指纹，无法证明新鲜。'],
      message: '图谱可用于低风险定位，但不能作为无影响或无依赖结论的最终证据。',
      requiresRefreshFor,
      canUseAsEvidence: false,
      buildState: state ? {
        status: state.status,
        startedAt: state.startedAt,
        requestFingerprint: state.requestFingerprint,
        stale: stateStale,
      } : undefined,
    }
  }
  if (args.activeMetadata.inputChangedDuringBuild) {
    basis.push('构建开始和结束输入指纹不一致。')
  }
  const currentInput = normalizeGraphBuildInput({
    worktree: args.worktree,
    scopeRoot: args.scopeRoot,
    requestedMode: activeBuildInput.requestedMode,
    effectiveMode: activeBuildInput.effectiveMode,
    config: args.config,
  })
  if (currentInput.warning) {
    basis.push(currentInput.warning)
  }
  const currentFingerprint = createGraphRequestFingerprint(currentInput)
  const activeFingerprint = args.activeMetadata.endInputFingerprint ?? args.activeMetadata.buildInputFingerprint
  if (currentFingerprint !== activeFingerprint) {
    basis.push('当前输入摘要与 active version 构建输入不一致。')
  }
  const stateMatchesScope = state?.scopeRoot === args.scopeRoot
  if (state?.status === 'failed' && stateMatchesScope) {
    basis.push('最近一次图谱构建失败。')
  }
  if (stateStale && stateMatchesScope) {
    basis.push('构建中状态已过期。')
  }
  if (basis.length === 0) {
    return {
      status: 'fresh',
      activeVersionId: args.activeVersionId,
      basis: ['当前输入摘要与 active version 构建输入一致。'],
      message: '图谱 freshness 已验证为 fresh。',
      requiresRefreshFor: [],
      canUseAsEvidence: true,
      buildState: state ? {
        status: state.status,
        startedAt: state.startedAt,
        requestFingerprint: state.requestFingerprint,
        equivalentToActive: state.requestFingerprint === activeFingerprint,
        stale: false,
      } : undefined,
    }
  }
  return {
    status: state?.status === 'failed' && stateMatchesScope ? 'stale' : 'maybe_stale',
    activeVersionId: args.activeVersionId,
    basis,
    message: '图谱新鲜度无法证明；结果仅可作为定位线索。',
    requiresRefreshFor,
    canUseAsEvidence: false,
    buildState: state ? {
      status: state.status,
      startedAt: state.startedAt,
      requestFingerprint: state.requestFingerprint,
      equivalentToActive: state.requestFingerprint === activeFingerprint,
      stale: stateStale,
    } : undefined,
  }
}
