import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { isRegularFile } from '../utils/path-utils.js'

import type { GraphFileNode, GraphRelation, GraphScopeSummaryIndex, GraphVersionRecord } from './graph-storage-utils.js'
import {
  chunkFiles,
  chunkRelations,
  ensureGraphDir,
  getNodeId,
  getNodeKind,
  getRelationSourceId,
  getRelationTargetId,
  getRelationType,
  GRAPH_SCHEMA_VERSION,
  INDEX_NAMES,
  isFileLevelRelation,
  topCounts,
  versionIndexDir,
  versionIndexPath,
  versionManifestPath,
} from './graph-storage-utils.js'
import { writeJsonAtomic } from './graph-fs-utils.js'

export class GraphIndexStore {
  constructor(
    private readonly storePath: string,
    private readonly findVersion: (versionId: number) => GraphVersionRecord | undefined,
  ) {}

  readIndex(versionId: number, indexName: string): unknown {
    const indexPath = versionIndexPath(this.storePath, versionId, indexName)
    if (!isRegularFile(indexPath)) {
      return undefined
    }
    return JSON.parse(readFileSync(indexPath, 'utf8')) as unknown
  }

  writeIndexes(versionId: number, chunkIds: string[], files: GraphFileNode[], relations: GraphRelation[]): void {
    const version = this.findVersion(versionId)
    if (!version) {
      throw new Error(`图谱版本不存在：${versionId}`)
    }
    const indexDir = versionIndexDir(this.storePath, versionId)
    ensureGraphDir(indexDir, dirname(dirname(dirname(dirname(indexDir)))))
    const fileChunks = chunkFiles(files)
    const relationChunks = chunkRelations(relations)
    const pathToFileChunk: Record<string, string> = {}
    const nodeIdToChunk: Record<string, string> = {}
    const fileToNodeChunks: Record<string, Set<string>> = {}
    const sourceToRelationChunks: Record<string, Set<string>> = {}
    const targetToRelationChunks: Record<string, Set<string>> = {}
    const sourceNodeToRelationChunks: Record<string, Set<string>> = {}
    const targetNodeToRelationChunks: Record<string, Set<string>> = {}
    const directoryToFileChunks: Record<string, Set<string>> = {}
    const relationTypeToChunks: Record<string, Set<string>> = {}
    const inDegree = new Map<string, number>()
    const outDegree = new Map<string, number>()
    const related = new Set<string>()
    const fileTypeCounts: Record<string, number> = {}
    const nodeKindCounts: Record<string, number> = {}
    const directoryCounts: Record<string, number> = {}

    chunkIds.forEach((chunkId, index) => {
      const fileChunk = fileChunks[index] ?? []
      const relationChunk = relationChunks[index] ?? []
      for (const file of fileChunk) {
        const nodeId = getNodeId(file)
        const nodeKind = getNodeKind(file)
        if (nodeKind !== 'symbol') {
          pathToFileChunk[file.relativePath] = chunkId
          fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] ?? 0) + 1
          const directory = dirname(file.relativePath).replaceAll('\\', '/')
          const normalizedDirectory = directory === '.' ? '.' : directory
          directoryCounts[normalizedDirectory] = (directoryCounts[normalizedDirectory] ?? 0) + 1
          ;(directoryToFileChunks[normalizedDirectory] ??= new Set()).add(chunkId)
        }
        nodeIdToChunk[nodeId] = chunkId
        ;(fileToNodeChunks[file.relativePath] ??= new Set()).add(chunkId)
        nodeKindCounts[nodeKind] = (nodeKindCounts[nodeKind] ?? 0) + 1
      }
      for (const relation of relationChunk) {
        const sourceId = getRelationSourceId(relation)
        const targetId = getRelationTargetId(relation)
        const relationType = getRelationType(relation)
        sourceToRelationChunks[relation.sourcePath] ??= new Set()
        sourceToRelationChunks[relation.sourcePath].add(chunkId)
        targetToRelationChunks[relation.targetPath] ??= new Set()
        targetToRelationChunks[relation.targetPath].add(chunkId)
        sourceNodeToRelationChunks[sourceId] ??= new Set()
        sourceNodeToRelationChunks[sourceId].add(chunkId)
        targetNodeToRelationChunks[targetId] ??= new Set()
        targetNodeToRelationChunks[targetId].add(chunkId)
        relationTypeToChunks[relationType] ??= new Set()
        relationTypeToChunks[relationType].add(chunkId)
        if (isFileLevelRelation(relation)) {
          inDegree.set(relation.targetPath, (inDegree.get(relation.targetPath) ?? 0) + 1)
          outDegree.set(relation.sourcePath, (outDegree.get(relation.sourcePath) ?? 0) + 1)
          related.add(relation.sourcePath)
          related.add(relation.targetPath)
        }
      }
    })

    const relationTypeCounts: Record<string, number> = {}
    for (const relation of relations) {
      const relationType = getRelationType(relation)
      relationTypeCounts[relationType] = (relationTypeCounts[relationType] ?? 0) + 1
    }
    const fileLevelNodes = files.filter((file) => getNodeKind(file) !== 'symbol')
    const summary: GraphScopeSummaryIndex = {
      scopeRoot: version.scopeRoot,
      fileCount: fileLevelNodes.length,
      nodeCount: files.length,
      relationCount: relations.length,
      directoryCounts,
      fileTypeCounts,
      nodeKindCounts,
      relationTypeCounts,
      topInDegree: topCounts(inDegree),
      topOutDegree: topCounts(outDegree),
      isolatedCount: fileLevelNodes.filter((file) => file.fileType !== 'directory' && !related.has(file.relativePath)).length,
    }
    const toArrayMap = (map: Record<string, Set<string>>): Record<string, string[]> => {
      const result: Record<string, string[]> = {}
      for (const [key, set] of Object.entries(map)) {
        result[key] = [...set]
      }
      return result
    }

    const indexes: Record<(typeof INDEX_NAMES)[number], unknown> = {
      'scope-summary': summary,
      'path-to-file-chunk': pathToFileChunk,
      'node-id-to-chunk': nodeIdToChunk,
      'file-to-node-chunks': toArrayMap(fileToNodeChunks),
      'source-to-relation-chunks': toArrayMap(sourceToRelationChunks),
      'target-to-relation-chunks': toArrayMap(targetToRelationChunks),
      'source-node-to-relation-chunks': toArrayMap(sourceNodeToRelationChunks),
      'target-node-to-relation-chunks': toArrayMap(targetNodeToRelationChunks),
      'directory-to-file-chunks': toArrayMap(directoryToFileChunks),
      'relation-type-to-chunks': toArrayMap(relationTypeToChunks),
    }
    for (const [name, value] of Object.entries(indexes)) {
      writeJsonAtomic(versionIndexPath(this.storePath, versionId, name), value)
    }
    writeJsonAtomic(versionManifestPath(this.storePath, versionId), {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      indexVersion: 1,
      versionId,
      scopeRoot: version.scopeRoot,
      createdAt: version.createdAt,
      fileCount: fileLevelNodes.length,
      nodeCount: files.length,
      relationCount: relations.length,
      chunks: chunkIds,
      indexes: [...INDEX_NAMES],
      summary,
      buildMetadata: version.buildMetadata,
    })
  }
}
