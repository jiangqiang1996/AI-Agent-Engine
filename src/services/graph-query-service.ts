import type { GraphFileNode, GraphRelation } from './graph-storage-service.js'
import { createGraphStorage } from './graph-storage-service.js'
import { loadGraphConfig } from './graph-config-service.js'
import { evaluateGraphFreshnessBasis, readGraphBuildState, type GraphFreshness } from './graph-freshness-service.js'
import { filterGraph, isInDirectory, isFileLevelRelation, getRelationType } from './graph/graph-filter.js'

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

function filePaths(files: { relativePath: string }[]): string[] {
  return files.map((file) => file.relativePath)
}

function impact(relations: GraphRelation[], file: string, limit: number, excluded: Set<string>): string[] {
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
        if (excluded.has(next)) {
          queue.push(next)
          continue
        }
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

function formatOkResult(params: {
  mode: QueryMode
  scopeRoot: string
  versionId: number
  freshness: GraphFreshness
  summary: unknown
  chunksRead: number
  indexesUsed: string[]
  truncated: boolean
  result: unknown
  limit: number
}): unknown {
  return {
    status: 'ok',
    mode: params.mode,
    scopeRoot: params.scopeRoot,
    versionId: params.versionId,
    freshness: params.freshness,
    summary: params.summary,
    queryCost: { chunksRead: params.chunksRead, indexesUsed: params.indexesUsed, chunkBudget: MAX_CHUNKS },
    truncation: { truncated: params.truncated, returnedCount: countResultItems(params.result), limitApplied: params.limit, maxResultItems: MAX_RESULT_ITEMS },
    result: params.result,
  }
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
    const activeMetadata = storage.getActiveVersionMetadata(request.worktree, request.scopeRoot)
    const freshness = evaluateGraphFreshnessBasis({
      worktree: request.worktree,
      scopeRoot: request.scopeRoot,
      activeVersionId: summary?.versionId,
      activeMetadata,
      buildState: readGraphBuildState(request.worktree, request.scopeRoot),
      config: loadGraphConfig(request.worktree),
    })
    const indexedSummary = storage.readScopeSummary(request.worktree, request.scopeRoot)
    if (!summary) {
      return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
    }

    if (request.mode === 'stats') {
      if (excluded.size === 0 && indexedSummary) {
        const result = indexedSummary.relationTypeCounts ?? {}
        return formatOkResult({
          mode: request.mode,
          scopeRoot: request.scopeRoot,
          versionId: summary.versionId,
          freshness,
          summary,
          chunksRead: 0,
          indexesUsed: indexedSummary ? ['scope-summary'] : [],
          truncated: false,
          result,
          limit,
        })
      }
      const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
      if (!graph) {
        return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
      }
      const relations = graph.relations.filter((relation) => !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath))
      const result = countRelationsByType(relations)
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: summary.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated: false,
        result,
        limit,
      })
    }

    if (request.mode === 'deps') {
      if (!request.file) {
        return { status: 'error', message: 'deps 模式必须提供 file 参数。' }
      }
      const sourceChunks = storage.loadRelationChunksBySource(request.worktree, request.scopeRoot, request.file)
      const targetChunks = storage.loadRelationChunksByTarget(request.worktree, request.scopeRoot, request.file)
      const chunkIds = [...new Set([...sourceChunks.chunkIds, ...targetChunks.chunkIds])]
      let relations: GraphRelation[]
      let chunksRead: number
      let indexesUsed: string[]
      if (chunkIds.length > 0 && chunkIds.length <= MAX_CHUNKS) {
        relations = uniqueRelations(
          [...sourceChunks.chunks, ...targetChunks.chunks]
            .flatMap((chunk) => chunk.relations)
            .filter((relation) => isFileLevelRelation(relation) && !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath)),
        )
        chunksRead = chunkIds.length
        indexesUsed = ['source-to-relation-chunks', 'target-to-relation-chunks']
      } else {
        const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
        if (!graph) {
          return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
        }
        relations = graph.relations.filter((relation) => isFileLevelRelation(relation) && !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath))
        chunksRead = 0
        indexesUsed = []
      }
      const dependencies = relations.filter((relation) => relation.sourcePath === request.file)
      const dependents = relations.filter((relation) => relation.targetPath === request.file)
      const limitedDependencies = takeLimited(dependencies, limit)
      const limitedDependents = takeLimited(dependents, limit)
      const result = {
        dependencies: limitedDependencies.items,
        dependents: limitedDependents.items,
      }
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: summary.versionId,
        freshness,
        summary,
        chunksRead,
        indexesUsed,
        truncated: limitedDependencies.truncated || limitedDependents.truncated,
        result,
        limit,
      })
    }

    if (request.mode === 'core') {
      const top = Math.min(request.top ?? 10, MAX_RESULT_ITEMS)
      if (excluded.size === 0 && indexedSummary) {
        const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
        if (!graph) {
          return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
        }
        const files = graph.files
        const indexedCore = (indexedSummary.topInDegree ?? [])
          .filter((item) => files.some((file) => file.kind !== 'symbol' && file.fileType !== 'directory' && file.relativePath === item.path))
        if (indexedCore.length >= top) {
          return formatOkResult({
            mode: request.mode,
            scopeRoot: request.scopeRoot,
            versionId: summary.versionId,
            freshness,
            summary,
            chunksRead: 0,
            indexesUsed: ['scope-summary'],
            truncated: false,
            result: indexedCore.slice(0, top),
            limit,
          })
        }
      }
      const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
      if (!graph) {
        return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
      }
      const files = graph.files.filter((file) => !excluded.has(file.relativePath))
      const relations = graph.relations.filter((relation) => !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath))
      const result = topInDegreeFromRelations(relations, files, top)
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: summary.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated: false,
        result,
        limit,
      })
    }

    const graph = storage.getActiveVersion(request.worktree, request.scopeRoot)
    if (!graph) {
      return { status: 'diagnostic', diagnostic: storage.diagnoseActiveVersion(request.worktree, request.scopeRoot) }
    }

    const files = graph.files.filter((file) => !excluded.has(file.relativePath))
    const allRelations = graph.relations.filter((relation) => !excluded.has(relation.sourcePath) && !excluded.has(relation.targetPath))

    if (request.mode === 'impact') {
      if (!request.file) {
        return { status: 'error', message: 'impact 模式必须提供 file 参数。' }
      }
      const impacted = impact(allRelations, request.file, limit, excluded)
      const limitedImpacted = takeLimited(impacted, limit)
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: graph.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated: limitedImpacted.truncated,
        result: { file: request.file, impacted: limitedImpacted.items },
        limit,
      })
    }

    if (request.mode === 'health') {
      const related = new Set(allRelations.filter(isFileLevelRelation).flatMap((relation) => [relation.sourcePath, relation.targetPath]))
      const fileLevelFiles = files.filter((file) => file.kind !== 'symbol' && file.fileType !== 'directory')
      const isolatedFiles = fileLevelFiles.filter((file) => !related.has(file.relativePath)).map((file) => file.relativePath)
      const limitedIsolatedFiles = takeLimited(isolatedFiles, limit)
      const paths = filePaths(fileLevelFiles)
      const rawCycles = findCycles(allRelations, paths, limit + 1)
      const cycles = rawCycles.slice(0, limit)
      const truncated = limitedIsolatedFiles.truncated || rawCycles.length > limit
      const result = {
        cycles,
        isolatedFiles: limitedIsolatedFiles.items,
      }
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: graph.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated,
        result,
        limit,
      })
    }

    if (request.mode === 'filter') {
      const filtered = filterGraph(files, allRelations, {
        directory: request.directory,
        relationTypes: request.relationType ? [request.relationType] : undefined,
        fileType: request.fileType,
        includeSymbolNodes: true,
      })
      const limitedFiles = takeLimited(filtered.files, limit)
      const limitedFileSet = new Set(limitedFiles.items.map((file) => file.relativePath))
      const coherentRelations = filtered.relations.filter((relation) =>
        limitedFileSet.has(relation.sourcePath) || limitedFileSet.has(relation.targetPath),
      )
      const limitedRelations = takeLimited(coherentRelations, limit)
      const truncated = limitedFiles.truncated || limitedRelations.truncated
      const result = {
        files: limitedFiles.items,
        relations: limitedRelations.items,
      }
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: graph.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated,
        result,
        limit,
      })
    }

    if (request.mode === 'path') {
      if (!request.file || !request.target) {
        return { status: 'error', message: 'path 模式必须提供 file 和 target 参数。' }
      }
      const result = { path: shortestPath(allRelations, request.file, request.target) }
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: graph.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated: false,
        result,
        limit,
      })
    }

    if (request.mode === 'pattern') {
      const patternType = request.patternType ?? 'all'
      const graphFilePaths = filePaths(files.filter((file) => file.kind !== 'symbol' && file.fileType !== 'directory'))
      const probeLimit = limit + 1
      const rawCycles = patternType === 'long' ? [] : findCycles(allRelations, graphFilePaths, probeLimit)
      const rawPaths = patternType === 'cycle' ? [] : longPaths(allRelations, 6, probeLimit)
      const cycles = rawCycles.slice(0, limit)
      const paths = rawPaths.slice(0, limit)
      const truncated = (patternType !== 'long' && rawCycles.length > limit)
        || (patternType !== 'cycle' && rawPaths.length > limit)
      const result = { cycles, longPaths: paths }
      return formatOkResult({
        mode: request.mode,
        scopeRoot: request.scopeRoot,
        versionId: graph.versionId,
        freshness,
        summary,
        chunksRead: 0,
        indexesUsed: [],
        truncated,
        result,
        limit,
      })
    }

    return { status: 'error', message: `不支持的查询模式：${request.mode}` }
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
