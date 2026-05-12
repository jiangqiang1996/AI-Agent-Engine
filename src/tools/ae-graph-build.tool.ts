import { copyFileSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { tool } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { loadGraphConfig, saveGraphExcludeRule } from '../services/graph-config-service.js'
import { collectGraphFiles, parseFileRelations } from '../services/graph-parse-service.js'
import { createGraphStorage, resolveGraphDatabasePath } from '../services/graph-storage-service.js'
import { isInsideRoot, pathContainsSymlink, resolvePathWithBase, toPosixPath } from '../utils/path-utils.js'

const COMMON_EXCLUDE_DIRS = ['node_modules', 'dist', 'build', 'coverage', '__pycache__', '.next', '.nuxt']

function copyGraphPreview(worktree: string): void {
  const refDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'skills', 'ae-graph-build', 'references')
  const targetDir = join(worktree, 'docs', 'ae', 'graphs')
  const pairs: Array<[string, string]> = [
    [join(refDir, 'graph-preview.html'), join(targetDir, 'index.html')],
    [join(refDir, 'cytoscape.min.js'), join(targetDir, 'cytoscape.min.js')],
  ]
  for (const [source, target] of pairs) {
    try {
      if (existsSync(source)) {
        copyFileSync(source, target)
      }
    } catch {
      // 预览文件复制失败不阻断图谱构建
    }
  }
}

function isGraphRuntimeFile(filePath: string): boolean {
  return filePath === 'docs/ae/graphs' || filePath.startsWith('docs/ae/graphs/')
}

function mergeGraphExcludeRules(configExclude: string[], argumentExclude: string[] | undefined): string[] {
  return [...new Set([...configExclude, ...(argumentExclude ?? [])])]
}

function hasOnlyModifiedFiles(diff: { files: string[]; hasStructuralChange?: boolean; warning?: string }): boolean {
  return !diff.warning && !diff.hasStructuralChange && diff.files.length > 0
}

function getChangedFiles(worktree: string): { files: string[]; hasStructuralChange?: boolean; warning?: string } {
  try {
    const options = { cwd: worktree, encoding: 'utf8', timeout: 10000 } as const
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

async function confirmMissingExcludes(worktree: string, configured: string[], ctx: { ask?: unknown }): Promise<string[]> {
  const missing = COMMON_EXCLUDE_DIRS.filter((dir) => {
    const normalizedDir = toPosixPath(dir).replace(/\/$/, '')
    const hasRule = configured.some((rule) => {
      const normalizedRule = toPosixPath(rule).replace(/\/$/, '')
      return normalizedDir === normalizedRule || normalizedDir.startsWith(`${normalizedRule}/`)
    })
    return !hasRule && existsSync(resolve(worktree, dir))
  })
  const confirmed: string[] = []
  for (const dir of missing) {
    if (typeof ctx.ask !== 'function') {
      continue
    }
    try {
      await Effect.runPromise(ctx.ask({
        permission: 'file',
        patterns: [resolve(worktree, '.opencode', 'ae.jsonc')],
        always: [],
        metadata: { action: '检测到常见依赖或构建产物目录，确认后保存为图谱排除规则', rule: dir },
      }))
      saveGraphExcludeRule(worktree, dir)
      confirmed.push(dir)
    } catch {
      continue
    }
  }
  return confirmed
}

async function confirmDatabaseWrite(worktree: string, ctx: { ask?: unknown }): Promise<boolean> {
  if (typeof ctx.ask !== 'function') {
    return false
  }
  try {
    await Effect.runPromise(ctx.ask({
      permission: 'file',
      patterns: [
        resolveGraphDatabasePath(worktree),
        resolve(worktree, 'docs', 'ae', 'graphs', 'version-*'),
        resolve(worktree, 'docs', 'ae', 'graphs', 'graph.json.tmp-*'),
        resolve(worktree, 'docs', 'ae', 'graphs', 'graph.json.lock'),
        resolve(worktree, 'docs', 'ae', 'graphs', 'index.html'),
        resolve(worktree, 'docs', 'ae', 'graphs', 'cytoscape.min.js'),
      ],
      always: [],
      metadata: { action: '写入文件关系图谱 JSON 存储文件、分片、预览页及临时文件', target: 'docs/ae/graphs/**' },
    }))
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
    '- 扫描工作区文件并解析浅层 import/require/include、Markdown 链接和 AE 资产引用',
    '- 将图谱保存到项目 `docs/ae/graphs/graph.json` 与分片目录，使用本地 JSON 版本化快照',
    '- 同步生成离线 HTML 预览页与本地 Cytoscape.js 资源，便于直接打开查看图谱',
    '- 支持 full、incremental、auto 模式；非 Git 项目自动降级全量构建',
    '- 首版仅支持 depth=shallow，不执行深层 AST 解析',
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
    depth: z.enum(['shallow']).optional().describe('解析深度。首版仅支持 shallow。'),
    exclude: z.array(z.string()).optional().describe('额外排除的子路径或路径集合，优先与现有排除规则合并。'),
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
    try {
      let config = loadGraphConfig(worktree)
      config = { exclude: mergeGraphExcludeRules(config.exclude, args.exclude) }
      const savedExcludes = await confirmMissingExcludes(worktree, config.exclude, ctx)
      if (savedExcludes.length > 0) {
        config = { exclude: mergeGraphExcludeRules(loadGraphConfig(worktree).exclude, args.exclude) }
      }

      const canWriteDatabase = await confirmDatabaseWrite(worktree, ctx)
      if (!canWriteDatabase) {
        return '用户未授权写入 `docs/ae/graphs/graph.json`，已取消文件关系图谱构建。'
      }

      storage = createGraphStorage(worktree)

      const scopeRoot = toPosixPath(relative(worktree, target) || '.')
      storage.cleanupIncompleteVersions(worktree, scopeRoot)

      const requestedMode = args.mode ?? 'auto'
      const diff = requestedMode === 'full' ? { files: [] } : getChangedFiles(worktree)
      const active = storage.getActiveVersion(worktree, scopeRoot)
      const effectiveMode = requestedMode === 'full' || diff.warning || diff.hasStructuralChange || !active ? 'full' : 'incremental'
      if (effectiveMode === 'incremental' && diff.files.length === 0 && active) {
        const summary = storage.getActiveVersionSummary(worktree, scopeRoot)
        copyGraphPreview(worktree)
        storage.closeDatabase()
        storage = undefined
        return JSON.stringify({ message: 'Git diff 无变更，图谱无需更新', mode: effectiveMode, scopeRoot, summary, database: 'docs/ae/graphs/graph.json', preview: 'docs/ae/graphs/index.html' }, null, 2)
      }

      const allFiles = collectGraphFiles(worktree, target, config)
      const versionId = storage.createVersion(worktree, scopeRoot, config.exclude, 'HEAD')
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

      const parsed = parseFileRelations(worktree, parseFiles, config)
      storage.insertFiles(versionId, parsed.files)
      storage.insertRelations(versionId, parsed.relations)
      storage.activateVersion(versionId)
      copyGraphPreview(worktree)

      return JSON.stringify({
        mode: effectiveMode,
        modeReason: effectiveMode === 'full' ? (diff.warning ?? (diff.hasStructuralChange ? '检测到新增、删除、重命名或未跟踪文件，已保守全量构建' : '未找到可复用 active version 或用户请求 full')) : '仅检测到可安全增量刷新的修改文件',
        depth: args.depth ?? 'shallow',
        scopeRoot,
        versionId,
        files: parsed.files.length,
        relations: parsed.relations.length,
        chunkSummary: storage.getActiveVersionSummary(worktree, scopeRoot),
        excludeRules: config.exclude,
        warnings: [diff.warning, ...parsed.warnings].filter(Boolean),
        savedExcludes,
        database: 'docs/ae/graphs/graph.json',
        preview: 'docs/ae/graphs/index.html',
        elapsedMs: Date.now() - startedAt,
        tool: TOOL.AE_GRAPH_BUILD,
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `文件关系图谱构建失败：${message}`
    } finally {
      storage?.closeDatabase()
    }
  },
})
