import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

import { isInsideRoot, toPosixPath } from '../utils/path-utils.js'
import { RESOLVABLE_EXTENSIONS } from './graph-parse-service.js'

/**
 * 按需即时依赖解析服务。
 *
 * 核心理念（来自头脑风暴共识）：
 * - 不持久化、不预构建——消除"更新滞后"和"与真实文件不一致"问题
 * - 实时解析目标文件的 import/require/include，返回工作区内可解析的依赖
 * - 局部反向搜索：扫描目标文件同目录及相邻目录，找出谁引用了该文件
 *
 * 这是持久化图谱的轻量替代方案：~200 行纯函数，无状态，即时可用。
 *
 * RESOLVABLE_EXTENSIONS 从 graph-parse-service 导入，避免重复定义和漂移。
 */

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_DOWNWARD_SCAN_FILES = 400
const DOWNWARD_SCAN_TIMEOUT_MS = 2000

export interface LocalDepsResult {
  filePath: string
  upstream: string[]
  downstream: string[]
  unresolved: string[]
  parsedAt: string
  parser: 'local-deps-instant'
}

interface ParsedReference {
  raw: string
  line: number
  type: 'import' | 'require' | 'include' | 'link'
}

interface ComputeLocalDepsOptions {
  /** 跳过下游扫描（用于 hook 中快速返回，避免同步阻塞） */
  skipDownstream?: boolean
}

/**
 * 即时计算单个文件的本地依赖。
 * 不读取图谱、不持久化、不缓存——每次调用都是实时解析真实文件。
 */
export function computeLocalDeps(worktree: string, filePath: string, options?: ComputeLocalDepsOptions): LocalDepsResult {
  const root = resolve(worktree)
  const absoluteTarget = resolve(root, filePath)
  const parsedAt = new Date().toISOString()

  if (!isInsideRoot(root, absoluteTarget) || !existsSync(absoluteTarget)) {
    return {
      filePath: toPosixPath(relative(root, absoluteTarget) || filePath),
      upstream: [],
      downstream: [],
      unresolved: [],
      parsedAt,
      parser: 'local-deps-instant',
    }
  }

  const stat = statSync(absoluteTarget)
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
    return {
      filePath: toPosixPath(relative(root, absoluteTarget)),
      upstream: [],
      downstream: [],
      unresolved: [],
      parsedAt,
      parser: 'local-deps-instant',
    }
  }

  const relativePath = toPosixPath(relative(root, absoluteTarget))
  let content: string
  try {
    content = readFileSync(absoluteTarget, 'utf8')
  } catch {
    return {
      filePath: relativePath,
      upstream: [],
      downstream: [],
      unresolved: [],
      parsedAt,
      parser: 'local-deps-instant',
    }
  }
  const references = parseReferences(content, relativePath)

  const upstream: string[] = []
  const unresolved: string[] = []
  const seenUpstream = new Set<string>()

  for (const ref of references) {
    const resolved = resolveReference(root, relativePath, ref.raw, ref.type)
    if (resolved && !seenUpstream.has(resolved)) {
      upstream.push(resolved)
      seenUpstream.add(resolved)
    } else if (!resolved && !seenUpstream.has(ref.raw)) {
      unresolved.push(ref.raw)
      seenUpstream.add(ref.raw)
    }
  }

  const downstream = options?.skipDownstream ? [] : findDownstreamReferences(root, relativePath)

  return {
    filePath: relativePath,
    upstream,
    downstream,
    unresolved,
    parsedAt,
    parser: 'local-deps-instant',
  }
}

function parseReferences(content: string, filePath: string): ParsedReference[] {
  const lines = content.split(/\r?\n/)
  const refs: ParsedReference[] = []
  const fileExt = extname(filePath)

  lines.forEach((lineContent, index) => {
    const line = index + 1
    const trimmed = lineContent.trimStart()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return
    }

    // ES import: import ... from '...'
    for (const match of lineContent.matchAll(/import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      refs.push({ raw: match[1], line, type: 'import' })
    }
    // CommonJS require
    for (const match of lineContent.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      refs.push({ raw: match[1], line, type: 'require' })
    }
    // include 指令
    for (const match of lineContent.matchAll(/include\s+["'<]?([^"'>\s]+)["'>]?/g)) {
      refs.push({ raw: match[1], line, type: 'include' })
    }
    // Markdown 链接（排除 http 和锚点）
    if (fileExt === '.md') {
      for (const match of lineContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        if (!/^https?:\/\//i.test(match[1]) && !match[1].startsWith('#')) {
          refs.push({ raw: match[1], line, type: 'link' })
        }
      }
    }
    // Python/Java import：裸模块名视为相对引用
    if (fileExt === '.py' || fileExt === '.java') {
      for (const match of lineContent.matchAll(/^\s*(?:from\s+([.\w]+)\s+import\s+\w+|import\s+([.\w]+))/g)) {
        const rawImport = match[1] ?? match[2]
        if (rawImport) {
          const normalized = rawImport.replaceAll('.', '/')
          refs.push({ raw: `./${normalized}`, line, type: 'import' })
        }
      }
    }
    // Go import
    if (fileExt === '.go') {
      for (const match of lineContent.matchAll(/^\s*import\s+(?:\(\s*)?["']([^"']+)["']\s*\)?\s*;?$/g)) {
        refs.push({ raw: match[1], line, type: 'import' })
      }
    }
  })

  return refs
}

function resolveReference(worktree: string, sourcePath: string, rawTarget: string, refType: ParsedReference['type']): string | undefined {
  const withoutHash = rawTarget.split('#')[0].split('?')[0]
  if (!withoutHash) {
    return undefined
  }

  const allowBareRelative = refType === 'link' || refType === 'include'
  if (!allowBareRelative && !withoutHash.startsWith('.') && !withoutHash.startsWith('/')) {
    return undefined
  }

  const sourceDir = dirname(resolve(worktree, sourcePath))
  const primaryBase = withoutHash.startsWith('/') ? worktree : sourceDir
  const primaryTarget = withoutHash.startsWith('/') ? withoutHash.replace(/^\/+/, '') : withoutHash

  return resolveCandidate(worktree, primaryBase, primaryTarget) ?? (allowBareRelative ? resolveCandidate(worktree, worktree, withoutHash) : undefined)
}

function resolveCandidate(worktree: string, base: string, target: string): string | undefined {
  const absoluteTarget = resolve(base, target)
  if (!isInsideRoot(worktree, absoluteTarget)) {
    return undefined
  }
  if (existsSync(absoluteTarget) && statSync(absoluteTarget).isFile()) {
    return toPosixPath(relative(worktree, absoluteTarget))
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = `${absoluteTarget}${ext}`
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return toPosixPath(relative(worktree, candidate))
    }
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = join(absoluteTarget, `index${ext}`)
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return toPosixPath(relative(worktree, candidate))
    }
  }
  // Python 包入口：__init__.py
  const pythonInitPath = join(absoluteTarget, '__init__.py')
  if (existsSync(pythonInitPath) && statSync(pythonInitPath).isFile()) {
    return toPosixPath(relative(worktree, pythonInitPath))
  }
  return undefined
}

/**
 * 局部反向搜索：在目标文件同目录及关键目录中扫描谁引用了该文件。
 * 采用分层扫描策略保证覆盖范围同时控制扫描量上限。
 *
 * 扫描策略：
 * 1. 目标文件所在目录（深度2层）— 最可能的直接调用方
 * 2. 工作区根目录的顶层子目录（深度3层）— 覆盖跨目录引用
 * 3. 关键约定目录（src/、tests/、lib/）— 覆盖项目约定位置
 *
 * 时间预算：DOWNWARD_SCAN_TIMEOUT_MS 内完成，超时返回已收集结果。
 * 预过滤：对短名文件（如 index.ts）要求路径片段匹配，避免全量解析。
 */
function findDownstreamReferences(worktree: string, targetRelativePath: string): string[] {
  const root = resolve(worktree)
  const targetAbs = resolve(root, targetRelativePath)
  const results: string[] = []
  const seen = new Set<string>()
  let scannedCount = 0
  const scannedDirs = new Set<string>()
  const startTime = Date.now()

  const isTimedOut = (): boolean => Date.now() - startTime > DOWNWARD_SCAN_TIMEOUT_MS

  // 构建扫描根目录优先级列表
  const searchRoots: string[] = [dirname(targetAbs)]
  const rootDirectChildren = listTopLevelDirs(root)
  searchRoots.push(...rootDirectChildren)
  // 关键约定目录
  for (const dir of ['src', 'tests', 'lib', 'app', 'pkg']) {
    const candidate = join(root, dir)
    if (existsSync(candidate) && !searchRoots.includes(candidate)) {
      searchRoots.push(candidate)
    }
  }

  // 预过滤：对极短名文件（如 a.ts, b.ts）使用完整路径匹配避免全量命中
  const targetBasename = targetRelativePath.split('/').pop() ?? targetRelativePath
  const targetBasenameNoExt = targetBasename.replace(/\.\w+$/, '')
  const isVeryShortName = targetBasenameNoExt.length <= 2
  // 对极短名文件，使用目标文件的完整相对路径做预过滤
  const targetFullPath = targetRelativePath

  function scanDir(dir: string, depth: number, maxDepth: number): void {
    if (scannedCount >= MAX_DOWNWARD_SCAN_FILES || depth > maxDepth || isTimedOut()) {
      return
    }
    const dirKey = toPosixPath(dir)
    if (scannedDirs.has(dirKey)) {
      return
    }
    scannedDirs.add(dirKey)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (scannedCount >= MAX_DOWNWARD_SCAN_FILES || isTimedOut()) {
        return
      }
      const absPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build' || entry.name === 'target' || entry.name === 'ae') {
          continue
        }
        scanDir(absPath, depth + 1, maxDepth)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      const ext = extname(entry.name)
      if (!RESOLVABLE_EXTENSIONS.includes(ext)) {
        continue
      }
      scannedCount += 1
      const relPath = toPosixPath(relative(root, absPath))
      if (relPath === targetRelativePath) {
        continue
      }
      try {
        const content = readFileSync(absPath, 'utf8')
        // 预过滤：文件名或不含扩展名的 basename 出现在内容中才做完整解析
        // 对极短名文件（a.ts/b.ts）额外要求完整路径匹配避免全量命中
        const shouldParse = isVeryShortName
          ? content.includes(targetFullPath)
          : content.includes(targetBasename) || content.includes(targetBasenameNoExt)
        if (shouldParse) {
          const refs = parseReferences(content, relPath)
          for (const ref of refs) {
            const resolved = resolveReference(root, relPath, ref.raw, ref.type)
            if (resolved === targetRelativePath && !seen.has(relPath)) {
              seen.add(relPath)
              results.push(relPath)
              break
            }
          }
        }
      } catch {
        // 读取失败跳过
      }
    }
  }

  // 分层扫描：目标目录深度2，其他根目录深度3
  for (let i = 0; i < searchRoots.length; i++) {
    if (scannedCount >= MAX_DOWNWARD_SCAN_FILES || isTimedOut()) {
      break
    }
    const maxDepth = i === 0 ? 2 : 3
    scanDir(searchRoots[i], 0, maxDepth)
  }
  return results.sort()
}

function listTopLevelDirs(root: string): string[] {
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'build' && entry.name !== 'target' && entry.name !== 'ae')
      .map((entry) => join(root, entry.name))
      .slice(0, 8)
  } catch {
    return []
  }
}

/**
 * 格式化为 LLM 友好的注入文本。
 * 用于 tool.execute.after hook 自动注入。
 */
export function formatLocalDepsForInjection(result: LocalDepsResult): string {
  const lines: string[] = []
  lines.push(`[local-deps 即时依赖分析] 文件: ${result.filePath}`)
  lines.push(`解析时间: ${result.parsedAt}（即时解析，无持久化，与真实文件一致）`)
  if (result.upstream.length > 0) {
    lines.push(`上游依赖（该文件引用的文件，修改时需同步检查）:`)
    for (const dep of result.upstream) {
      lines.push(`  - ${dep}`)
    }
  } else {
    lines.push(`上游依赖: 无`)
  }
  if (result.downstream.length > 0) {
    lines.push(`下游引用（引用该文件的文件，修改后可能受影响）:`)
    for (const dep of result.downstream) {
      lines.push(`  - ${dep}`)
    }
  } else {
    lines.push(`下游引用: 无（局部扫描范围内未发现，扫描上限${MAX_DOWNWARD_SCAN_FILES}文件）`)
  }
  if (result.unresolved.length > 0) {
    lines.push(`未解析引用（可能为外部包或路径错误）:`)
    for (const ref of result.unresolved.slice(0, 5)) {
      lines.push(`  - ${ref}`)
    }
  }
  lines.push(`提示: 此结果为即时解析，不依赖持久化图谱，无 freshness 滞后问题。`)
  return lines.join('\n')
}

/**
 * 判断文件是否适合做即时依赖解析。
 */
export function isLocalDepsSupported(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return RESOLVABLE_EXTENSIONS.includes(ext)
}
