import type { GraphRelation } from './graph-storage-service.js'
import { createGraphStorage } from './graph-storage-service.js'

type QueryMode = 'deps' | 'impact' | 'health' | 'filter' | 'path' | 'core' | 'stats' | 'pattern'

export interface GraphQueryRequest {
  worktree: string
  mode: QueryMode
  scopeRoot: string
  file?: string
  target?: string
  directory?: string
  relationType?: string
  fileType?: string
  exclude?: string[]
  limit?: number
  top?: number
  patternType?: 'cycle' | 'long' | 'all'
}

const DEFAULT_LIMIT = 50
const MAX_RESULT_ITEMS = 80
const MAX_CHUNKS = 3

function appendMapValue(map: Map<string, string[]>, key: string, value: string): void {
  const values = map.get(key)
  if (values) {
    values.push(value)
    return
  }
  map.set(key, [value])
}

function clampLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? DEFAULT_LIMIT, 1), MAX_RESULT_ITEMS)
}

function isInDirectory(filePath: string, directory: string | undefined): boolean {
  if (!directory || directory === '.') {
    return true
  }
  const normalized = directory.replace(/\/$/, '')
  return filePath === normalized || filePath.startsWith(`${normalized}/`)
}

function findCycles(relations: GraphRelation[], files: string[], limit: number): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const relation of relations) {
    if (!isFileLevelRelation(relation) || relation.relationType === 'external') {
      continue
    }
    appendMapValue(adjacency, relation.sourcePath, relation.targetPath)
  }
  const cycles: string[][] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const visit = (node: string): void => {
    if (cycles.length >= limit) {
      return
    }
    const existingIndex = stack.indexOf(node)
    if (existingIndex >= 0) {
      cycles.push([...stack.slice(existingIndex), node])
      return
    }
    if (visited.has(node) || visiting.has(node)) {
      return
    }
    visiting.add(node)
    stack.push(node)
    for (const next of adjacency.get(node) ?? []) {
      visit(next)
      if (cycles.length >= limit) {
        break
      }
    }
    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }
  for (const file of files) {
    visit(file)
    if (cycles.length >= limit) {
      break
    }
  }
  return cycles
}

function hasMoreCycles(relations: GraphRelation[], files: string[], limit: number): boolean {
  return findCycles(relations, files, limit + 1).length > limit
}

function shortestPath(relations: GraphRelation[], source: string, target: string): string[] {
  const adjacency = new Map<string, string[]>()
  for (const relation of relations.filter(isFileLevelRelation)) {
    appendMapValue(adjacency, relation.sourcePath, relation.targetPath)
  }
  const queue: string[][] = [[source]]
  const visited = new Set<string>([source])
  while (queue.length > 0) {
    const path = queue.shift()
    if (!path) {
      continue
    }
    const current = path[path.length - 1]
    if (current === target) {
      return path
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push([...path, next])
      }
    }
  }
  return []
}

function longPaths(relations: GraphRelation[], minLength: number, limit: number): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const relation of relations) {
    if (!isFileLevelRelation(relation) || relation.relationType === 'external') {
      continue
    }
    appendMapValue(adjacency, relation.sourcePath, relation.targetPath)
  }
  const result: string[][] = []
  for (const source of adjacency.keys()) {
    const stack: string[][] = [[source]]
    while (stack.length > 0 && result.length < limit) {
      const path = stack.pop()
      if (!path) {
        continue
      }
      const current = path[path.length - 1]
      if (path.length >= minLength) {
        result.push(path)
        continue
      }
      if (path.length >= 10) {
        continue
      }
      for (const next of adjacency.get(current) ?? []) {
        if (!path.includes(next)) {
          stack.push([...path, next])
        }
      }
    }
    if (result.length >= limit) {
      break
    }
  }
  return result
}

function hasMoreLongPaths(relations: GraphRelation[], minLength: number, limit: number): boolean {
  return longPaths(relations, minLength, limit + 1).length > limit
}

function filePaths(files: { relativePath: string }[]): string[] {
  return files.map((file) => file.relativePath)
}

function impact(relations: GraphRelation[], file: string, limit: number): string[] {
  const reverse = new Map<string, string[]>()
  for (const relation of relations.filter(isFileLevelRelation)) {
    appendMapValue(reverse, relation.targetPath, relation.sourcePath)
  }
  const result: string[] = []
  const queue = [file]
  const visited = new Set<string>([file])
  while (queue.length > 0 && result.length < limit) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    for (const next of reverse.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        result.push(next)
        queue.push(next)
      }
    }
  }
  return result.sort((a, b) => a.localeCompare(b))
}

function relationKey(relation: GraphRelation): string {
  return `${relation.sourceId ?? relation.sourcePath}\u0000${relation.targetId ?? relation.targetPath}\u0000${getRelationType(relation)}\u0000${relation.id ?? ''}`
}

function uniqueRelations(relations: GraphRelation[]): GraphRelation[] {
  const seen = new Set<string>()
  return relations.filter((relation) => {
    const key = relationKey(relation)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function takeLimited<T>(items: T[], limit: number): { items: T[]; truncated: boolean } {
  return { items: items.slice(0, limit), truncated: items.length > limit }
}

function countRelationsByType(relations: GraphRelation[]): Record<string, number> {
  return relations.reduce<Record<string, number>>((counts, relation) => {
    const relationType = getRelationType(relation)
    counts[relationType] = (counts[relationType] ?? 0) + 1
    return counts
  }, {})
}

function getRelationType(relation: GraphRelation): string {
  return relation.type ?? (relation.relationType === 'external' ? 'external_reference' : relation.relationType)
}

function isFileLevelRelation(relation: GraphRelation): boolean {
  return getRelationType(relation) !== 'contains'
}

function topInDegreeFromRelations(
  relations: GraphRelation[],
  files: { relativePath: string; fileType: string }[],
  top: number,
): Array<{ path: string; count: number }> {
  const sourceFiles = new Set(files.filter((file) => file.fileType !== 'directory').map((file) => file.relativePath))
  const counts = new Map<string, number>()
  for (const relation of relations.filter(isFileLevelRelation)) {
    if (sourceFiles.has(relation.targetPath)) {
      counts.set(relation.targetPath, (counts.get(relation.targetPath) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, top)
}

export function executeGraphQuery(request: GraphQueryRequest): unknown {
  const storage = createGraphStorage(request.worktree, { readonly: true })
  try {
    const diagnostic = storage.diagnoseActiveVersion(request.worktree, request.scopeRoot)
    if (diagnostic.code !== 'ok') {
      return { status: 'diagnostic', diagnostic }
    }
    const limit = clampLimit(request.limit)
    const excluded = new Set(request.exclude ?? [])
    const summary = storage.getActiveVersionSummary(request.worktree, request.scopeRoot)
    const indexedSummary = storage.readScopeSummary(request.worktree, request.scopeRoot)
    if (!summary) {
      return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
    }
    if (request.mode === 'stats' && excluded.size === 0) {
      const result = indexedSummary?.relationTypeCounts ?? {}
      return {
        status: 'ok',
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: summary.versionId,
        summary,
        queryCost: { chunksRead: 0, indexesUsed: indexedSummary ? ['scope-summary'] : [], chunkBudget: MAX_CHUNKS },
        truncation: { truncated: false, returnedCount: countResultItems(result), limitApplied: limit, maxResultItems: MAX_RESULT_ITEMS },
        result,
      }
    }
    if (request.mode === 'deps') {
      if (!request.file) {
        return { status: 'error', message: 'deps 模式必须提供 file 参数。' }
      }
      const sourceChunks = storage.loadRelationChunksBySource(request.worktree, request.scopeRoot, request.file)
      const targetChunks = storage.loadRelationChunksByTarget(request.worktree, request.scopeRoot, request.file)
      const chunkIds = [...new Set([...sourceChunks.chunkIds, ...targetChunks.chunkIds])]
      if (chunkIds.length > 0 && chunkIds.length <= MAX_CHUNKS) {
        const relations = uniqueRelations(
          [...sourceChunks.chunks, ...targetChunks.chunks]
            .flatMap((chunk) => chunk.relations)
            .filter((relation) => isFileLevelRelation(relation) && !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath)),
        )
        const dependencies = relations.filter((relation) => relation.sourcePath === request.file)
        const dependents = relations.filter((relation) => relation.targetPath === request.file)
        const limitedDependencies = takeLimited(dependencies, limit)
        const limitedDependents = takeLimited(dependents, limit)
        const result = {
          dependencies: limitedDependencies.items,
          dependents: limitedDependents.items,
        }
        return {
          status: 'ok',
          mode: request.mode,
          scopeRoot: request.scopeRoot,
          versionId: summary.versionId,
          summary,
          queryCost: { chunksRead: chunkIds.length, indexesUsed: ['source-to-relation-chunks', 'target-to-relation-chunks'], chunkBudget: MAX_CHUNKS },
          truncation: {
            truncated: limitedDependencies.truncated || limitedDependents.truncated,
            returnedCount: countResultItems(result),
            limitApplied: limit,
            maxResultItems: MAX_RESULT_ITEMS,
          },
          result,
        }
      }
    }
    if (request.mode === 'health' && excluded.size === 0 && !indexedSummary?.relationTypeCounts.contains) {
      const fileChunks = storage.loadFileChunks(request.worktree, request.scopeRoot)
      const files = fileChunks.chunks.flatMap((chunk) => chunk.files)
      const related = storage.readRelationEndpointPaths(request.worktree, request.scopeRoot)
      const isolatedFiles = files
        .filter((file) => file.fileType !== 'directory' && !related.has(file.relativePath))
        .map((file) => file.relativePath)
      const limitedIsolatedFiles = takeLimited(isolatedFiles, limit)
      const result = {
        cycles: [],
        isolatedFiles: limitedIsolatedFiles.items,
        note: 'health 模式默认返回未被关系引用的孤立文件；循环依赖请使用 pattern 模式查询。',
      }
      return {
        status: 'ok',
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: summary.versionId,
        summary,
        queryCost: { chunksRead: fileChunks.chunkIds.length, indexesUsed: ['source-to-relation-chunks', 'target-to-relation-chunks'], chunkBudget: MAX_CHUNKS },
        truncation: {
          truncated: limitedIsolatedFiles.truncated,
          returnedCount: countResultItems(result),
          limitApplied: limit,
          maxResultItems: MAX_RESULT_ITEMS,
        },
        result,
      }
    }
    const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
    if (!graph) {
      return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
    }
    let chunksRead = 0
    let indexesUsed: string[] = []
    let result: unknown
    let truncated = false

    const files = graph.files.filter((file) => !excluded.has(file.relativePath))
    let relations = graph.relations.filter((relation) => !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath))

    if (request.mode === 'deps') {
      if (!request.file) {
        return { status: 'error', message: 'deps 模式必须提供 file 参数。' }
      }
      const sourceChunks = storage.loadRelationChunksBySource(request.worktree, request.scopeRoot, request.file)
      const targetChunks = storage.loadRelationChunksByTarget(request.worktree, request.scopeRoot, request.file)
      const chunkIds = [...new Set([...sourceChunks.chunkIds, ...targetChunks.chunkIds])]
      if (chunkIds.length > 0 && chunkIds.length <= MAX_CHUNKS) {
        relations = uniqueRelations(
          [...sourceChunks.chunks, ...targetChunks.chunks]
            .flatMap((chunk) => chunk.relations)
            .filter((relation) => isFileLevelRelation(relation) && !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath)),
        )
        chunksRead = chunkIds.length
        indexesUsed = ['source-to-relation-chunks', 'target-to-relation-chunks']
      }
      const dependencies = relations.filter((relation) => isFileLevelRelation(relation) && relation.sourcePath === request.file)
      const dependents = relations.filter((relation) => isFileLevelRelation(relation) && relation.targetPath === request.file)
      const limitedDependencies = takeLimited(dependencies, limit)
      const limitedDependents = takeLimited(dependents, limit)
      truncated = limitedDependencies.truncated || limitedDependents.truncated
      result = {
        dependencies: limitedDependencies.items,
        dependents: limitedDependents.items,
      }
    } else if (request.mode === 'impact') {
      if (!request.file) {
        return { status: 'error', message: 'impact 模式必须提供 file 参数。' }
      }
      const impacted = impact(relations, request.file, limit + 1).filter((item) => !excluded.has(item))
      const limitedImpacted = takeLimited(impacted, limit)
      truncated = limitedImpacted.truncated
      result = { file: request.file, impacted: limitedImpacted.items }
    } else if (request.mode === 'health') {
      const related = new Set(relations.filter(isFileLevelRelation).flatMap((relation) => [relation.sourcePath, relation.targetPath]))
      const fileLevelFiles = files.filter((file) => file.kind !== 'symbol' && file.fileType !== 'directory')
      const isolatedFiles = fileLevelFiles.filter((file) => !related.has(file.relativePath)).map((file) => file.relativePath)
      const limitedIsolatedFiles = takeLimited(isolatedFiles, limit)
      const paths = filePaths(fileLevelFiles)
      const cycles = findCycles(relations, paths, limit)
      truncated = limitedIsolatedFiles.truncated || hasMoreCycles(relations, paths, limit)
      result = {
        cycles,
        isolatedFiles: limitedIsolatedFiles.items,
      }
    } else if (request.mode === 'filter') {
      const filteredFiles = files.filter(
        (file) => (!request.fileType || file.fileType === request.fileType) && isInDirectory(file.relativePath, request.directory),
      )
      const filteredRelations = relations.filter((relation) => !request.relationType || getRelationType(relation) === request.relationType)
      const limitedFiles = takeLimited(filteredFiles, limit)
      const limitedRelations = takeLimited(filteredRelations, limit)
      truncated = limitedFiles.truncated || limitedRelations.truncated
      result = {
        files: limitedFiles.items,
        relations: limitedRelations.items,
      }
    } else if (request.mode === 'path') {
      if (!request.file || !request.target) {
        return { status: 'error', message: 'path 模式必须提供 file 和 target 参数。' }
      }
      result = { path: shortestPath(relations, request.file, request.target) }
    } else if (request.mode === 'core') {
      const top = Math.min(request.top ?? 10, MAX_RESULT_ITEMS)
      const indexedCore = (indexedSummary?.topInDegree ?? [])
        .filter((item) => files.some((file) => file.kind !== 'symbol' && file.fileType !== 'directory' && file.relativePath === item.path))
      const useIndexedCore = excluded.size === 0 && indexedSummary && indexedCore.length >= top
      result = useIndexedCore ? indexedCore.slice(0, top) : topInDegreeFromRelations(relations, files, top)
      indexesUsed = useIndexedCore ? ['scope-summary'] : []
    } else if (request.mode === 'stats') {
      result = excluded.size > 0 ? countRelationsByType(relations) : indexedSummary?.relationTypeCounts ?? {}
      indexesUsed = indexedSummary && excluded.size === 0 ? ['scope-summary'] : []
    } else {
      const patternType = request.patternType ?? 'all'
      const graphFilePaths = filePaths(files.filter((file) => file.kind !== 'symbol' && file.fileType !== 'directory'))
      const cycles = patternType === 'long' ? [] : findCycles(relations, graphFilePaths, limit)
      const paths = patternType === 'cycle' ? [] : longPaths(relations, 6, limit)
      truncated = (patternType !== 'long' && hasMoreCycles(relations, graphFilePaths, limit))
        || (patternType !== 'cycle' && hasMoreLongPaths(relations, 6, limit))
      result = { cycles, longPaths: paths }
    }

    return {
      status: 'ok',
      mode: request.mode,
      scopeRoot: request.scopeRoot,
      versionId: graph.versionId,
      summary,
      queryCost: { chunksRead, indexesUsed, chunkBudget: MAX_CHUNKS },
      truncation: { truncated, returnedCount: countResultItems(result), limitApplied: limit, maxResultItems: MAX_RESULT_ITEMS },
      result,
    }
  } finally {
    storage.closeDatabase()
  }
}

function countResultItems(result: unknown): number {
  if (Array.isArray(result)) {
    return result.length
  }
  if (result && typeof result === 'object') {
    return Object.values(result).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0)
  }
  return 0
}
