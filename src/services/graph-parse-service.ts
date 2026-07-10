import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'

import { makeExternalNodeId, makeFileNodeId, makeSymbolNodeId, makeUnresolvedNodeId } from './graph/graph-schema.js'
import type { GraphCompleteness, GraphLayer, GraphRelationSource, GraphSymbolKind } from './graph/graph-schema.js'
import type { GraphConfig } from './graph-config-service.js'
import type { GraphFileNode, GraphRelation, GraphRelationType } from './graph-storage-service.js'
import { loadTreeSitterLanguage } from './graph/tree-sitter-loader.js'
import type { TreeSitterLanguageHandle, TreeSitterNode, TreeSitterTreeResult } from './graph/tree-sitter-loader.js'
import { isInsideRoot, pathContainsSymlink, toPosixPath } from '../utils/path-utils.js'
import { getGraphPathDecision, graphFileTypeForPath, isSupportedGraphFile } from './graph-filter-suggestion-service.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024
export const RESOLVABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.rb', '.php',
  '.swift', '.kt', '.scala', '.vue', '.svelte', '.css', '.scss', '.less', '.html', '.sql', '.prisma', '.graphql',
  '.md', '.txt', '.rst', '.adoc', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.xml',
]

/** 采集的图谱文件，在 `GraphFileNode` 基础上增加绝对路径用于后续读取。 */
export interface CollectedGraphFile extends GraphFileNode {
  absolutePath: string
}

/** 文件关系解析结果，包含文件节点、关系和解析警告。 */
export interface ParsedGraph {
  files: GraphFileNode[]
  relations: GraphRelation[]
  warnings: string[]
  failedFiles: GraphParseIssue[]
  skippedFiles: GraphParseIssue[]
}

/** 单文件解析问题，用于在构建结果中明确暴露被跳过或失败的文件。 */
export interface GraphParseIssue {
  path: string
  reason: string
  sizeBytes?: number
}

function hasIncludedDescendantRule(relativePath: string, config: GraphConfig): boolean {
  const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '').replace(/\/+$/, '')
  return (config.include ?? []).some((rule) => {
    const normalizedRule = toPosixPath(rule.trim())
    const pattern = normalizedRule.replace(/^\/+/, '').replace(/\/+$/, '')
    if (!pattern) {
      return false
    }
    if (pattern === normalizedPath || pattern.startsWith(`${normalizedPath}/`)) {
      return true
    }
    const wildcardIndex = pattern.search(/[?*]/)
    if (wildcardIndex < 0) {
      return false
    }
    const literalPrefix = pattern.slice(0, wildcardIndex)
    const prefixBoundary = literalPrefix.lastIndexOf('/')
    const directoryPrefix = prefixBoundary < 0 ? '' : literalPrefix.slice(0, prefixBoundary)
    return directoryPrefix === normalizedPath
      || directoryPrefix.startsWith(`${normalizedPath}/`)
      || normalizedPath.startsWith(`${directoryPrefix}/`)
  })
}

function shouldExclude(relativePath: string, config: GraphConfig, isDirectory = false): boolean {
  return getGraphPathDecision(relativePath, config, isDirectory).excluded
}

function getLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.md': 'markdown',
    '.txt': 'text',
  }
  return map[ext]
}

function getTreeSitterGrammarName(filePath: string, language: string | undefined): string | undefined {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.tsx') {
    return 'tsx'
  }
  if (ext === '.ts') {
    return 'typescript'
  }
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    return 'javascript'
  }
  if (language === 'python' || language === 'java' || language === 'go') {
    return language
  }
  return undefined
}

/**
 * 递归采集工作区内所有可解析文件。
 * 排除 `.git`、敏感文件、图谱输出目录和用户配置的排除规则匹配路径。
 */
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
      const decision = getGraphPathDecision(relativePath, config, entry.isDirectory())
      if (decision.excluded) {
        if (entry.isDirectory() && !decision.hardExcluded && hasIncludedDescendantRule(relativePath, config)) {
          visit(absolutePath)
        }
        continue
      }
      if (entry.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !isSupportedGraphFile(entry.name)) {
        continue
      }
      const fileStat = statSync(absolutePath)
      files.push({
        absolutePath,
        relativePath,
        fileType: graphFileTypeForPath(entry.name),
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

function stableReferenceIndex(sourcePath: string, rawTarget: string, relationType: GraphRelationType, line: number): number {
  const key = `${sourcePath}\0${rawTarget}\0${relationType}\0${line}`
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash * 31) + key.charCodeAt(index)) >>> 0
  }
  return hash
}

function stableSymbolPath(kind: GraphSymbolKind, name: string, line: number): string {
  const stableName = name.replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '') || 'anonymous'
  return `${kind}:${stableName}:${line}`
}

function isLineComment(lineContent: string, language: string | undefined): boolean {
  const trimmed = lineContent.trimStart()
  if (!trimmed) {
    return true
  }
  if (language === 'markdown') {
    return trimmed.startsWith('<!--')
  }
  if (language === 'python') {
    return trimmed.startsWith('#')
  }
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')
}

function commentStateBeforeLine(lines: string[], lineIndex: number, language: string | undefined): { block: boolean; html: boolean } {
  let block = false
  let html = false
  for (let index = 0; index < lineIndex; index += 1) {
    const line = lines[index]
    if (language !== 'python') {
      const blockOpen = line.indexOf('/*')
      const blockClose = line.indexOf('*/')
      if (!block && blockOpen >= 0 && (blockClose < 0 || blockOpen < blockClose)) {
        block = true
      }
      if (block && blockClose >= 0) {
        block = false
      }
    }
    const htmlOpen = line.indexOf('<!--')
    const htmlClose = line.indexOf('-->')
    if (!html && htmlOpen >= 0 && (htmlClose < 0 || htmlOpen < htmlClose)) {
      html = true
    }
    if (html && htmlClose >= 0) {
      html = false
    }
  }
  return { block, html }
}

function isCommentOnlyLine(lines: string[], lineIndex: number, language: string | undefined): boolean {
  const state = commentStateBeforeLine(lines, lineIndex, language)
  if (state.block || state.html) {
    return true
  }
  return isLineComment(lines[lineIndex], language)
}

function stripTrailingComment(lineContent: string, language: string | undefined): string {
  if (language === 'typescript' || language === 'javascript') {
    return lineContent.split('//')[0].split('/*')[0]
  }
  if (language === 'markdown') {
    return lineContent.split('<!--')[0]
  }
  if (language === 'python') {
    return lineContent.split('#')[0]
  }
  return lineContent
}

async function pushTreeSitterAst(
  nodes: GraphFileNode[],
  relations: GraphRelation[],
  worktree: string,
  sourcePath: string,
  content: string,
  language: string,
  config: GraphConfig,
  warnings: string[],
): Promise<boolean> {
  const grammar = getTreeSitterGrammarName(sourcePath, language)
  if (!grammar) {
    return false
  }
  let handle: TreeSitterLanguageHandle | null = null
  let tree: TreeSitterTreeResult | null = null

  function lineOf(node: { startPosition: { row: number } }): number {
    return node.startPosition.row + 1
  }

  function textOf(node: { text: string }): string {
    return node.text.trim()
  }

  function pushNameNode(symbolKind: GraphSymbolKind, name: string, line: number): void {
    if (!name) {
      return
    }
    pushSymbol(nodes, relations, sourcePath, symbolKind, name, line, 'tree-sitter')
  }

  try {
    handle = await loadTreeSitterLanguage(grammar)
    tree = handle.parse(content)
    const sourceFile = tree.rootNode

    function walk(node: TreeSitterNode): void {
      switch (node.type) {
        case 'import_statement': {
          const source = node.children.find((child) => child.type === 'string')
          if (source) {
            pushReference(relations, worktree, sourcePath, textOf(source).slice(1, -1), 'import', lineOf(node), config, 'tree-sitter')
          }
          break
        }
        case 'export_statement': {
          const source = node.children.find((child) => child.type === 'string')
          if (source) {
            pushReference(relations, worktree, sourcePath, textOf(source).slice(1, -1), 'import', lineOf(node), config, 'tree-sitter')
          }
          break
        }
        case 'call_expression': {
          const expression = node.childForFieldName('function') ?? node.children[0]
          const args = node.childForFieldName('arguments')?.children ?? []
          const firstArg = args.find((child) => child.type === 'string')
          if (firstArg && expression?.type === 'identifier' && expression.text === 'require') {
            pushReference(relations, worktree, sourcePath, textOf(firstArg).slice(1, -1), 'require', lineOf(node), config, 'tree-sitter')
          }
          if (firstArg && expression?.type === 'import') {
            pushReference(relations, worktree, sourcePath, textOf(firstArg).slice(1, -1), 'import', lineOf(node), config, 'tree-sitter')
          }
          break
        }
        case 'class_declaration':
          pushNameNode('class', node.childForFieldName('name')?.text ?? '', lineOf(node))
          break
        case 'interface_declaration':
          pushNameNode('interface', node.childForFieldName('name')?.text ?? '', lineOf(node))
          break
        case 'enum_declaration':
          pushNameNode('enum', node.childForFieldName('name')?.text ?? '', lineOf(node))
          break
        case 'type_alias_declaration':
          pushNameNode('type', node.childForFieldName('name')?.text ?? '', lineOf(node))
          break
        case 'function_declaration':
          pushNameNode('function', node.childForFieldName('name')?.text ?? '', lineOf(node))
          break
        case 'lexical_declaration': {
          for (const declaration of node.children.filter((child) => child.type === 'variable_declarator')) {
            const name = declaration.childForFieldName('name')?.text ?? ''
            const valueType = declaration.childForFieldName('value')?.type
            const symbolKind: GraphSymbolKind = valueType === 'arrow_function' || valueType === 'function_expression' ? 'function' : 'variable'
            pushNameNode(symbolKind, name, lineOf(declaration))
          }
          break
        }
        default:
          break
      }
      for (const child of node.children) {
        if (node.type === 'function_declaration' || node.type === 'class_declaration') {
          continue
        }
        walk(child)
      }
    }

    walk(sourceFile)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`tree-sitter 解析失败：${sourcePath} - ${message}`)
    return false
  } finally {
    tree?.delete()
    handle?.dispose()
  }
}

function pushLegacyLanguageParse(
  nodes: GraphFileNode[],
  relations: GraphRelation[],
  worktree: string,
  file: CollectedGraphFile,
  lines: string[],
  markdownReferences: Map<string, string>,
  config: GraphConfig,
): void {
  pushShallowSymbols(nodes, relations, file.relativePath, file.language, lines)
  pushFallbackReferences(relations, worktree, file, lines, markdownReferences, config)
}

async function parseByLanguage(
  nodes: GraphFileNode[],
  relations: GraphRelation[],
  worktree: string,
  file: CollectedGraphFile,
  content: string,
  lines: string[],
  markdownReferences: Map<string, string>,
  config: GraphConfig,
  warnings: string[],
): Promise<void> {
  if (file.language === 'typescript' || file.language === 'javascript' || file.language === 'python' || file.language === 'java' || file.language === 'go') {
    const parsed = await pushTreeSitterAst(nodes, relations, worktree, file.relativePath, content, file.language, config, warnings)
    if (!parsed) {
      pushLegacyLanguageParse(nodes, relations, worktree, file, lines, markdownReferences, config)
      return
    }
    if (file.language === 'python' || file.language === 'java' || file.language === 'go') {
      pushShallowSymbols(nodes, relations, file.relativePath, file.language, lines)
      pushFallbackReferences(relations, worktree, file, lines, markdownReferences, config)
      return
    }
    pushMarkdownLinkReferences(relations, worktree, file, lines, markdownReferences, config)
    return
  }
  pushShallowSymbols(nodes, relations, file.relativePath, file.language, lines)
  pushFallbackReferences(relations, worktree, file, lines, markdownReferences, config)
}

export function pushMarkdownLinkReferences(
  relations: GraphRelation[],
  worktree: string,
  file: CollectedGraphFile,
  lines: string[],
  markdownReferences: Map<string, string>,
  config: GraphConfig,
): void {
  lines.forEach((lineContent, index) => {
    const line = index + 1
    // HTML comment include 指令从原始行内容解析，不受注释过滤影响
    for (const match of lineContent.matchAll(/<!--\s*include\s+(.+?)\s*-->/g)) {
      pushDocumentReference(relations, worktree, file.relativePath, match[1], 'include', line, config)
    }
    if (isCommentOnlyLine(lines, index, file.language)) {
      return
    }
    const content = stripTrailingComment(lineContent, file.language)
    // 行内链接
    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (!/^https?:\/\//i.test(match[1]) && !match[1].startsWith('#')) {
        pushDocumentReference(relations, worktree, file.relativePath, match[1], 'link', line, config)
      }
    }
    // 引用式链接
    for (const match of content.matchAll(/\[[^\]]+\]\[([^\]]+)\]/g)) {
      const target = markdownReferences.get(match[1].toLowerCase())
      if (target && !/^https?:\/\//i.test(target) && !target.startsWith('#')) {
        pushDocumentReference(relations, worktree, file.relativePath, target, 'link', line, config)
      }
    }
    // 图片引用
    for (const match of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!/^https?:\/\//i.test(match[1]) && !match[1].startsWith('#')) {
        pushDocumentReference(relations, worktree, file.relativePath, match[1], 'image_reference', line, config)
      }
    }
  })
}

function pushFallbackReferences(
  relations: GraphRelation[],
  worktree: string,
  file: CollectedGraphFile,
  lines: string[],
  markdownReferences: Map<string, string>,
  config: GraphConfig,
): void {
  lines.forEach((lineContent, index) => {
    const line = index + 1
    if (isLineComment(lineContent, file.language)) {
      return
    }
    for (const match of lineContent.matchAll(/import\s+(?:[^'\"]+?\s+from\s+)?['\"]([^'\"]+)['\"]/g)) {
      pushReference(relations, worktree, file.relativePath, match[1], 'import', line, config)
    }
    for (const match of lineContent.matchAll(/require\(\s*['\"]([^'\"]+)['\"]\s*\)/g)) {
      pushReference(relations, worktree, file.relativePath, match[1], 'require', line, config)
    }
    for (const match of lineContent.matchAll(/include\s+["'<]?([^"'>\s]+)["'>]?/g)) {
      pushReference(relations, worktree, file.relativePath, match[1], 'include', line, config)
    }
    if (file.language === 'python' || file.language === 'java') {
      for (const match of lineContent.matchAll(/^\s*(?:from\s+([.\w]+)\s+import\s+\w+|import\s+([.\w]+))/g)) {
        const rawImport = match[1] ?? match[2]
        const normalizedImport = rawImport.startsWith('.') ? rawImport.replaceAll('.', '/') : rawImport
        pushReference(relations, worktree, file.relativePath, normalizedImport, 'import', line, config)
      }
    }
    if (file.language === 'go') {
      for (const match of lineContent.matchAll(/^\s*import\s+(?:\(\s*)?["']([^"']+)["']\s*\)?\s*;?$/g)) {
        pushReference(relations, worktree, file.relativePath, match[1], 'import', line, config)
      }
    }
  })
  pushMarkdownLinkReferences(relations, worktree, file, lines, markdownReferences, config)
}

function getSortNodeId(file: GraphFileNode): string {
  return file.id ?? file.relativePath
}

function pushSymbol(
  nodes: GraphFileNode[],
  relations: GraphRelation[],
  sourcePath: string,
  symbolKind: GraphSymbolKind,
  label: string,
  line: number,
  parser = 'regex-shallow',
): void {
  const symbolPath = stableSymbolPath(symbolKind, label, line)
  const fileId = makeFileNodeId(sourcePath)
  const symbolId = makeSymbolNodeId(sourcePath, symbolPath)
  nodes.push({
    id: symbolId,
    kind: 'symbol',
    relativePath: sourcePath,
    label,
    fileType: 'source',
    nodePath: symbolPath,
    range: { startLine: line },
    parentId: fileId,
    parser,
    symbolKind,
  })
  relations.push({
    id: `${fileId}->${symbolId}:contains:${line}`,
    sourceId: fileId,
    targetId: symbolId,
    type: 'contains',
    confidence: 'candidate',
    sourcePath,
    targetPath: sourcePath,
    relationType: 'contains',
    range: { startLine: line },
    parser,
    evidence: label,
  })
}

function pushShallowSymbols(nodes: GraphFileNode[], relations: GraphRelation[], sourcePath: string, language: string | undefined, lines: string[]): void {
  lines.forEach((lineContent, index) => {
    const line = index + 1
    if (language === 'markdown') {
      const heading = lineContent.match(/^(#{1,6})\s+(.+)$/)
      if (heading) {
        pushSymbol(nodes, relations, sourcePath, 'section', heading[2].trim(), line)
      }
      return
    }
    const patterns: Array<[RegExp, GraphSymbolKind]> = [
      [/\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class'],
      [/\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/, 'interface'],
      [/\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/, 'enum'],
      [/\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/, 'type'],
      [/\b(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, 'function'],
      [/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, 'function'],
      [/\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, 'variable'],
    ]
    for (const [pattern, symbolKind] of patterns) {
      const match = lineContent.match(pattern)
      if (match) {
        pushSymbol(nodes, relations, sourcePath, symbolKind, match[1], line)
        break
      }
    }
  })
}

function pushReference(
  relations: GraphRelation[],
  worktree: string,
  sourcePath: string,
  rawTarget: string,
  relationType: GraphRelationType,
  line: number,
  config: GraphConfig,
  parser = 'regex-shallow',
  extraFields?: { layer?: GraphLayer; source?: GraphRelationSource; completeness?: GraphCompleteness },
): void {
  // 文档层关系允许裸相对路径（如 image.png），与 link 行为一致
  const allowBareRelative = relationType === 'link' || relationType === 'image_reference' || extraFields?.layer === 'document'
  const targetPath = resolveRelativeReference(worktree, sourcePath, rawTarget, allowBareRelative)
  const sourceId = makeFileNodeId(sourcePath)
  if (targetPath && shouldExclude(targetPath, config)) {
    const targetId = makeUnresolvedNodeId(sourceId, relationType, stableReferenceIndex(sourcePath, rawTarget, relationType, line))
    relations.push({
      id: `${sourceId}->${targetId}:${relationType}:${line}`,
      sourceId,
      targetId,
      type: 'external_reference',
      confidence: 'unresolved',
      sourcePath,
      targetPath: rawTarget,
      relationType: 'external',
      range: { startLine: line },
      parser,
      evidence: rawTarget,
      reason: '目标被图谱排除规则过滤',
      metadata: { line, raw: rawTarget, confidence: 'unresolved' },
      layer: extraFields?.layer,
      source: extraFields?.source,
      // 被排除的目标视为未解析，覆盖为 incomplete
      completeness: extraFields?.completeness != null ? 'incomplete' : undefined,
    })
    return
  }
  const resolved = !!targetPath
  const targetId = resolved ? makeFileNodeId(targetPath) : makeExternalNodeId('unknown', rawTarget)
  const type = resolved && relationType !== 'external' ? relationType : 'external_reference'
  relations.push({
    id: `${sourceId}->${targetId}:${type}:${line}`,
    sourceId,
    targetId,
    type,
    confidence: resolved ? 'resolved' : 'unresolved',
    sourcePath,
    targetPath: targetPath ?? rawTarget,
    relationType: resolved ? relationType : 'external',
    range: { startLine: line },
    parser,
    evidence: rawTarget,
    reason: resolved ? undefined : '无法解析为工作区内文件',
    metadata: { line, raw: rawTarget, confidence: resolved ? 'resolved' : 'unresolved' },
    layer: extraFields?.layer,
    source: extraFields?.source,
    // 未解析时覆盖为 incomplete，已解析时保留调用方传入的 completeness
    completeness: extraFields?.completeness != null
      ? (resolved ? extraFields.completeness : 'incomplete')
      : undefined,
  })
}

/** 文档层关系推送：自动设置 layer=document, source=regex, completeness 根据解析状态决定 */
export function pushDocumentReference(
  relations: GraphRelation[],
  worktree: string,
  sourcePath: string,
  rawTarget: string,
  relationType: GraphRelationType,
  line: number,
  config: GraphConfig,
): void {
  pushReference(relations, worktree, sourcePath, rawTarget, relationType, line, config, 'regex-shallow', {
    layer: 'document',
    source: 'regex',
    completeness: 'full',
  })
}

/**
 * 解析文件列表的依赖关系和符号定义。
 * 优先使用 tree-sitter 解析（TS/JS/Python/Java/Go），回退到正则浅层解析。
 */
export async function parseFileRelations(worktree: string, files: CollectedGraphFile[], config: GraphConfig): Promise<ParsedGraph> {
  const warnings: string[] = []
  const failedFiles: GraphParseIssue[] = []
  const skippedFiles: GraphParseIssue[] = []
  const relations: GraphRelation[] = []
  const fileNodes: GraphFileNode[] = []

  for (const file of files) {
    if (shouldExclude(file.relativePath, config)) {
      continue
    }
    fileNodes.push({
      id: makeFileNodeId(file.relativePath),
      kind: 'file',
      relativePath: file.relativePath,
      label: file.relativePath.split('/').pop(),
      fileType: file.fileType,
      language: file.language,
      sizeBytes: file.sizeBytes,
      parser: 'filesystem',
    })
    const parent = toPosixPath(dirname(file.relativePath))
    if (parent && parent !== '.') {
      fileNodes.push({
        id: `directory:${parent}`,
        kind: 'directory',
        label: parent.split('/').pop(),
        relativePath: parent,
        fileType: 'directory',
        parser: 'filesystem',
      })
      relations.push({
        id: `${makeFileNodeId(file.relativePath)}->directory:${parent}:directory`,
        sourceId: makeFileNodeId(file.relativePath),
        targetId: `directory:${parent}`,
        type: 'directory',
        confidence: 'resolved',
        sourcePath: file.relativePath,
        targetPath: parent,
        relationType: 'directory',
        parser: 'filesystem',
        evidence: parent,
      })
    }
    if ((file.sizeBytes ?? 0) > MAX_FILE_BYTES) {
      const reason = `文件超过 ${MAX_FILE_BYTES} 字节上限`
      skippedFiles.push({ path: file.relativePath, reason, sizeBytes: file.sizeBytes })
      warnings.push(`已跳过超大文件：${file.relativePath} - ${reason}`)
      continue
    }

    let content = ''
    try {
      content = readFileSync(file.absolutePath, 'utf8')
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failedFiles.push({ path: file.relativePath, reason, sizeBytes: file.sizeBytes })
      warnings.push(`无法读取文件：${file.relativePath} - ${reason}`)
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
    try {
      await parseByLanguage(fileNodes, relations, worktree, file, content, lines, markdownReferences, config, warnings)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failedFiles.push({ path: file.relativePath, reason, sizeBytes: file.sizeBytes })
      warnings.push(`文件解析失败：${file.relativePath} - ${reason}`)
    }
  }

  const uniqueFiles = new Map(fileNodes.map((file) => [file.id ?? file.relativePath, file]))
  return {
    files: [...uniqueFiles.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath) || getSortNodeId(a).localeCompare(getSortNodeId(b))),
    relations,
    warnings,
    failedFiles,
    skippedFiles,
  }
}
