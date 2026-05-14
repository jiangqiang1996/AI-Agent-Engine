import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

import { matchGraphExcludePath, type GraphConfig } from './graph-config-service.js'
import type { GraphFileNode, GraphRelation, GraphRelationType } from './graph-storage-service.js'
import { isInsideRoot, pathContainsSymlink, toPosixPath } from '../utils/path-utils.js'

const DEFAULT_EXCLUDED_DIRS = new Set(['.git', '.ae'])
const SENSITIVE_FILENAMES = [/^\.env/, /credential/i, /secret/i, /password/i, /token/i, /private[-_]?key/i]
const MAX_FILE_BYTES = 1024 * 1024

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.rb', '.php',
  '.swift', '.kt', '.scala', '.vue', '.svelte', '.css', '.scss', '.less', '.html', '.sql', '.prisma', '.graphql',
])
const DOCUMENT_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.adoc'])
const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml'])
const RESOLVABLE_EXTENSIONS = [...SOURCE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...CONFIG_EXTENSIONS]

export interface CollectedGraphFile extends GraphFileNode {
  absolutePath: string
}

export interface ParsedGraph {
  files: GraphFileNode[]
  relations: GraphRelation[]
  warnings: string[]
}

function shouldExclude(relativePath: string, config: GraphConfig, isDirectory = false): boolean {
  if (relativePath === 'docs/ae/graphs' || relativePath.startsWith('docs/ae/graphs/')) {
    return true
  }
  const parts = relativePath.split('/')
  if (parts.some((part) => DEFAULT_EXCLUDED_DIRS.has(part))) {
    return true
  }
  if (SENSITIVE_FILENAMES.some((pattern) => pattern.test(parts.at(-1) ?? ''))) {
    return true
  }
  return matchGraphExcludePath(relativePath, config.exclude, isDirectory).excluded
}

function hasNegatedDescendantRule(relativePath: string, config: GraphConfig): boolean {
  return config.exclude.some((rule) => {
    const normalizedRule = toPosixPath(rule.trim())
    if (!normalizedRule.startsWith('!')) {
      return false
    }
    const pattern = normalizedRule.slice(1).replace(/^\/+/, '').replace(/\/+$/, '')
    return pattern.startsWith('**/') || pattern === relativePath || pattern.startsWith(`${relativePath}/`)
  })
}

function getFileType(filePath: string): GraphFileNode['fileType'] {
  const ext = extname(filePath).toLowerCase()
  if (DOCUMENT_EXTENSIONS.has(ext)) {
    return 'document'
  }
  if (CONFIG_EXTENSIONS.has(ext)) {
    return 'config'
  }
  return 'source'
}

function getLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.md': 'markdown',
    '.txt': 'text',
  }
  return map[ext]
}

function isSupportedFile(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase()
  return SOURCE_EXTENSIONS.has(ext) || DOCUMENT_EXTENSIONS.has(ext) || CONFIG_EXTENSIONS.has(ext)
}

export function collectGraphFiles(worktree: string, target: string, config: GraphConfig): CollectedGraphFile[] {
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
  const files: CollectedGraphFile[] = []

  function visit(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        continue
      }
      const relativePath = toPosixPath(relative(root, absolutePath))
      if (shouldExclude(relativePath, config, entry.isDirectory())) {
        if (entry.isDirectory() && hasNegatedDescendantRule(relativePath, config)) {
          visit(absolutePath)
        }
        continue
      }
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !isSupportedFile(entry.name)) {
        continue
      }
      const fileStat = statSync(absolutePath)
      files.push({
        absolutePath,
        relativePath,
        fileType: getFileType(entry.name),
        language: getLanguage(entry.name),
        sizeBytes: fileStat.size,
      })
    }
  }

  visit(start)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function resolveRelativeReference(worktree: string, sourcePath: string, rawTarget: string, allowBareRelative = false): string | undefined {
  if (!allowBareRelative && !rawTarget.startsWith('.') && !rawTarget.startsWith('/')) {
    return undefined
  }
  const withoutHash = rawTarget.split('#')[0].split('?')[0]
  const sourceDir = dirname(resolve(worktree, sourcePath))
  const primaryBase = rawTarget.startsWith('/') ? worktree : sourceDir
  const primaryTarget = rawTarget.startsWith('/') ? withoutHash.replace(/^\/+/, '') : withoutHash
  const resolved = resolveReferenceCandidate(worktree, primaryBase, primaryTarget)
  if (resolved) {
    return resolved
  }
  if (allowBareRelative && !rawTarget.startsWith('.') && !rawTarget.startsWith('/')) {
    return resolveReferenceCandidate(worktree, worktree, withoutHash)
  }
  return undefined
}

function resolveReferenceCandidate(worktree: string, base: string, target: string): string | undefined {
  const absoluteTarget = resolve(base, target)
  if (!isInsideRoot(worktree, absoluteTarget)) {
    return undefined
  }
  if (existsSync(absoluteTarget) && pathContainsSymlink(worktree, absoluteTarget)) {
    return undefined
  }
  if (existsSync(absoluteTarget) && !isInsideRoot(realpathSync(worktree), realpathSync(absoluteTarget))) {
    return undefined
  }
  if (existsSync(absoluteTarget) && lstatSync(absoluteTarget).isSymbolicLink()) {
    return undefined
  }
  if (existsSync(absoluteTarget) && statSync(absoluteTarget).isFile()) {
    return toPosixPath(relative(worktree, absoluteTarget))
  }
  if (pathContainsSymlink(worktree, absoluteTarget)) {
    return undefined
  }
  if (extname(absoluteTarget)) {
    return toPosixPath(relative(worktree, absoluteTarget))
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = `${absoluteTarget}${ext}`
    if (existsSync(candidate) && !pathContainsSymlink(worktree, candidate) && isInsideRoot(realpathSync(worktree), realpathSync(candidate))) {
      return toPosixPath(relative(worktree, candidate))
    }
  }
  for (const ext of RESOLVABLE_EXTENSIONS) {
    const candidate = join(absoluteTarget, `index${ext}`)
    if (existsSync(candidate) && !pathContainsSymlink(worktree, candidate) && isInsideRoot(realpathSync(worktree), realpathSync(candidate))) {
      return toPosixPath(relative(worktree, candidate))
    }
  }
  return undefined
}

function pushReference(
  relations: GraphRelation[],
  worktree: string,
  sourcePath: string,
  rawTarget: string,
  relationType: GraphRelationType,
  line: number,
  config: GraphConfig,
): void {
  const targetPath = resolveRelativeReference(worktree, sourcePath, rawTarget, relationType === 'link')
  if (targetPath && shouldExclude(targetPath, config)) {
    relations.push({
      sourcePath,
      targetPath: rawTarget,
      relationType: 'external',
      metadata: { line, raw: rawTarget, confidence: 'regex' },
    })
    return
  }
  relations.push({
    sourcePath,
    targetPath: targetPath ?? rawTarget,
    relationType: targetPath ? relationType : 'external',
    metadata: { line, raw: rawTarget, confidence: 'regex' },
  })
}

export function parseFileRelations(worktree: string, files: CollectedGraphFile[], config: GraphConfig): ParsedGraph {
  const warnings: string[] = []
  const relations: GraphRelation[] = []
  const fileNodes: GraphFileNode[] = []

  for (const file of files) {
    if (shouldExclude(file.relativePath, config)) {
      continue
    }
    fileNodes.push({
      relativePath: file.relativePath,
      fileType: file.fileType,
      language: file.language,
      sizeBytes: file.sizeBytes,
    })
    const parent = toPosixPath(dirname(file.relativePath))
    if (parent && parent !== '.') {
      fileNodes.push({ relativePath: parent, fileType: 'directory' })
      relations.push({ sourcePath: file.relativePath, targetPath: parent, relationType: 'directory' })
    }
    if ((file.sizeBytes ?? 0) > MAX_FILE_BYTES) {
      warnings.push(`已跳过超大文件：${file.relativePath}`)
      continue
    }

    let content = ''
    try {
      content = readFileSync(file.absolutePath, 'utf8')
    } catch {
      warnings.push(`无法读取文件：${file.relativePath}`)
      continue
    }

    const lines = content.split(/\r?\n/)
    const markdownReferences = new Map<string, string>()
    if (file.language === 'markdown') {
      for (const lineContent of lines) {
        const definition = lineContent.match(/^\s*\[([^\]]+)\]:\s*(\S+)/)
        if (definition) {
          markdownReferences.set(definition[1].toLowerCase(), definition[2])
        }
      }
    }
    lines.forEach((lineContent, index) => {
      const line = index + 1
      for (const match of lineContent.matchAll(/import\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g)) {
        pushReference(relations, worktree, file.relativePath, match[1], 'import', line, config)
      }
      for (const match of lineContent.matchAll(/require\(\s*['\"]([^'\"]+)['\"]\s*\)/g)) {
        pushReference(relations, worktree, file.relativePath, match[1], 'require', line, config)
      }
      for (const match of lineContent.matchAll(/include\s+["'<]?([^"'>\s]+)["'>]?/g)) {
        pushReference(relations, worktree, file.relativePath, match[1], 'include', line, config)
      }
      for (const match of lineContent.matchAll(/^\s*(?:from\s+([.\w]+)\s+import\s+\w+|import\s+([.\w]+))/g)) {
        const rawImport = match[1] ?? match[2]
        const normalizedImport = rawImport.startsWith('.') ? rawImport.replaceAll('.', '/') : rawImport
        pushReference(relations, worktree, file.relativePath, normalizedImport, 'import', line, config)
      }
      for (const match of lineContent.matchAll(/^\s*import\s+(?:\(\s*)?["']?([^"'();\s]+)["']?\s*;?/g)) {
        pushReference(relations, worktree, file.relativePath, match[1], 'import', line, config)
      }
      for (const match of lineContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        if (!/^https?:\/\//i.test(match[1])) {
          pushReference(relations, worktree, file.relativePath, match[1], 'link', line, config)
        }
      }
      for (const match of lineContent.matchAll(/\[[^\]]+\]\[([^\]]+)\]/g)) {
        const target = markdownReferences.get(match[1].toLowerCase())
        if (target && !/^https?:\/\//i.test(target)) {
          pushReference(relations, worktree, file.relativePath, target, 'link', line, config)
        }
      }
    })
  }

  const uniqueFiles = new Map(fileNodes.map((file) => [file.relativePath, file]))
  return { files: [...uniqueFiles.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath)), relations, warnings }
}
