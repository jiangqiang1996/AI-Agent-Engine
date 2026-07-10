import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync, type Dirent } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL, SKILL, skillDir } from '../schemas/ae-asset-schema.js'
import {
  loadGraphConfig,
  updateGraphRulesInProjectConfig,
  type GraphConfig,
} from '../services/graph-config-service.js'
import { createGraphStorage } from '../services/graph-storage-service.js'
import { createRuntimeAssetManifest } from '../services/runtime-asset-manifest.js'
import { collectGraphFiles, parseFileRelations } from '../services/graph-parse-service.js'
import {
  createGraphRequestFingerprint,
  createUpdatingGraphBuildState,
  evaluateGraphFreshnessBasis,
  isGraphBuildStateStale,
  normalizeGraphBuildInput,
  readGraphBuildState,
  writeGraphBuildState,
  type GraphBuildInput,
  type GraphBuildState,
} from '../services/graph-freshness-service.js'
import {
  collectGraphFilterCandidateSummary,
  collectGraphFilterSuggestionsFromSummary,
  getGraphPathDecision,
  type GraphFilterCandidateSummary,
} from '../services/graph-filter-suggestion-service.js'
import { appendGraphUsageRecord } from '../services/graph-usage-logger.js'
import { isInsideRoot, pathContainsSymlink, resolvePathWithBase, toPosixPath } from '../utils/path-utils.js'
import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { ARTIFACT_STAGE } from '../services/graph/build-stage.js'
import { detectToolchain } from '../services/graph/toolchain-profile.js'
import { generateQueryIndex } from '../services/graph/graph-query-index.js'

interface GraphFilterDecisions {
  include?: string[]
  exclude?: string[]
}

interface SavedGraphFilterDecisions {
  savedIncludes: string[]
  savedExcludes: string[]
  warning?: string
}

function copyGraphPreview(worktree: string): void {
  const manifest = createRuntimeAssetManifest(import.meta.url)
  const refDir = join(manifest.skillsDir, skillDir(SKILL.GRAPH_BUILD), 'references')
  const targetDir = join(worktree, docsAePath(DOCS_AE_SUBDIRS.GRAPHS))

  function copyDir(src: string, dest: string): void {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true })
    }
    let entries: Dirent[]
    try {
      entries = readdirSync(src, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const srcPath = join(src, entry.name)
      const destPath = join(dest, entry.name)
      try {
        if (entry.isDirectory()) {
          copyDir(srcPath, destPath)
        } else if (entry.isFile()) {
          copyFileSync(srcPath, destPath)
        }
      } catch {
        // 单个文件复制失败不阻断后续文件
      }
    }
  }

  copyDir(refDir, targetDir)
}

function writeQueryIndex(worktree: string, scopeRoot: string, storage: ReturnType<typeof createGraphStorage>): void {
  const active = storage.getActiveVersion(worktree, scopeRoot)
  if (!active) {
    return
  }
  const index = generateQueryIndex(active.files, active.relations)
  const targetDir = join(worktree, docsAePath(DOCS_AE_SUBDIRS.GRAPHS))
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }
  writeFileSync(join(targetDir, 'query-index.json'), JSON.stringify(index, null, 2))
}

function isGraphRuntimeFile(filePath: string): boolean {
  return getGraphPathDecision(filePath, { include: [], exclude: [] }).hardExcluded
}

function mergeGraphRules(config: GraphConfig, args: { include?: string[]; exclude?: string[] }): GraphConfig {
  return {
    include: [...new Set([...(config.include ?? []), ...(args.include ?? [])])],
    exclude: [...new Set([...config.exclude, ...(args.exclude ?? [])])],
  }
}

function graphRulesChanged(active: { includeRules?: string[]; excludeRules?: string[] } | undefined, config: GraphConfig): boolean {
  if (!active) {
    return false
  }
  return JSON.stringify(normalizeRuleSet(active.includeRules ?? [])) !== JSON.stringify(normalizeRuleSet(config.include ?? []))
    || JSON.stringify(normalizeRuleSet(active.excludeRules ?? [])) !== JSON.stringify(normalizeRuleSet(config.exclude))
}

function normalizeRuleSet(rules: string[]): string[] {
  return [...new Set(rules)].sort((a, b) => a.localeCompare(b))
}

function hasOnlyModifiedFiles(diff: { files: string[]; hasStructuralChange?: boolean; warning?: string }): boolean {
  return !diff.warning && !diff.hasStructuralChange && diff.files.length > 0
}

function formatBuildStateReuse(state: GraphBuildState, equivalent: boolean): string {
  return JSON.stringify({
    status: 'updating',
    reusedExistingBuild: equivalent,
    scopeRoot: state.scopeRoot,
    requestFingerprint: state.requestFingerprint,
    startedAt: state.startedAt,
    message: equivalent ? '等价图谱构建已在进行中，复用当前构建状态。' : '已有其他图谱构建正在进行，请稍后重试。',
    recoverBy: state.recoverBy,
    freshness: {
      status: 'updating',
      message: '构建完成前查询会继续使用最后一个完整 active version。',
      canUseAsEvidence: false,
    },
    database: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/graph.json`,
    preview: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/index.html`,
    tool: TOOL.AE_GRAPH_BUILD,
  }, null, 2)
}

function isEquivalentBuildRequest(state: GraphBuildState, input: GraphBuildInput): boolean {
  return state.requestFingerprint === createGraphRequestFingerprint(input)
    || (
      state.scopeRoot === input.scopeRoot
      && state.requestSummary.requestedMode === input.requestedMode
      && state.requestSummary.depth === input.depth
      && state.requestSummary.changedFilesDigest === input.changedFilesDigest
      && state.requestSummary.configDigest === input.configDigest
      && state.requestSummary.gitHead === input.gitHead
      && state.requestSummary.gitStatusDigest === input.gitStatusDigest
    )
}

function markBuildCompleted(state: GraphBuildState, targetVersionId: number): GraphBuildState {
  const now = new Date().toISOString()
  return {
    ...state,
    status: 'completed',
    updatedAt: now,
    completedAt: now,
    targetVersionId,
    message: '图谱构建完成。',
    recoverBy: '无需恢复。',
  }
}

function getChangedFiles(worktree: string): { files: string[]; hasStructuralChange?: boolean; warning?: string } {
  try {
    const options = { cwd: worktree, encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] } as const
    const changedOutput = execFileSync('git', ['diff', '--name-status', 'HEAD'], options)
    const untrackedOutput = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], options)
    let hasStructuralChange = false
    const files = changedOutput.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      const parts = line.split(/\s+/)
      const status = parts[0] ?? ''
      const paths = status.startsWith('R') ? [parts[1], parts[2]].filter(Boolean) : parts[1] ? [parts[1]] : []
      const relevantPaths = paths.map(toPosixPath).filter((filePath) => !isGraphRuntimeFile(filePath))
      if (status.startsWith('A') || status.startsWith('D') || status.startsWith('R')) {
        hasStructuralChange = hasStructuralChange || relevantPaths.length > 0
      }
      if (status.startsWith('R')) {
        return relevantPaths
      }
      return relevantPaths
    })
    const untrackedFiles = untrackedOutput.split(/\r?\n/).filter(Boolean).map(toPosixPath).filter((filePath) => !isGraphRuntimeFile(filePath))
    return { files: [...new Set(files.concat(untrackedFiles).map(toPosixPath))], hasStructuralChange: hasStructuralChange || untrackedFiles.length > 0 }
  } catch {
    return { files: [], warning: '当前目录不是 Git 工作区或无法读取 Git diff，已降级为全量构建' }
  }
}

function filterChangedFiles(files: string[], config: GraphConfig): string[] {
  return files.filter((file) => !getGraphPathDecision(file, config).excluded)
}

function normalizeFilterDecisionRules(decisions: GraphFilterDecisions | undefined): Required<GraphFilterDecisions> {
  return {
    include: [...new Set(decisions?.include ?? [])],
    exclude: [...new Set(decisions?.exclude ?? [])],
  }
}

async function persistGraphFilterDecisions(
  worktree: string,
  decisions: GraphFilterDecisions | undefined,
  ctx: { ask?: unknown },
): Promise<SavedGraphFilterDecisions> {
  const normalized = normalizeFilterDecisionRules(decisions)
  if (normalized.include.length === 0 && normalized.exclude.length === 0) {
    return { savedIncludes: [], savedExcludes: [] }
  }
  if (typeof ctx.ask !== 'function') {
    return { savedIncludes: [], savedExcludes: [], warning: '当前环境没有 ask 能力，未持久化 filterDecisions。' }
  }

  try {
    await ctx.ask({
      permission: 'file',
      patterns: [resolve(worktree, '.opencode', 'ae.jsonc')],
      always: [],
      metadata: {
        action: '确认后将用户明确选择的图谱过滤规则保存到项目级 graph.include / graph.exclude',
        include: normalized.include,
        exclude: normalized.exclude,
      },
    })
    updateGraphRulesInProjectConfig(worktree, {
      appendInclude: normalized.include,
      appendExclude: normalized.exclude,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { savedIncludes: [], savedExcludes: [], warning: `filterDecisions 未持久化：${message}` }
  }
  return { savedIncludes: normalized.include, savedExcludes: normalized.exclude }
}

async function collectFilterDecisionWarnings(
  worktree: string,
  config: GraphConfig,
  ctx: { ask?: unknown },
  filterCandidateSummary: GraphFilterCandidateSummary,
): Promise<string[]> {
  const missing = collectGraphFilterSuggestionsFromSummary(filterCandidateSummary, config)
  if (missing.length === 0) {
    return []
  }

  if (typeof ctx.ask === 'function') {
    try {
      await ctx.ask({
        permission: 'file',
        patterns: [resolve(worktree, '.opencode', 'ae.jsonc')],
        always: [],
        metadata: {
          action: '检测到实际存在且明显应纳入 graph.include 或 graph.exclude 的候选；请明确选择 include、exclude 或跳过后通过 filterDecisions 再次调用',
          suggestions: missing.map((suggestion) => ({
            group: suggestion.group,
            value: suggestion.value,
            count: suggestion.count,
            examples: suggestion.examples,
            suggestedRule: suggestion.suggestedRule,
            existingRulesCovered: suggestion.covered,
            uncoveredReason: suggestion.uncoveredReason,
            reason: suggestion.reason,
          })),
        },
      })
    } catch {
      return []
    }
  }

  return missing.map((suggestion) => `过滤候选未持久化：${suggestion.value} 建议规则 ${suggestion.suggestedRule}，原因：${suggestion.reason}`)
}

async function confirmStaleLockRecovery(worktree: string, scopeRoot: string, ctx: { ask?: unknown }): Promise<boolean> {
  if (typeof ctx.ask !== 'function') {
    return false
  }

  const state = readGraphBuildState(worktree, scopeRoot) ?? (scopeRoot === '.' ? undefined : readGraphBuildState(worktree, '.'))
  if (state?.status !== 'failed' && state?.status !== 'completed' && !(state?.status === 'updating' && isGraphBuildStateStale(state))) {
    return false
  }

  try {
    await ctx.ask({
      permission: 'file',
      patterns: [resolve(worktree, docsAePath(DOCS_AE_SUBDIRS.GRAPHS), 'graph.json.lock')],
      always: [],
      metadata: {
        action: '检测到图谱锁文件存在；确认上次构建已意外终止后，将清理残留锁并重新构建',
        suggestion: '仅在确认没有其他 ae-graph-build 正在运行时继续；否则取消并稍后重试',
      },
    })
    return true
  } catch {
    return false
  }
}

export const aeGraphBuildTool = tool({
  description: [
    '构建或增量维护项目文件关系图谱。',
    '',
    '功能说明：',
    '- 扫描工作区文件并解析浅层 import/require/include 与 Markdown 链接',
    '- 将图谱保存到项目 `ae/graphs/graph.json` 与分片目录，使用本地 JSON 版本化快照',
    '- 写入构建输入指纹和构建状态，用于查询端判断 freshness 和构建中状态',
    '- 同步生成离线 HTML 预览页与本地 Cytoscape.js 资源，便于直接打开查看图谱',
    '- 支持 full、incremental、auto 模式；非 Git 项目自动降级全量构建',
    '- filterDecisions 会在获得文件写入授权后持久化到项目级 `.opencode/ae.jsonc` 的 graph.include / graph.exclude',
    '- 首版仅支持 depth=shallow；后续深层解析会通过统一节点/关系 schema 扩展',
    '',
    '适用场景：',
    '- 项目分析、重构前影响范围查询、维护文件关系图谱',
    '',
    '不适用场景：',
    '- 不分析运行时动态依赖，不提供符号级调用链。',
  ].join('\n'),
  args: {
    target: z.string().optional().describe('目标目录，支持绝对路径或相对路径；默认相对于 opencode 启动路径解析。'),
    mode: z.enum(['auto', 'full', 'incremental']).optional().describe('构建模式：auto/full/incremental。默认 auto。'),
    depth: z.enum(['shallow', 'medium']).optional().describe('解析深度。shallow 仅浅层引用，medium 额外解析制品依赖。'),
    include: z.array(z.string()).optional().describe('额外包含的子路径或路径集合，优先于排除规则但不覆盖安全硬排除。'),
    exclude: z.array(z.string()).optional().describe('额外排除的子路径或路径集合，优先与现有排除规则合并。'),
    filterDecisions: z.object({
      include: z.array(z.string()).optional().describe('用户明确选择持久化到 graph.include 的过滤规则。'),
      exclude: z.array(z.string()).optional().describe('用户明确选择持久化到 graph.exclude 的过滤规则。'),
    }).optional().describe('对未覆盖过滤候选的用户选择；写入前仍会请求项目级 ae.jsonc 文件授权。'),
  },
  execute: async (args, ctx) => {
    const startedAt = Date.now()
    const worktree = resolve(ctx.worktree)
    const baseDirectory = resolve(ctx.directory ?? ctx.worktree)
    const target = resolvePathWithBase(baseDirectory, args.target ?? '.')
    ctx.metadata({ title: '构建文件关系图谱' })

    if (!isInsideRoot(worktree, target)) {
      return `目标路径不在当前工作区内：${args.target ?? target}`
    }
    try {
      if (lstatSync(target).isSymbolicLink() || pathContainsSymlink(worktree, target) || !isInsideRoot(realpathSync(worktree), realpathSync(target))) {
        return `目标路径不在当前工作区内：${args.target ?? target}`
      }
    } catch {
      return `目标路径不存在或无法访问：${args.target ?? target}`
    }

    let storage: ReturnType<typeof createGraphStorage> | undefined
    let currentBuildFingerprint: string | undefined
    let currentBuildScopeRoot: string | undefined
    // 提前赋值 scopeRoot 默认值，确保 catch 块中可用
    const scopeRoot = toPosixPath(relative(worktree, target) || '.')
    try {
      let config = mergeGraphRules(loadGraphConfig(worktree), args)
      const savedDecisions = await persistGraphFilterDecisions(worktree, args.filterDecisions, ctx)
      if (savedDecisions.savedIncludes.length > 0 || savedDecisions.savedExcludes.length > 0) {
        config = mergeGraphRules(loadGraphConfig(worktree), args)
      }
      const requestedMode = args.mode ?? 'auto'
      const preliminaryInput = normalizeGraphBuildInput({
        worktree,
        scopeRoot,
        requestedMode,
        effectiveMode: requestedMode === 'incremental' ? 'incremental' : 'full',
        config,
      })
      const preliminaryFingerprint = createGraphRequestFingerprint(preliminaryInput)
      const stateBeforeLock = readGraphBuildState(worktree, scopeRoot)
      if (stateBeforeLock?.status === 'updating' && !isGraphBuildStateStale(stateBeforeLock) && stateBeforeLock.scopeRoot === scopeRoot) {
        return formatBuildStateReuse(stateBeforeLock, isEquivalentBuildRequest(stateBeforeLock, preliminaryInput))
      }
      try {
        storage = createGraphStorage(worktree)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes('正在被其他进程写入') && typeof ctx.ask === 'function') {
          const recoverStaleLock = await confirmStaleLockRecovery(worktree, scopeRoot, ctx)
          if (!recoverStaleLock) {
            return '图谱存储正在被其他进程写入，已取消构建；请稍后重试。'
          }
          storage = createGraphStorage(worktree, { force: true })
        } else if (message.includes('正在被其他进程写入')) {
          return '图谱存储正在被其他进程写入，当前环境无法确认是否清理残留锁，请稍后重试。'
        } else {
          throw error
        }
      }

      storage.cleanupIncompleteVersions(worktree, scopeRoot)

      const rawDiff = requestedMode === 'full' ? { files: [] } : getChangedFiles(worktree)
      const filteredFiles = filterChangedFiles(rawDiff.files, config)
      const diff = { ...rawDiff, files: filteredFiles, hasStructuralChange: rawDiff.hasStructuralChange && filteredFiles.length > 0 }
      const filterCandidateSummary = collectGraphFilterCandidateSummary(
        worktree,
        target,
        config,
        requestedMode === 'full' ? undefined : rawDiff.files,
      )
      const filterDecisionWarnings = await collectFilterDecisionWarnings(worktree, config, ctx, filterCandidateSummary)
      const active = storage.getActiveVersion(worktree, scopeRoot)
      const rulesChanged = graphRulesChanged(active, config)
      let effectiveMode: 'full' | 'incremental' = requestedMode === 'full' || diff.warning || diff.hasStructuralChange || !active || rulesChanged ? 'full' : 'incremental'
      if (effectiveMode === 'incremental' && diff.files.length === 0 && active) {
        const summary = storage.getActiveVersionSummary(worktree, scopeRoot)
        const activeMetadata = storage.getActiveVersionMetadata(worktree, scopeRoot)
        const freshness = evaluateGraphFreshnessBasis({
          worktree,
          scopeRoot,
          activeVersionId: summary?.versionId,
          activeMetadata,
          buildState: readGraphBuildState(worktree, scopeRoot),
          config,
        })
        if (freshness.status === 'fresh') {
          copyGraphPreview(worktree)
          writeQueryIndex(worktree, scopeRoot, storage)
          storage.closeDatabase()
          storage = undefined
          appendGraphUsageRecord(worktree, {
            tool: 'ae-graph-build',
            mode: effectiveMode,
            scopeRoot,
            freshnessStatus: 'fresh',
            resultStatus: 'success',
            resultSize: 0,
            elapsedMs: Date.now() - startedAt,
          })
          return JSON.stringify({
            message: 'Git diff 无变更，图谱无需更新',
            mode: effectiveMode,
            scopeRoot,
            summary,
            freshness,
            includeRules: config.include,
            excludeRules: config.exclude,
            warnings: [savedDecisions.warning, ...filterDecisionWarnings].filter(Boolean),
            filterDecisionWarnings,
            filterCandidateSummary,
            savedIncludes: savedDecisions.savedIncludes,
            savedExcludes: savedDecisions.savedExcludes,
            database: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/graph.json`,
            preview: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/index.html`,
          }, null, 2)
        }
        effectiveMode = 'full'
      }
      const startInput: GraphBuildInput = normalizeGraphBuildInput({
        worktree,
        scopeRoot,
        requestedMode,
        effectiveMode,
        config,
      })
      const startInputFingerprint = createGraphRequestFingerprint(startInput)
      currentBuildFingerprint = startInputFingerprint
      currentBuildScopeRoot = scopeRoot
      const existingState = readGraphBuildState(worktree, scopeRoot)
      if (existingState?.status === 'updating' && !isGraphBuildStateStale(existingState) && existingState.scopeRoot === scopeRoot) {
        storage.closeDatabase()
        storage = undefined
        return formatBuildStateReuse(existingState, isEquivalentBuildRequest(existingState, startInput))
      }

      const buildState = createUpdatingGraphBuildState({
        worktree,
        scopeRoot,
        requestFingerprint: startInputFingerprint,
        requestSummary: startInput,
        activeVersionAtStart: active?.versionId,
      })
      writeGraphBuildState(worktree, buildState)
      const allFiles = collectGraphFiles(worktree, target, config)
      const versionId = storage.createVersion(worktree, scopeRoot, config.exclude, 'HEAD', config.include, {
        buildInputFingerprint: startInputFingerprint,
        buildInput: startInput,
      })
      let parseFiles = allFiles
      if (effectiveMode === 'incremental' && active) {
        storage.copyVersion(active.versionId, versionId)
        storage.deleteVersionData(versionId, diff.files)
        const changedAndReferencing = new Set(diff.files)
        if (hasOnlyModifiedFiles(diff)) {
          for (const relation of active.relations) {
            if (diff.files.includes(relation.targetPath)) {
              changedAndReferencing.add(relation.sourcePath)
            }
          }
        }
        parseFiles = allFiles.filter((file) => changedAndReferencing.has(file.relativePath))
      }

      const parsed = await parseFileRelations(worktree, parseFiles, config)
      storage.insertFiles(versionId, parsed.files)
      storage.insertRelations(versionId, parsed.relations)

      // depth=medium 时额外解析制品依赖
      let artifactNodeCount = 0
      let artifactRelationCount = 0
      const actualDepth = args.depth ?? 'shallow'
      if (actualDepth === 'medium') {
        try {
          const toolchain = await detectToolchain(worktree)
          const artifactResult = await ARTIFACT_STAGE.extract(worktree, toolchain)
          if (artifactResult.nodes.length > 0) {
            storage.insertFiles(versionId, artifactResult.nodes)
            artifactNodeCount = artifactResult.nodes.length
          }
          if (artifactResult.relations.length > 0) {
            storage.insertRelations(versionId, artifactResult.relations)
            artifactRelationCount = artifactResult.relations.length
          }
        } catch {
          // 制品依赖解析失败不阻断主流程
        }
      }

      const endInput = normalizeGraphBuildInput({
        worktree,
        scopeRoot,
        requestedMode,
        effectiveMode,
        config,
      })
      const endInputFingerprint = createGraphRequestFingerprint(endInput)
      const inputChangedDuringBuild = startInputFingerprint !== endInputFingerprint
      const completedAt = new Date().toISOString()
      storage.updateVersionBuildMetadata(versionId, {
        buildInputFingerprint: startInputFingerprint,
        buildInput: startInput,
        endInputFingerprint,
        inputChangedDuringBuild,
        completedAt,
      })
      storage.activateVersion(versionId)
      writeGraphBuildState(worktree, markBuildCompleted(buildState, versionId))
      copyGraphPreview(worktree)
      writeQueryIndex(worktree, scopeRoot, storage)
      const activeSummary = storage.getActiveVersionSummary(worktree, scopeRoot)

      appendGraphUsageRecord(worktree, {
        tool: 'ae-graph-build',
        mode: effectiveMode,
        scopeRoot,
        freshnessStatus: inputChangedDuringBuild ? 'maybe_stale' : 'fresh',
        resultStatus: 'success',
        resultSize: parsed.files.length + artifactNodeCount,
        elapsedMs: Date.now() - startedAt,
      })

      return JSON.stringify({
        mode: effectiveMode,
        modeReason: effectiveMode === 'full' ? (diff.warning ?? (rulesChanged ? '图谱过滤规则变化，已全量重建' : (diff.hasStructuralChange ? '检测到新增、删除、重命名或未跟踪文件，已保守全量构建' : '未找到可复用 active version 或用户请求 full'))) : '仅检测到可安全增量刷新的修改文件',
        depth: actualDepth,
        scopeRoot,
        versionId,
        parsedNodes: parsed.files.length + artifactNodeCount,
        activeFiles: activeSummary?.fileCount ?? parsed.files.length,
        activeNodes: activeSummary?.nodeCount ?? parsed.files.length,
        activeRelations: activeSummary?.relationCount ?? parsed.relations.length,
        relations: parsed.relations.length + artifactRelationCount,
        parserStats: actualDepth === 'medium' ? [{ parser: 'artifact', nodes: artifactNodeCount, relations: artifactRelationCount }] : [],
        failedFiles: parsed.failedFiles.length,
        failedFileDetails: parsed.failedFiles,
        skippedFiles: parsed.skippedFiles.length,
        skippedFileDetails: parsed.skippedFiles,
        chunkSummary: activeSummary,
        includeRules: config.include,
        excludeRules: config.exclude,
        warnings: [diff.warning, savedDecisions.warning, ...parsed.warnings, ...filterDecisionWarnings].filter(Boolean),
        freshness: {
          status: inputChangedDuringBuild ? 'maybe_stale' : (endInput.warning ? 'maybe_stale' : 'fresh'),
          activeVersionId: versionId,
          basis: inputChangedDuringBuild
            ? ['构建期间输入摘要发生变化。']
            : (endInput.warning ? [endInput.warning] : ['构建结束输入摘要与 active version 一致。']),
          message: inputChangedDuringBuild ? '图谱已更新，但构建期间输入变化，需再次刷新才能作为高影响结论证据。' : '图谱构建完成。',
          requiresRefreshFor: inputChangedDuringBuild ? ['无影响、无依赖、完整覆盖等高影响结论'] : [],
          canUseAsEvidence: !inputChangedDuringBuild && !endInput.warning,
        },
        buildInputFingerprint: startInputFingerprint,
        endInputFingerprint,
        inputChangedDuringBuild,
        filterDecisionWarnings,
        filterCandidateSummary,
        savedIncludes: savedDecisions.savedIncludes,
        savedExcludes: savedDecisions.savedExcludes,
        database: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/graph.json`,
        preview: `${docsAePath(DOCS_AE_SUBDIRS.GRAPHS)}/index.html`,
        elapsedMs: Date.now() - startedAt,
        tool: TOOL.AE_GRAPH_BUILD,
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const currentState = readGraphBuildState(worktree, currentBuildScopeRoot)
      if (currentState?.status === 'updating' && currentState.requestFingerprint === currentBuildFingerprint) {
        const now = new Date().toISOString()
        writeGraphBuildState(worktree, {
          ...currentState,
          status: 'failed',
          updatedAt: now,
          message: `文件关系图谱构建失败：${message}`,
          recoverBy: '请修复失败原因后重新执行 ae-graph-build。',
        })
      }
      appendGraphUsageRecord(worktree, {
        tool: 'ae-graph-build',
        mode: args.mode ?? 'auto',
        scopeRoot: currentBuildScopeRoot,
        resultStatus: 'error',
        elapsedMs: Date.now() - startedAt,
      })
      return `文件关系图谱构建失败：${message}`
    } finally {
      storage?.closeDatabase()
    }
  },
})
