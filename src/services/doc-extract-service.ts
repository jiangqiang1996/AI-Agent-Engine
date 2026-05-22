import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { Effect } from 'effect'

import { parseFrontmatter, type FrontmatterData } from '../utils/frontmatter.js'

export interface DocExtractOptions {
  path: string
  ids?: string[]
  modules?: string[]
  includeGlobalContext?: boolean
  repoRoot?: string
}

export interface DocDiagnostic {
  code: string
  message: string
  path?: string
}

export interface DocExtractSection {
  id?: string
  module?: string
  source: string
  title: string
  content: string
}

export interface DocExtractResult {
  metadata: FrontmatterData & { source: string }
  artifacts: string[]
  scope: DocExtractSection[]
  goals: DocExtractSection[]
  requirements: DocExtractSection[]
  implementationUnits: DocExtractSection[]
  designSections: DocExtractSection[]
  constraints: DocExtractSection[]
  questions: DocExtractSection[]
  nonFunctionalRequirements?: DocExtractSection[]
  risks?: DocExtractSection[]
  decisions?: DocExtractSection[]
  entities?: DocExtractSection[]
  interfaces?: DocExtractSection[]
  diagnostics: DocDiagnostic[]
}

interface SourceDocument {
  path: string
  absolutePath: string
  frontmatter: FrontmatterData
  body: string
}

interface ShardIndexItem {
  file?: unknown
  module?: unknown
  requirements?: unknown
  implementationUnits?: unknown
  decisions?: unknown
}

const ID_PATTERN = /\b(?:G|R|NFR|TC|BC|RISK|D|Q|U)\d+(?:-AC\d+|-BR\d+)?\b/g

/**
 * 提取 AE 人读文档中的结构化片段。
 * 支持主文档与分片文档，并按稳定 ID 或模块筛选返回可被工具层序列化的结果。
 */
export function extractDoc(options: DocExtractOptions): DocExtractResult {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const diagnostics: DocDiagnostic[] = []
  const root = readDocument(repoRoot, options.path)
  addDirectShardDiagnostics(root, diagnostics)
  const documents = [root, ...readShardDocuments(repoRoot, root, options, diagnostics)]
  const selected = filterDocuments(documents, options)
  addDuplicateIdDiagnostics(selected, diagnostics)
  const result = createEmptyResult(root, selected, diagnostics)

  for (const document of selected) {
    addSections(result, document, options)
  }

  return pruneOptionalArrays(result)
}

function readDocument(repoRoot: string, inputPath: string): SourceDocument {
  return Effect.runSync(Effect.try({
    try: () => {
      const absolutePath = resolvePathInRepo(repoRoot, inputPath)
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        throw new Error(`文档不存在或不是文件：${inputPath}`)
      }
      const parsed = parseFrontmatter(readFileSync(absolutePath, 'utf8'))
      return {
        path: toRepoPath(repoRoot, absolutePath),
        absolutePath,
        frontmatter: parsed.data,
        body: parsed.body,
      }
    },
    catch: (error) => error instanceof Error ? error : new Error(String(error)),
  }))
}

function resolvePathInRepo(repoRoot: string, inputPath: string): string {
  const absolutePath = isAbsolute(inputPath) ? resolve(inputPath) : resolve(repoRoot, inputPath)
  const relativePath = relative(repoRoot, absolutePath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`路径必须位于当前工作区内：${inputPath}`)
  }
  return absolutePath
}

function readShardDocuments(
  repoRoot: string,
  root: SourceDocument,
  options: DocExtractOptions,
  diagnostics: DocDiagnostic[],
): SourceDocument[] {
  if (root.frontmatter.sharded !== true) {
    return []
  }
  if (!Array.isArray(root.frontmatter.shards)) {
    diagnostics.push({ code: 'missing-shards-index', message: '分片主文件缺少 shards 索引', path: root.path })
    return []
  }

  const items = root.frontmatter.shards as ShardIndexItem[]
  const filteredItems = filterShardIndexItems(items, options)
  const hasIdFilter = Boolean(options.ids?.length)
  const shouldReadAllForIdCoverage = hasIdFilter && filteredItems.length > 0 && filteredItems.length < items.length
  const targetItems = filteredItems.length > 0 && !shouldReadAllForIdCoverage ? filteredItems : items
  if (filteredItems.length === 0 && (options.ids?.length || options.modules?.length)) {
    diagnostics.push({ code: 'shard-index-filter-miss', message: '分片索引未命中筛选条件，已降级读取全部分片', path: root.path })
  }
  if (shouldReadAllForIdCoverage) {
    diagnostics.push({ code: 'shard-index-id-coverage', message: '分片索引只命中部分分片，已降级读取全部分片以确认 ID 覆盖', path: root.path })
  }

  return targetItems.flatMap((item) => {
    if (typeof item.file !== 'string') {
      diagnostics.push({ code: 'invalid-shard-entry', message: '分片索引缺少 file 字段', path: root.path })
      return []
    }

    try {
      const document = readDocument(repoRoot, item.file)
      const parent = typeof document.frontmatter.parent === 'string' ? normalizePath(document.frontmatter.parent) : undefined
      if (parent && parent !== normalizePath(root.path)) {
        diagnostics.push({ code: 'parent-mismatch', message: '分片 parent 与主文件路径不一致', path: document.path })
      }
      if (!parent && String(document.frontmatter.type ?? '').endsWith('-shard')) {
        diagnostics.push({ code: 'missing-parent', message: '分片文件缺少 parent 字段', path: document.path })
      }
      return [document]
    } catch (error) {
      diagnostics.push({ code: 'missing-shard', message: error instanceof Error ? error.message : String(error), path: item.file })
      return []
    }
  })
}

function addDirectShardDiagnostics(document: SourceDocument, diagnostics: DocDiagnostic[]): void {
  if (!String(document.frontmatter.type ?? '').endsWith('-shard')) {
    return
  }
  if (typeof document.frontmatter.parent !== 'string' || document.frontmatter.parent.trim() === '') {
    diagnostics.push({ code: 'missing-parent', message: '分片文件缺少 parent 字段', path: document.path })
  }
}

function filterShardIndexItems(items: ShardIndexItem[], options: DocExtractOptions): ShardIndexItem[] {
  return items.filter((item) => {
    const moduleMatch = !options.modules?.length || (typeof item.module === 'string' && options.modules.includes(item.module))
    const indexedIds = [item.requirements, item.implementationUnits, item.decisions]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .filter((value): value is string => typeof value === 'string')
    const idMatch = !options.ids?.length || options.ids.some((id) => indexedIds.includes(id))
    return moduleMatch && idMatch
  })
}

function filterDocuments(documents: SourceDocument[], options: DocExtractOptions): SourceDocument[] {
  return documents.filter((document, index) => {
    if (index === 0 && options.includeGlobalContext !== false) {
      return true
    }
    if (index === 0 && options.includeGlobalContext === false && options.modules?.length) {
      return false
    }
    const moduleName = typeof document.frontmatter.module === 'string' ? document.frontmatter.module : undefined
    const moduleMatch = !options.modules?.length || (moduleName ? options.modules.includes(moduleName) : false)
    const idMatch = !options.ids?.length || options.ids.some((id) => document.body.includes(id))
    return moduleMatch && idMatch
  })
}

function createEmptyResult(root: SourceDocument, documents: SourceDocument[], diagnostics: DocDiagnostic[]): DocExtractResult {
  return {
    metadata: { ...root.frontmatter, source: root.path },
    artifacts: Array.from(new Set(documents.map((document) => String(document.frontmatter.type ?? 'unknown')))),
    scope: [],
    goals: [],
    requirements: [],
    implementationUnits: [],
    designSections: [],
    constraints: [],
    questions: [],
    nonFunctionalRequirements: [],
    risks: [],
    decisions: [],
    entities: [],
    interfaces: [],
    diagnostics,
  }
}

function addDuplicateIdDiagnostics(documents: SourceDocument[], diagnostics: DocDiagnostic[]): void {
  const occurrencesById = new Map<string, { count: number; locations: Set<string> }>()
  for (const document of documents) {
    for (const id of extractDefinedIds(document.body)) {
      const occurrence = occurrencesById.get(id) ?? { count: 0, locations: new Set<string>() }
      occurrence.count += 1
      occurrence.locations.add(document.path)
      occurrencesById.set(id, occurrence)
    }
  }

  for (const [id, occurrence] of occurrencesById) {
    if (occurrence.count > 1) {
      diagnostics.push({
        code: 'duplicate-id',
        message: `稳定 ID 重复：${id} 出现在 ${Array.from(occurrence.locations).join(', ')}`,
      })
    }
  }
}

function extractDefinedIds(content: string): string[] {
  return content
    .split('\n')
    .flatMap((line) => Array.from(line.matchAll(/^\s*(?:#{2,4}\s+|-\s+|\d+\.\s+)?(G|R|NFR|TC|BC|RISK|D|Q|U)\d+(?:-AC\d+|-BR\d+)?\b/g)))
    .map((match) => match[0].replace(/^\s*(?:#{2,4}\s+|-\s+|\d+\.\s+)?/, ''))
}

function addSections(result: DocExtractResult, document: SourceDocument, options: DocExtractOptions): void {
  const moduleName = typeof document.frontmatter.module === 'string' ? document.frontmatter.module : undefined
  for (const section of splitSections(document.body)) {
    const ids = Array.from(section.content.matchAll(ID_PATTERN)).map((match) => match[0])
    if (options.ids?.length && !options.ids.some((id) => ids.includes(id))) {
      continue
    }
    const title = section.title.toLowerCase()
    const entries = buildSectionEntries(section, ids, document.path, moduleName, options.ids)
    for (const entry of entries) {
      if (/^g\d+\b/i.test(section.title) || title.includes('目标')) result.goals.push(entry)
      if (/^r\d+\b/i.test(section.title) || title.includes('功能需求')) result.requirements.push(entry)
      if (/^u\d+\b/i.test(section.title) || title.includes('实现单元')) result.implementationUnits.push(entry)
      if (title.includes('设计') || title.includes('架构') || title.includes('模块关系')) result.designSections.push(entry)
      if (title.includes('范围')) result.scope.push(entry)
      if (title.includes('约束')) result.constraints.push(entry)
      if (/^q\d+\b/i.test(section.title) || title.includes('待定问题')) result.questions.push(entry)
      if (/^nfr\d+\b/i.test(section.title) || title.includes('非功能')) result.nonFunctionalRequirements?.push(entry)
      if (/^risk\d+\b/i.test(section.title) || title.includes('风险')) result.risks?.push(entry)
      if (/^d\d+\b/i.test(section.title) || title.includes('决策')) result.decisions?.push(entry)
      if (title.includes('实体') || title.includes('数据')) result.entities?.push(entry)
      if (title.includes('接口')) result.interfaces?.push(entry)
    }
  }
}

function buildSectionEntries(
  section: { title: string; content: string },
  ids: string[],
  source: string,
  moduleName: string | undefined,
  requestedIds: string[] | undefined,
): DocExtractSection[] {
  if (!requestedIds?.length) {
    return [{ id: ids[0], module: moduleName, source, title: section.title, content: section.content.trim() }]
  }

  return requestedIds
    .filter((id) => ids.includes(id))
    .map((id) => ({ id, module: moduleName, source, title: section.title, content: extractIdContent(section.content, id) }))
}

function extractIdContent(content: string, id: string): string {
  const lines = content.split('\n')
  const heading = lines.find((line) => /^#{2,4}\s+/.test(line))
  const start = lines.findIndex((line) => new RegExp(`\\b${escapeRegExp(id)}\\b`).test(line))
  if (start === -1 || (heading && start === 0)) {
    return content.trim()
  }

  const selected = heading ? [heading] : []
  for (let index = start; index < lines.length; index += 1) {
    const boundaryIds = extractBoundaryDefinedIds(lines[index])
    if (index > start && boundaryIds.some((lineId) => !isSameIdFamily(id, lineId))) {
      break
    }
    selected.push(lines[index])
  }
  return selected.join('\n').trim()
}

function extractBoundaryDefinedIds(line: string): string[] {
  return Array.from(
    line.matchAll(/^(?:#{2,4}\s+|-\s+|\d+\.\s+)(G|R|NFR|TC|BC|RISK|D|Q|U)\d+(?:-AC\d+|-BR\d+)?\b/g),
  ).map((match) => match[0].replace(/^(?:#{2,4}\s+|-\s+|\d+\.\s+)/, ''))
}

function isSameIdFamily(parentId: string, candidateId: string): boolean {
  return candidateId === parentId || candidateId.startsWith(`${parentId}-`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function splitSections(body: string): Array<{ title: string; content: string }> {
  const lines = body.split('\n')
  const sections: Array<{ title: string; content: string[] }> = []
  for (const line of lines) {
    const heading = /^(#{2,4})\s+(.+)$/.exec(line)
    if (heading) {
      sections.push({ title: heading[2].trim(), content: [line] })
      continue
    }
    const current = sections[sections.length - 1]
    if (current) {
      current.content.push(line)
    }
  }
  return sections.map((section) => ({ title: section.title, content: section.content.join('\n') }))
}

function pruneOptionalArrays(result: DocExtractResult): DocExtractResult {
  for (const key of ['nonFunctionalRequirements', 'risks', 'decisions', 'entities', 'interfaces'] as const) {
    if (result[key]?.length === 0) {
      delete result[key]
    }
  }
  return result
}

function toRepoPath(repoRoot: string, absolutePath: string): string {
  return normalizePath(relative(repoRoot, absolutePath))
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}
