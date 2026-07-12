import { existsSync, lstatSync, readdirSync, realpathSync, type Dirent } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { isInsideRoot, pathContainsSymlink, toPosixPath } from '../utils/path-utils.js'
import { matchGraphExcludePath, matchGraphPath, type GraphConfig } from './graph-config-service.js'

const DEFAULT_EXCLUDED_DIRS = new Set(['.git', '.ae'])
const HARD_EXCLUDED_AE_RUNTIME_PATHS = [
  docsAePath(DOCS_AE_SUBDIRS.GRAPHS),
  docsAePath(DOCS_AE_SUBDIRS.HANDOFFS),
  docsAePath(DOCS_AE_SUBDIRS.REVIEWS),
  'ae/screenshot',
]
const SENSITIVE_FILENAMES = [/^\.env/, /credential/i, /secret/i, /password/i, /token/i, /private[-_]?key/i]
const HARD_EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.wav', '.mp4', '.webm', '.mov', '.avi',
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.tmp', '.log', '.tsbuildinfo',
])
const SUGGESTED_EXCLUDED_EXTENSIONS = new Set(['.svg', '.jar', '.class'])
const NOISY_PATH_SEGMENTS = new Set(['tmp', 'temp', 'cache', 'coverage', 'dist', 'build', 'runs'])
const EXCLUDE_SUGGESTION_CANDIDATES: FilterSuggestionCandidate[] = [
  { path: '.idea', rule: '**/.idea', reason: 'IDE 项目配置和索引状态不表达源码依赖关系' },
  { path: '.opencode', rule: '**/.opencode', reason: 'OpenCode 本地配置、桥接插件和依赖缓存属于工具运行产物' },
  { path: docsAePath(DOCS_AE_SUBDIRS.GRAPHS), rule: docsAePath(DOCS_AE_SUBDIRS.GRAPHS), reason: '图谱自身输出目录会造成派生产物回流' },
  { path: 'node_modules', rule: '**/node_modules', reason: '包管理器依赖目录体积大且不属于项目源码真源' },
  { path: 'dist', rule: '**/dist', reason: '编译输出目录通常由源码生成，关系会重复且噪声较大' },
  { path: 'build', rule: '**/build', reason: '构建产物目录通常由源码生成，关系会重复且噪声较大' },
  { path: 'coverage', rule: '**/coverage', reason: '覆盖率报告是测试生成产物，不表达源码依赖关系' },
  { path: 'target', rule: '**/target', reason: 'Java/Rust 等生态构建输出体积大且由源码生成' },
  { path: 'tmp', rule: '**/tmp', reason: '临时运行产物不具备稳定关系语义' },
  { path: 'temp', rule: '**/temp', reason: '临时运行产物不具备稳定关系语义' },
  { path: 'runs', rule: '**/runs', reason: '本地运行记录和调试输出不属于源码依赖图' },
  { path: '.next', rule: '**/.next', reason: 'Next.js 缓存和构建输出由源码生成' },
  { path: '.nuxt', rule: '**/.nuxt', reason: 'Nuxt 缓存和构建输出由源码生成' },
  { path: '.turbo', rule: '**/.turbo', reason: '构建缓存目录不表达源码依赖关系' },
  { path: '.cache', rule: '**/.cache', reason: '工具缓存目录不表达源码依赖关系' },
]
const FILE_EXCLUDE_SUGGESTION_CANDIDATES: FilterSuggestionCandidate[] = [
  { path: '**/*.log', rule: '**/*.log', reason: '日志文件是运行输出，通常体积大且无稳定源码关系' },
  { path: '**/*.tmp', rule: '**/*.tmp', reason: '临时文件不具备稳定关系语义' },
  { path: '**/*.tsbuildinfo', rule: '**/*.tsbuildinfo', reason: 'TypeScript 增量编译缓存由构建生成' },
  { path: '**/*.zip', rule: '**/*.zip', reason: '压缩包是二进制归档，无法做文本关系解析' },
  { path: '**/*.tar', rule: '**/*.tar', reason: '压缩包是二进制归档，无法做文本关系解析' },
  { path: '**/*.gz', rule: '**/*.gz', reason: '压缩包是二进制归档，无法做文本关系解析' },
  { path: '**/*.7z', rule: '**/*.7z', reason: '压缩包是二进制归档，无法做文本关系解析' },
  { path: '**/*.rar', rule: '**/*.rar', reason: '压缩包是二进制归档，无法做文本关系解析' },
  { path: '**/*.png', rule: '**/*.png', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.jpg', rule: '**/*.jpg', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.jpeg', rule: '**/*.jpeg', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.gif', rule: '**/*.gif', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.webp', rule: '**/*.webp', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.ico', rule: '**/*.ico', reason: '图片是二进制素材，不参与源码关系解析' },
  { path: '**/*.woff', rule: '**/*.woff', reason: '字体是二进制素材，不参与源码关系解析' },
  { path: '**/*.woff2', rule: '**/*.woff2', reason: '字体是二进制素材，不参与源码关系解析' },
  { path: '**/*.ttf', rule: '**/*.ttf', reason: '字体是二进制素材，不参与源码关系解析' },
  { path: '**/*.mp3', rule: '**/*.mp3', reason: '音频是二进制素材，不参与源码关系解析' },
  { path: '**/*.mp4', rule: '**/*.mp4', reason: '视频是二进制素材，不参与源码关系解析' },
  { path: '**/*.webm', rule: '**/*.webm', reason: '视频是二进制素材，不参与源码关系解析' },
]
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.rb', '.php',
  '.swift', '.kt', '.scala', '.vue', '.svelte', '.css', '.scss', '.less', '.html', '.sql', '.prisma', '.graphql',
])
const DOCUMENT_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.adoc'])
const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml'])

/** 图谱路径过滤结果，区分用户规则排除和安全硬排除。 */
export interface GraphPathDecision {
  excluded: boolean
  hardExcluded: boolean
}

/** 图谱过滤候选统计，用于向用户解释可选排除规则。 */
export interface GraphCandidateStat {
  value: string
  count: number
  examples: string[]
  suggestedRule: string
  reason: string
}

interface FilterSuggestionCandidate {
  path: string
  rule: string
  reason: string
}

/** 当前配置未覆盖的图谱过滤建议。 */
export interface GraphFilterSuggestion extends FilterSuggestionCandidate {
  covered: boolean
  coveredBy?: string
  uncoveredReason?: string
}

/** 图谱构建范围内可解析文件、硬排除文件和噪声候选摘要。 */
export interface GraphFilterCandidateSummary {
  scopeRoot: string
  rawFileCount: number
  candidateFileCount: number
  parseableFileCount: number
  hardExcludedFileCount: number
  extensionCandidates: GraphCandidateStat[]
  pathSegmentCandidates: GraphCandidateStat[]
}

/** 本次构建范围内未被配置覆盖的图谱过滤建议。 */
export interface GraphFilterSummarySuggestion {
  group: 'extension' | 'path-segment'
  value: string
  count: number
  examples: string[]
  suggestedRule: string
  reason: string
  covered: boolean
  coveredBy?: string
  uncoveredReason?: string
}

interface MutableStat {
  count: number
  examples: string[]
}

/** 判断路径是否命中图谱安全硬排除或用户配置排除；硬排除优先于 include。 */
export function getGraphPathDecision(relativePath: string, config: GraphConfig, isDirectory = false): GraphPathDecision {
  const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '').replace(/\/+$/, '')
  if (HARD_EXCLUDED_AE_RUNTIME_PATHS.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`))) {
    return { excluded: true, hardExcluded: true }
  }
  const parts = normalizedPath.split('/')
  if (parts.some((part) => DEFAULT_EXCLUDED_DIRS.has(part))) {
    return { excluded: true, hardExcluded: true }
  }
  if (SENSITIVE_FILENAMES.some((pattern) => pattern.test(parts.at(-1) ?? ''))) {
    return { excluded: true, hardExcluded: true }
  }
  if (!isDirectory && HARD_EXCLUDED_EXTENSIONS.has(extname(normalizedPath).toLowerCase())) {
    return { excluded: true, hardExcluded: true }
  }
  return { excluded: matchGraphPath(normalizedPath, config, isDirectory).excluded, hardExcluded: false }
}

/** 判断文件扩展名是否属于浅层图谱解析支持范围。 */
export function isSupportedGraphFile(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase()
  return SOURCE_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext) || CONFIG_EXTENSIONS.has(ext)
}

/** 根据路径扩展名返回图谱节点的文件类型。 */
export function graphFileTypeForPath(filePath: string): 'source' | 'document' | 'config' {
  const ext = extname(filePath).toLowerCase()
  if (DOCUMENT_EXTENSIONS.has(ext)) {
    return 'document'
  }
  if (CONFIG_EXTENSIONS.has(ext)) {
    return 'config'
  }
  return 'source'
}

function addStat(stats: Map<string, MutableStat>, key: string, example: string): void {
  const existing = stats.get(key) ?? { count: 0, examples: [] }
  existing.count += 1
  if (existing.examples.length < 3) {
    existing.examples.push(example)
  }
  stats.set(key, existing)
}

function toStats(stats: Map<string, MutableStat>, reason: (value: string) => string, rule: (value: string) => string): GraphCandidateStat[] {
  return [...stats.entries()]
    .map(([value, stat]) => ({ value, count: stat.count, examples: stat.examples, suggestedRule: rule(value), reason: reason(value) }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

function isInsideTarget(worktree: string, target: string, relativePath: string): boolean {
  const absolutePath = resolve(worktree, relativePath)
  return absolutePath === target || isInsideRoot(target, absolutePath)
}

export function collectMissingGraphFilterSuggestions(worktree: string, config: GraphConfig): GraphFilterSuggestion[] {
  const directorySuggestions = EXCLUDE_SUGGESTION_CANDIDATES
    .filter((candidate) => existsSync(resolve(worktree, candidate.path)))
    .map((candidate) => buildFilterSuggestion(candidate, config, true))
  const fileSuggestions = FILE_EXCLUDE_SUGGESTION_CANDIDATES
    .flatMap((candidate) => {
      const existingPath = findExistingFileMatch(worktree, candidate.rule)
      return existingPath ? [{ ...candidate, path: existingPath }] : []
    })
    .map((candidate) => buildFilterSuggestion(candidate, config, false))

  return dedupeFilterSuggestions([...directorySuggestions, ...fileSuggestions].filter((suggestion) => !suggestion.covered))
}

/**
 * 从本次 target/scopeRoot 的真实候选摘要生成过滤建议。
 * 只返回当前 graph.include / graph.exclude 尚未覆盖的扩展名和路径段候选。
 */
export function collectGraphFilterSuggestionsFromSummary(
  summary: GraphFilterCandidateSummary,
  config: GraphConfig,
): GraphFilterSummarySuggestion[] {
  const extensionSuggestions = summary.extensionCandidates.map((candidate) =>
    buildSummarySuggestion('extension', candidate, config, false)
  )
  const pathSegmentSuggestions = summary.pathSegmentCandidates.map((candidate) =>
    buildSummarySuggestion('path-segment', candidate, config, true)
  )

  return [...extensionSuggestions, ...pathSegmentSuggestions].filter((suggestion) => !suggestion.covered)
}

function buildSummarySuggestion(
  group: GraphFilterSummarySuggestion['group'],
  candidate: GraphCandidateStat,
  config: GraphConfig,
  isDirectory: boolean,
): GraphFilterSummarySuggestion {
  const ruleCoverage = matchGraphPath(candidate.suggestedRule, config, isDirectory)

  return {
    group,
    value: candidate.value,
    count: candidate.count,
    examples: candidate.examples,
    suggestedRule: candidate.suggestedRule,
    reason: candidate.reason,
    covered: ruleCoverage.covered,
    coveredBy: ruleCoverage.matchedInclude ?? ruleCoverage.matchedExclude,
    uncoveredReason: '现有 graph.include / graph.exclude 规则均未覆盖该真实候选或建议规则',
  }
}

function buildFilterSuggestion(candidate: FilterSuggestionCandidate, config: GraphConfig, isDirectory: boolean): GraphFilterSuggestion {
  const pathCoverage = matchGraphPath(candidate.path, config, isDirectory)
  const ruleCoverage = matchGraphPath(candidate.rule, config, isDirectory)
  const matchedInclude = pathCoverage.matchedInclude ?? ruleCoverage.matchedInclude
  const matchedExclude = pathCoverage.matchedExclude ?? ruleCoverage.matchedExclude
  return {
    ...candidate,
    covered: pathCoverage.covered || ruleCoverage.covered,
    coveredBy: matchedInclude ?? matchedExclude,
    uncoveredReason: '现有 graph.include / graph.exclude 规则均未覆盖该实际存在路径或建议规则',
  }
}

function dedupeFilterSuggestions(suggestions: GraphFilterSuggestion[]): GraphFilterSuggestion[] {
  const seen = new Set<string>()
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.rule)) {
      return false
    }
    seen.add(suggestion.rule)
    return true
  })
}

function findExistingFileMatch(worktree: string, rule: string): string | undefined {
  const matcher = rule.replace(/^\*\*\//, '')
  if (!matcher.startsWith('*.')) {
    return undefined
  }
  const extension = matcher.slice(1)
  const stack = [worktree]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) {
      continue
    }
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const absolutePath = resolve(dir, entry.name)
      const relativePath = toPosixPath(relative(worktree, absolutePath))
      if (getGraphPathDecision(relativePath, { exclude: [] }, entry.isDirectory()).hardExcluded
        || matchGraphExcludePath(relativePath, ['**/node_modules'], entry.isDirectory()).excluded) {
        continue
      }
      if (entry.isDirectory()) {
        stack.push(absolutePath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
        return relativePath
      }
    }
  }
  return undefined
}

/**
 * 枚举当前 target 内的真实文件范围，并返回硬排除、可解析集合和高噪声候选统计。
 * `changedFiles` 传入时仅统计与 target 相交的变更文件，用于增量构建候选摘要。
 */
export function collectGraphFilterCandidateSummary(
  worktree: string,
  target: string,
  config: GraphConfig,
  changedFiles?: string[],
): GraphFilterCandidateSummary {
  const root = resolve(worktree)
  const start = resolve(target)
  const realRoot = realpathSync(root)
  const startStat = lstatSync(start)
  if (startStat.isSymbolicLink() || pathContainsSymlink(root, start)) {
    throw new Error('目标路径不能是符号链接')
  }
  if (!isInsideRoot(realRoot, realpathSync(start))) {
    throw new Error('目标路径不在当前工作区内')
  }

  const changedSet = changedFiles
    ? new Set(changedFiles.map((file) => toPosixPath(file)).filter((file) => isInsideTarget(root, start, file)))
    : undefined
  const extensionStats = new Map<string, MutableStat>()
  const pathSegmentStats = new Map<string, MutableStat>()
  let rawFileCount = 0
  let candidateFileCount = 0
  let parseableFileCount = 0
  let hardExcludedFileCount = 0

  function visit(dir: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const absolutePath = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        continue
      }
      const relativePath = toPosixPath(relative(root, absolutePath))
      const decision = getGraphPathDecision(relativePath, config, entry.isDirectory())
      if (entry.isDirectory()) {
        if (!decision.excluded) {
          visit(absolutePath)
        }
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      if (changedSet && !changedSet.has(relativePath)) {
        continue
      }
      rawFileCount += 1
      if (decision.hardExcluded) {
        hardExcludedFileCount += 1
        continue
      }
      if (decision.excluded) {
        continue
      }

      candidateFileCount += 1
      if (isSupportedGraphFile(entry.name)) {
        parseableFileCount += 1
      }

      const ext = extname(relativePath).toLowerCase()
      if (SUGGESTED_EXCLUDED_EXTENSIONS.has(ext)) {
        addStat(extensionStats, ext, relativePath)
      }
      for (const segment of relativePath.split('/').slice(0, -1)) {
        if (NOISY_PATH_SEGMENTS.has(segment.toLowerCase())) {
          addStat(pathSegmentStats, segment, relativePath)
        }
      }
    }
  }

  visit(start)
  const scopeRoot = toPosixPath(relative(root, start) || '.')
  return {
    scopeRoot,
    rawFileCount,
    candidateFileCount,
    parseableFileCount,
    hardExcludedFileCount,
    extensionCandidates: toStats(
      extensionStats,
      (value) => `${value} 文件可能是二进制、打包产物或仅在特定项目中具备依赖语义，建议由用户确认是否排除`,
      (value) => `**/*${value}`,
    ),
    pathSegmentCandidates: toStats(
      pathSegmentStats,
      (value) => `${value} 路径段通常表示构建、缓存、临时或运行输出目录，建议由用户确认是否排除`,
      (value) => `**/${value}`,
    ),
  }
}
