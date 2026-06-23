import { existsSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import type {
  GraphConfidence,
  GraphNodeKind,
  GraphRelationType as GraphSchemaRelationType,
  GraphSymbolKind,
  SourceRange,
} from './graph/graph-schema.js'

export type GraphFileType = 'source' | 'document' | 'config' | 'directory'
export type GraphRelationType = Extract<GraphSchemaRelationType, 'contains' | 'import' | 'require' | 'include' | 'link' | 'directory' | 'call' | 'construct' | 'extends' | 'implements' | 'type_reference' | 'field_reference' | 'variable_reference' | 'export' | 'dependency' | 'image_reference'> | 'external'

export interface GraphFileNode {
  id?: string
  kind?: GraphNodeKind
  relativePath: string
  label?: string
  fileType: GraphFileType
  language?: string
  sizeBytes?: number
  nodePath?: string
  range?: SourceRange
  parentId?: string
  parser?: string
  status?: string
  symbolKind?: GraphSymbolKind
  /** external-package 节点所属包生态 */
  ecosystem?: 'maven' | 'npm' | 'gomod' | 'pip' | 'cargo' | 'gradle'
  /** Maven groupId 等 */
  groupId?: string
  /** Maven artifactId 等 */
  artifactId?: string
  /** 包版本 */
  version?: string
  /** Maven scope 等 */
  scope?: string
}

export interface GraphRelation {
  id?: string
  sourceId?: string
  targetId?: string
  type?: GraphSchemaRelationType
  confidence?: GraphConfidence
  sourcePath: string
  targetPath: string
  relationType: GraphRelationType
  range?: SourceRange
  parser?: string
  evidence?: string
  reason?: string
  metadata?: Record<string, unknown>
  /** 关系所属层级，未标注时默认 code */
  layer?: 'code' | 'document' | 'artifact' | 'inferred'
  /** 关系来源解析器 */
  source?: 'tree-sitter' | 'regex' | 'maven-cli' | 'npm-ls' | 'go-mod' | 'pipdeptree' | 'cargo-tree' | 'gradle-deps' | 'user-override'
  /** 关系完整性 */
  completeness?: 'full' | 'partial' | 'incomplete'
}

export interface GraphScopeSummaryIndex {
  scopeRoot: string
  fileCount: number
  nodeCount: number
  relationCount: number
  directoryCounts: Record<string, number>
  fileTypeCounts: Record<string, number>
  nodeKindCounts: Record<string, number>
  relationTypeCounts: Record<string, number>
  topInDegree: Array<{ path: string; count: number }>
  topOutDegree: Array<{ path: string; count: number }>
  isolatedCount: number
}

export interface GraphChunkRecord {
  id: string
  fileCount: number
  nodeCount: number
  relationCount: number
  files: GraphFileNode[]
  relations: GraphRelation[]
}

export interface GraphVersionRecord {
  id: number
  workspaceRoot: string
  scopeRoot: string
  isActive: boolean
  fileCount: number
  relationCount: number
  includeRules?: string[]
  excludeRules: string[]
  gitRef?: string
  createdAt: string
  buildMetadata?: GraphVersionBuildMetadata
  chunkIds: string[]
  files?: GraphFileNode[]
  relations?: GraphRelation[]
}

export interface GraphVersionBuildMetadata {
  buildInputFingerprint?: string
  buildInput?: unknown
  endInputFingerprint?: string
  inputChangedDuringBuild?: boolean
  completedAt?: string
}

export const GRAPH_SCHEMA_VERSION = 3
const CHUNK_SIZE_FILES = 250
const CHUNK_SIZE_RELATIONS = 1000
export const INDEX_NAMES = [
  'scope-summary',
  'path-to-file-chunk',
  'node-id-to-chunk',
  'file-to-node-chunks',
  'source-to-relation-chunks',
  'target-to-relation-chunks',
  'source-node-to-relation-chunks',
  'target-node-to-relation-chunks',
  'directory-to-file-chunks',
  'relation-type-to-chunks',
] as const

export function cloneFiles(files: GraphFileNode[]): GraphFileNode[] {
  return files.map((file) => ({ ...file }))
}

export function cloneRelations(relations: GraphRelation[]): GraphRelation[] {
  return relations.map((relation) => ({ ...relation, metadata: relation.metadata ? { ...relation.metadata } : undefined }))
}

export function getNodeId(file: GraphFileNode): string {
  return file.id ?? (file.fileType === 'directory' ? `directory:${file.relativePath}` : `file:${file.relativePath}`)
}

export function getNodeKind(file: GraphFileNode): GraphNodeKind {
  return file.kind ?? (file.fileType === 'directory' ? 'directory' : 'file')
}

export function getRelationSourceId(relation: GraphRelation): string {
  return relation.sourceId ?? `file:${relation.sourcePath}`
}

export function getRelationTargetId(relation: GraphRelation): string {
  if (relation.targetId) {
    return relation.targetId
  }
  if (relation.relationType === 'external') {
    return `external:unknown:${relation.targetPath}`
  }
  if (relation.relationType === 'directory') {
    return `directory:${relation.targetPath}`
  }
  return `file:${relation.targetPath}`
}

export function getRelationType(relation: GraphRelation): GraphSchemaRelationType {
  return relation.type ?? (relation.relationType === 'external' ? 'external_reference' : relation.relationType)
}

export function isFileLevelRelation(relation: GraphRelation): boolean {
  return getRelationType(relation) !== 'contains'
}

/**
 * 从未知错误值中提取消息字符串
 * 统一处理 Error 实例和非 Error 值的错误消息提取
 */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function countFileLevelNodes(files: GraphFileNode[]): number {
  return files.filter((file) => getNodeKind(file) !== 'symbol').length
}

export function isChunkRecord(value: unknown): value is GraphChunkRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { id?: unknown; fileCount?: unknown; nodeCount?: unknown; relationCount?: unknown; files?: unknown; relations?: unknown }
  return typeof candidate.id === 'string'
    && typeof candidate.fileCount === 'number'
    && (candidate.nodeCount === undefined || typeof candidate.nodeCount === 'number')
    && typeof candidate.relationCount === 'number'
    && Array.isArray(candidate.files)
    && Array.isArray(candidate.relations)
}

function chunkFileName(versionId: number, chunkIndex: number): string {
  return `chunk-${String(versionId).padStart(6, '0')}-${String(chunkIndex).padStart(4, '0')}.json`
}

export function versionChunkDir(storePath: string, versionId: number): string {
  return join(dirname(storePath), `version-${versionId}`)
}

export function versionChunkPath(storePath: string, versionId: number, chunkIndex: number): string {
  return join(versionChunkDir(storePath, versionId), chunkFileName(versionId, chunkIndex))
}

export function versionManifestPath(storePath: string, versionId: number): string {
  return join(versionChunkDir(storePath, versionId), 'manifest.json')
}

export function versionIndexDir(storePath: string, versionId: number): string {
  return join(versionChunkDir(storePath, versionId), 'indexes')
}

export function versionIndexPath(storePath: string, versionId: number, indexName: string): string {
  return join(versionIndexDir(storePath, versionId), `${indexName}.json`)
}

export function sanitizeChunkId(versionId: number, chunkIndex: number): string {
  return `chunk-${String(versionId).padStart(6, '0')}-${String(chunkIndex).padStart(4, '0')}`
}

export function chunkFiles(files: GraphFileNode[]): GraphFileNode[][] {
  if (files.length <= CHUNK_SIZE_FILES) {
    return [files]
  }
  const chunks: GraphFileNode[][] = []
  for (let index = 0; index < files.length; index += CHUNK_SIZE_FILES) {
    chunks.push(files.slice(index, index + CHUNK_SIZE_FILES))
  }
  return chunks
}

export function chunkRelations(relations: GraphRelation[]): GraphRelation[][] {
  if (relations.length <= CHUNK_SIZE_RELATIONS) {
    return [relations]
  }
  const chunks: GraphRelation[][] = []
  for (let index = 0; index < relations.length; index += CHUNK_SIZE_RELATIONS) {
    chunks.push(relations.slice(index, index + CHUNK_SIZE_RELATIONS))
  }
  return chunks
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function assertPathComponentsNotSymlink(path: string, boundary: string): void {
  const resolvedBoundary = resolve(boundary)
  const resolvedPath = resolve(path)
  const relativePath = relative(resolvedBoundary, resolvedPath)
  if (relativePath.startsWith('..') || resolve(relativePath) === relativePath) {
    throw new Error('图谱存储路径必须位于工作区内')
  }
  let current = resolvedBoundary
  for (const segment of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, segment)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error('图谱存储路径不能包含符号链接')
    }
  }
}

export function ensureGraphDir(path: string, boundary: string): void {
  assertPathComponentsNotSymlink(path, boundary)
  ensureDir(path)
  assertPathComponentsNotSymlink(path, boundary)
}

export function topCounts(counts: Map<string, number>): Array<{ path: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 80)
    .map(([path, count]) => ({ path, count }))
}
