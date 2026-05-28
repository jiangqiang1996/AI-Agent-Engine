import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'

import type {
  GraphConfidence,
  GraphNodeKind,
  GraphRelationType as GraphSchemaRelationType,
  GraphSymbolKind,
  SourceRange,
} from './graph/graph-schema.js'

export type GraphFileType = 'source' | 'document' | 'config' | 'directory'
export type GraphRelationType = Extract<GraphSchemaRelationType, 'contains' | 'import' | 'require' | 'include' | 'link' | 'directory'> | 'external'

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
}

export interface ActiveGraph {
  versionId: number
  scopeRoot: string
  files: GraphFileNode[]
  relations: GraphRelation[]
  includeRules?: string[]
  excludeRules: string[]
  chunkIds?: string[]
}

export interface ActiveGraphSummary {
  versionId: number
  scopeRoot: string
  chunkIds: string[]
  fileCount: number
  nodeCount: number
  relationCount: number
}

export interface GraphVersionBuildMetadata {
  buildInputFingerprint?: string
  buildInput?: unknown
  endInputFingerprint?: string
  inputChangedDuringBuild?: boolean
  completedAt?: string
}

export interface ActiveGraphMetadata extends ActiveGraphSummary, GraphVersionBuildMetadata {
  createdAt: string
  includeRules?: string[]
  excludeRules: string[]
}

export type GraphStorageDiagnosticCode =
  | 'ok'
  | 'missing_store'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'missing_active'
  | 'missing_manifest'
  | 'missing_chunk'
  | 'invalid_chunk'
  | 'count_mismatch'
  | 'index_missing'

export interface GraphStorageDiagnostic {
  code: GraphStorageDiagnosticCode
  message: string
  scopeRoot: string
  problemPath?: string
  problemChunkId?: string
  recoverBy: string
  availableScopes: string[]
  nearestScope?: string
  canUsePartialData: boolean
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

interface GraphStorageOptions {
  readonly?: boolean
  force?: boolean
  workspaceRoot?: string
}

interface GraphStorageDiagnosticOptions {
  verifyChunks?: boolean
}

interface GraphChunkRecord {
  id: string
  fileCount: number
  nodeCount: number
  relationCount: number
  files: GraphFileNode[]
  relations: GraphRelation[]
}

interface GraphVersionManifest {
  schemaVersion: 3
  indexVersion: 1
  versionId: number
  scopeRoot: string
  createdAt: string
  fileCount: number
  nodeCount: number
  relationCount: number
  chunks: string[]
  indexes: string[]
  summary: GraphScopeSummaryIndex
  buildMetadata?: GraphVersionBuildMetadata
}

interface GraphVersionRecord {
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

interface GraphStore {
  schemaVersion: 3
  nextVersionId: number
  versions: GraphVersionRecord[]
}

const GRAPH_SCHEMA_VERSION = 3
const CHUNK_SIZE_FILES = 250
const CHUNK_SIZE_RELATIONS = 1000
const INDEX_NAMES = [
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

function createEmptyStore(): GraphStore {
  return { schemaVersion: GRAPH_SCHEMA_VERSION, nextVersionId: 1, versions: [] }
}

class GraphStoreFormatError extends Error {
  constructor() {
    super('图谱存储文件格式不受支持')
  }
}

function getWorkspaceKey(_workspaceRoot: string): string {
  return '.'
}

function cloneFiles(files: GraphFileNode[]): GraphFileNode[] {
  return files.map((file) => ({ ...file }))
}

function cloneRelations(relations: GraphRelation[]): GraphRelation[] {
  return relations.map((relation) => ({ ...relation, metadata: relation.metadata ? { ...relation.metadata } : undefined }))
}

function getNodeId(file: GraphFileNode): string {
  return file.id ?? (file.fileType === 'directory' ? `directory:${file.relativePath}` : `file:${file.relativePath}`)
}

function getNodeKind(file: GraphFileNode): GraphNodeKind {
  return file.kind ?? (file.fileType === 'directory' ? 'directory' : 'file')
}

function getRelationSourceId(relation: GraphRelation): string {
  return relation.sourceId ?? `file:${relation.sourcePath}`
}

function getRelationTargetId(relation: GraphRelation): string {
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

function getRelationType(relation: GraphRelation): GraphSchemaRelationType {
  return relation.type ?? (relation.relationType === 'external' ? 'external_reference' : relation.relationType)
}

function isFileLevelRelation(relation: GraphRelation): boolean {
  return getRelationType(relation) !== 'contains'
}

function countFileLevelNodes(files: GraphFileNode[]): number {
  return files.filter((file) => getNodeKind(file) !== 'symbol').length
}

function isGraphStore(value: unknown): value is GraphStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { schemaVersion?: unknown; nextVersionId?: unknown; versions?: unknown }
  return candidate.schemaVersion === GRAPH_SCHEMA_VERSION && typeof candidate.nextVersionId === 'number' && Array.isArray(candidate.versions)
}

function isChunkRecord(value: unknown): value is GraphChunkRecord {
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

function isManifest(value: unknown): value is GraphVersionManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { schemaVersion?: unknown; indexVersion?: unknown; versionId?: unknown; chunks?: unknown; indexes?: unknown; summary?: unknown }
  return candidate.schemaVersion === GRAPH_SCHEMA_VERSION
    && candidate.indexVersion === 1
    && typeof candidate.versionId === 'number'
    && Array.isArray(candidate.chunks)
    && Array.isArray(candidate.indexes)
    && !!candidate.summary
}

function chunkFileName(versionId: number, chunkIndex: number): string {
  return `chunk-${String(versionId).padStart(6, '0')}-${String(chunkIndex).padStart(4, '0')}.json`
}

function versionChunkDir(storePath: string, versionId: number): string {
  return join(dirname(storePath), `version-${versionId}`)
}

function versionChunkPath(storePath: string, versionId: number, chunkIndex: number): string {
  return join(versionChunkDir(storePath, versionId), chunkFileName(versionId, chunkIndex))
}

function versionManifestPath(storePath: string, versionId: number): string {
  return join(versionChunkDir(storePath, versionId), 'manifest.json')
}

function versionIndexDir(storePath: string, versionId: number): string {
  return join(versionChunkDir(storePath, versionId), 'indexes')
}

function versionIndexPath(storePath: string, versionId: number, indexName: string): string {
  return join(versionIndexDir(storePath, versionId), `${indexName}.json`)
}

function sanitizeChunkId(versionId: number, chunkIndex: number): string {
  return `chunk-${String(versionId).padStart(6, '0')}-${String(chunkIndex).padStart(4, '0')}`
}

function chunkFiles(files: GraphFileNode[]): GraphFileNode[][] {
  if (files.length <= CHUNK_SIZE_FILES) {
    return [files]
  }
  const chunks: GraphFileNode[][] = []
  for (let index = 0; index < files.length; index += CHUNK_SIZE_FILES) {
    chunks.push(files.slice(index, index + CHUNK_SIZE_FILES))
  }
  return chunks
}

function chunkRelations(relations: GraphRelation[]): GraphRelation[][] {
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

function assertPathComponentsNotSymlink(path: string, boundary: string): void {
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

function ensureGraphDir(path: string, boundary: string): void {
  assertPathComponentsNotSymlink(path, boundary)
  ensureDir(path)
  assertPathComponentsNotSymlink(path, boundary)
}

function cleanGraphStoreDirectory(storeDir: string, lockPath: string): void {
  if (!existsSync(storeDir)) {
    return
  }
  const resolvedLockPath = resolve(lockPath)
  for (const entry of readdirSync(storeDir)) {
    const entryPath = join(storeDir, entry)
    if (resolve(entryPath) === resolvedLockPath) {
      continue
    }
    if (entry !== 'graph.json' && !entry.startsWith('graph.json.tmp-') && !entry.startsWith('version-')) {
      continue
    }
    if (lstatSync(entryPath).isSymbolicLink()) {
      throw new Error('图谱存储目录不能包含符号链接')
    }
    rmSync(entryPath, { force: true, recursive: true })
  }
}

function topCounts(counts: Map<string, number>): Array<{ path: string; count: number }> {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 80)
    .map(([path, count]) => ({ path, count }))
}

function findNearestScope(scopeRoot: string, availableScopes: string[]): string | undefined {
  return availableScopes
    .filter((scope) => scope === '.' || scopeRoot === scope || scopeRoot.startsWith(`${scope}/`) || scope.startsWith(`${scopeRoot}/`))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))[0]
}

function formatDiagnosticMessage(code: Exclude<GraphStorageDiagnosticCode, 'ok'>, scopeRoot: string): string {
  const messages: Record<Exclude<GraphStorageDiagnosticCode, 'ok'>, string> = {
    missing_store: '未找到文件关系图谱存储。',
    invalid_json: '图谱存储 JSON 无法解析。',
    unsupported_schema: '图谱存储 schema 不受支持。',
    missing_active: `未找到 scope=${scopeRoot} 的 active 图谱版本。`,
    missing_manifest: '图谱 manifest 缺失或不可读。',
    missing_chunk: '图谱分片缺失。',
    invalid_chunk: '图谱分片格式错误。',
    count_mismatch: '图谱 manifest 与分片计数不一致。',
    index_missing: '图谱索引缺失。',
  }
  return messages[code]
}

function isRetryableFsError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (
    error.code === 'EPERM' ||
    error.code === 'EBUSY' ||
    error.code === 'EACCES' ||
    error.code === 'EEXIST'
  )
}

function runWithFsRetry(operation: () => void): void {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      operation()
      return
    } catch (error) {
      lastError = error
      if (!isRetryableFsError(error)) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  throw lastError
}

function assertWritableGraphFile(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error('图谱存储文件不能是符号链接')
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}

function graphFileExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const backupPath = `${tempPath}.bak`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tempPath, path)
  } catch (error) {
    if (!isRetryableFsError(error)) {
      rmSync(tempPath, { force: true })
      throw error
    }
    const hasBackup = graphFileExists(path)
    if (hasBackup) {
      assertWritableGraphFile(path)
      copyFileSync(path, backupPath)
    }
    runWithFsRetry(() => {
      assertWritableGraphFile(path)
      renameSync(tempPath, path)
    })
    try {
      rmSync(tempPath, { force: true })
    } catch {
      // 替换成功后临时文件只影响磁盘清洁度，不应回滚已持久化的新图谱。
    }
    try {
      runWithFsRetry(() => rmSync(backupPath, { force: true }))
    } catch {
      // 备份残留不影响新图谱已写入；后续构建会清理 graph.json.tmp-* 残留文件。
    }
  }
}

export class GraphStorage {
  private store: GraphStore
  private readonly lockPath: string
  private lockAcquired = false

  constructor(private readonly storePath: string, private readonly options: GraphStorageOptions = {}) {
    this.lockPath = `${storePath}.lock`
    const storeDir = dirname(storePath)
    const workspaceRoot = options.workspaceRoot ?? dirname(dirname(storeDir))
    assertPathComponentsNotSymlink(storeDir, workspaceRoot)
    if (existsSync(storePath) && lstatSync(storePath).isSymbolicLink()) {
      throw new Error('图谱存储文件不能是符号链接')
    }
    if (!options.readonly) {
      ensureGraphDir(storeDir, workspaceRoot)
      this.acquireLock()
    }
    try {
      this.store = this.loadStore()
    } catch (error) {
      if ((error instanceof GraphStoreFormatError || error instanceof SyntaxError) && !options.readonly) {
        try {
          cleanGraphStoreDirectory(storeDir, this.lockPath)
        } catch (cleanupError) {
          this.releaseLock()
          throw cleanupError
        }
        this.store = createEmptyStore()
        return
      }
      this.releaseLock()
      throw error
    }
  }

  createVersion(
    workspaceRoot: string,
    scopeRoot: string,
    excludeRules: string[],
    gitRef?: string,
    includeRules: string[] = [],
    buildMetadata?: GraphVersionBuildMetadata,
  ): number {
    this.assertWritable()
    const id = this.store.nextVersionId
    this.store.nextVersionId += 1
    this.store.versions.push({
      id,
      workspaceRoot: getWorkspaceKey(workspaceRoot),
      scopeRoot,
      isActive: false,
      fileCount: 0,
      relationCount: 0,
      includeRules: [...includeRules],
      excludeRules: [...excludeRules],
      gitRef,
      createdAt: new Date().toISOString(),
      buildMetadata: buildMetadata ? { ...buildMetadata } : undefined,
      chunkIds: [],
      files: [],
      relations: [],
    })
    this.saveStore()
    return id
  }

  insertFiles(versionId: number, files: GraphFileNode[]): void {
    const version = this.getWritableVersion(versionId)
    const existing = new Map((version.files ?? []).map((file) => [getNodeId(file), file]))
    for (const file of files) {
      existing.set(getNodeId(file), { ...file })
    }
    version.files = [...existing.values()]
    this.saveStore()
  }

  insertRelations(versionId: number, relations: GraphRelation[]): void {
    const version = this.getWritableVersion(versionId)
    const existing = new Map((version.relations ?? []).map((relation) => [this.getRelationKey(relation), relation]))
    for (const relation of relations) {
      existing.set(this.getRelationKey(relation), {
        ...relation,
        metadata: relation.metadata ? { ...relation.metadata } : undefined,
      })
    }
    version.relations = [...existing.values()]
    this.saveStore()
  }

  copyVersion(sourceVersionId: number, targetVersionId: number): void {
    this.assertWritable()
    const source = this.findVersion(sourceVersionId)
    const target = this.findVersion(targetVersionId)
    if (!source || !target) {
      throw new Error('图谱版本不存在，无法复制')
    }
    target.files = cloneFiles(source.files ?? this.loadVersionFiles(source))
    target.relations = cloneRelations(source.relations ?? this.loadVersionRelations(source))
    this.saveStore()
  }

  deleteVersionData(versionId: number, filePaths: string[]): void {
    const version = this.getWritableVersion(versionId)
    const changed = new Set(filePaths)
    const changedNodePrefixes = [...changed].map((path) => `symbol:${path}#`)
    version.files = (version.files ?? []).filter((file) => {
      const nodeId = getNodeId(file)
      return !changed.has(file.relativePath) && !changedNodePrefixes.some((prefix) => nodeId.startsWith(prefix))
    })
    version.relations = (version.relations ?? []).filter((relation) => {
      const sourceId = getRelationSourceId(relation)
      const targetId = getRelationTargetId(relation)
      return !changed.has(relation.sourcePath)
        && !changed.has(relation.targetPath)
        && !changedNodePrefixes.some((prefix) => sourceId.startsWith(prefix) || targetId.startsWith(prefix))
    })
    this.saveStore()
  }

  activateVersion(versionId: number): void {
    this.assertWritable()
    const version = this.findVersion(versionId)
    if (!version) {
      throw new Error(`图谱版本不存在：${versionId}`)
    }
    const files = version.files ?? this.loadVersionFiles(version)
    const relations = version.relations ?? this.loadVersionRelations(version)
    version.chunkIds = this.writeChunks(version.id, files, relations)
    version.fileCount = countFileLevelNodes(files)
    version.relationCount = relations.length
    version.files = undefined
    version.relations = undefined
    for (const item of this.store.versions) {
      if (item.workspaceRoot === version.workspaceRoot && item.scopeRoot === version.scopeRoot) {
        item.isActive = false
      }
    }
    version.isActive = true
    this.saveStore()
  }

  updateVersionBuildMetadata(versionId: number, buildMetadata: GraphVersionBuildMetadata): void {
    const version = this.getWritableVersion(versionId)
    version.buildMetadata = { ...buildMetadata }
    this.saveStore()
  }

  getActiveVersion(workspaceRoot: string, scopeRoot: string): ActiveGraph | undefined {
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    const version = this.store.versions
      .filter((item) => item.workspaceRoot === workspaceKey && item.scopeRoot === scopeRoot && item.isActive)
      .sort((a, b) => b.id - a.id)[0]
    if (!version) {
      return undefined
    }
    const files = version.files ?? this.loadVersionFiles(version)
    const relations = version.relations ?? this.loadVersionRelations(version)
    return {
      versionId: version.id,
      scopeRoot: version.scopeRoot,
      files: cloneFiles(files),
      relations: cloneRelations(relations),
      includeRules: [...(version.includeRules ?? [])],
      excludeRules: [...version.excludeRules],
      chunkIds: version.chunkIds?.length ? [...version.chunkIds] : undefined,
    }
  }

  getActiveVersionSummary(workspaceRoot: string, scopeRoot: string): ActiveGraphSummary | undefined {
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    const version = this.store.versions
      .filter((item) => item.workspaceRoot === workspaceKey && item.scopeRoot === scopeRoot && item.isActive)
      .sort((a, b) => b.id - a.id)[0]
    if (!version) {
      return undefined
    }
    return {
      versionId: version.id,
      scopeRoot: version.scopeRoot,
      chunkIds: [...(version.chunkIds ?? [])],
      fileCount: version.fileCount,
      nodeCount: this.readScopeSummary(workspaceRoot, scopeRoot)?.nodeCount ?? this.loadVersionFiles(version).length,
      relationCount: version.relationCount,
    }
  }

  getActiveVersionMetadata(workspaceRoot: string, scopeRoot: string): ActiveGraphMetadata | undefined {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return undefined
    }
    const summary = this.getActiveVersionSummary(workspaceRoot, scopeRoot)
    if (!summary) {
      return undefined
    }
    return {
      ...summary,
      createdAt: version.createdAt,
      includeRules: [...(version.includeRules ?? [])],
      excludeRules: [...version.excludeRules],
      ...(version.buildMetadata ?? {}),
    }
  }

  loadActiveGraphChunks(workspaceRoot: string, scopeRoot: string): GraphChunkRecord[] {
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    const version = this.store.versions
      .filter((item) => item.workspaceRoot === workspaceKey && item.scopeRoot === scopeRoot && item.isActive)
      .sort((a, b) => b.id - a.id)[0]
    if (!version) {
      return []
    }
    const chunkIds = version.chunkIds ?? []
    if (chunkIds.length === 0) {
      const files = version.files ?? this.loadVersionFiles(version)
      return [{ id: sanitizeChunkId(version.id, 0), fileCount: countFileLevelNodes(files), nodeCount: files.length, relationCount: version.relationCount, files, relations: version.relations ?? this.loadVersionRelations(version) }]
    }
    return chunkIds.flatMap((chunkId) => {
      const chunkPath = join(versionChunkDir(this.storePath, version.id), `${chunkId}.json`)
      if (!existsSync(chunkPath)) {
        throw new Error(`图谱分片缺失：${chunkId}`)
      }
      const parsed = JSON.parse(readFileSync(chunkPath, 'utf8')) as unknown
      if (!isChunkRecord(parsed)) {
        throw new Error(`图谱分片格式不受支持：${chunkId}`)
      }
      return [parsed]
    })
  }

  loadFileChunks(workspaceRoot: string, scopeRoot: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return { chunks: [], chunkIds: [] }
    }
    const chunks = (version.chunkIds ?? [])
      .map((chunkId) => this.readChunk(version.id, chunkId))
      .filter((chunk) => (chunk.nodeCount ?? chunk.files.length) > 0)
    return { chunks, chunkIds: chunks.map((chunk) => chunk.id) }
  }

  readRelationEndpointPaths(workspaceRoot: string, scopeRoot: string): Set<string> {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return new Set()
    }
    const sourceIndex = this.readIndex(version.id, 'source-to-relation-chunks') as Record<string, string[]> | undefined
    const targetIndex = this.readIndex(version.id, 'target-to-relation-chunks') as Record<string, string[]> | undefined
    return new Set([...Object.keys(sourceIndex ?? {}), ...Object.keys(targetIndex ?? {})])
  }

  listActiveScopes(workspaceRoot: string): string[] {
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    return [...new Set(this.store.versions
      .filter((version) => version.workspaceRoot === workspaceKey && version.isActive)
      .map((version) => version.scopeRoot))].sort((a, b) => a.localeCompare(b))
  }

  diagnoseActiveVersion(workspaceRoot: string, scopeRoot: string, options: GraphStorageDiagnosticOptions = {}): GraphStorageDiagnostic {
    const availableScopes = this.listActiveScopes(workspaceRoot)
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return this.createDiagnostic('missing_active', scopeRoot, availableScopes, '请使用对应 target 重新执行 ae-graph-build 构建该 scope 的图谱。')
    }
    const manifestPath = versionManifestPath(this.storePath, version.id)
    if (!existsSync(manifestPath)) {
      return this.createDiagnostic('missing_manifest', scopeRoot, availableScopes, '请重新执行 ae-graph-build 生成 manifest 和索引。', { problemPath: manifestPath })
    }
    let manifest: GraphVersionManifest
    try {
      const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      if (!isManifest(parsed)) {
        return this.createDiagnostic('missing_manifest', scopeRoot, availableScopes, 'manifest 格式不受支持，请重新执行 ae-graph-build。', { problemPath: manifestPath })
      }
      manifest = parsed
    } catch {
      return this.createDiagnostic('missing_manifest', scopeRoot, availableScopes, 'manifest 无法解析，请重新执行 ae-graph-build。', { problemPath: manifestPath })
    }
    for (const indexName of INDEX_NAMES) {
      const indexPath = versionIndexPath(this.storePath, version.id, indexName)
      if (!manifest.indexes.includes(indexName) || !existsSync(indexPath)) {
        return this.createDiagnostic('index_missing', scopeRoot, availableScopes, '请重新执行 ae-graph-build 生成缺失索引。', { problemPath: indexPath })
      }
    }
    if (options.verifyChunks !== false) {
      let fileCount = 0
      let nodeCount = 0
      let relationCount = 0
      for (const chunkId of manifest.chunks) {
        const chunkPath = join(versionChunkDir(this.storePath, version.id), `${chunkId}.json`)
        if (!existsSync(chunkPath)) {
          return this.createDiagnostic('missing_chunk', scopeRoot, availableScopes, '请重新执行 ae-graph-build 重建缺失分片。', { problemPath: chunkPath, problemChunkId: chunkId })
        }
        try {
          const parsed = JSON.parse(readFileSync(chunkPath, 'utf8')) as unknown
          if (!isChunkRecord(parsed)) {
            return this.createDiagnostic('invalid_chunk', scopeRoot, availableScopes, '请重新执行 ae-graph-build 重建异常分片。', { problemPath: chunkPath, problemChunkId: chunkId })
          }
          fileCount += parsed.fileCount
          nodeCount += parsed.nodeCount ?? parsed.files.length
          relationCount += parsed.relationCount
        } catch {
          return this.createDiagnostic('invalid_chunk', scopeRoot, availableScopes, '请重新执行 ae-graph-build 重建异常分片。', { problemPath: chunkPath, problemChunkId: chunkId })
        }
      }
      if (fileCount !== manifest.fileCount || nodeCount !== manifest.nodeCount || relationCount !== manifest.relationCount) {
        return this.createDiagnostic('count_mismatch', scopeRoot, availableScopes, 'manifest 与分片计数不一致，请重新执行 ae-graph-build。', { problemPath: manifestPath })
      }
    }
    return {
      code: 'ok',
      message: '图谱存储可用。',
      scopeRoot,
      recoverBy: '无需恢复。',
      availableScopes,
      nearestScope: findNearestScope(scopeRoot, availableScopes),
      canUsePartialData: false,
    }
  }

  readScopeSummary(workspaceRoot: string, scopeRoot: string): GraphScopeSummaryIndex | undefined {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return undefined
    }
    return this.readIndex(version.id, 'scope-summary') as GraphScopeSummaryIndex | undefined
  }

  loadRelationChunksBySource(workspaceRoot: string, scopeRoot: string, sourcePath: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    return this.loadRelationChunksByIndex(workspaceRoot, scopeRoot, 'source-to-relation-chunks', sourcePath)
  }

  loadRelationChunksByTarget(workspaceRoot: string, scopeRoot: string, targetPath: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    return this.loadRelationChunksByIndex(workspaceRoot, scopeRoot, 'target-to-relation-chunks', targetPath)
  }

  cleanupIncompleteVersions(workspaceRoot: string, scopeRoot: string): void {
    this.assertWritable()
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    const cutoff = Date.now() - 10 * 60 * 1000
    this.store.versions = this.store.versions.filter((version) => {
      if (version.isActive || version.workspaceRoot !== workspaceKey || version.scopeRoot !== scopeRoot) {
        return true
      }
      return Date.parse(version.createdAt) >= cutoff
    })
    this.saveStore()
  }

  closeDatabase(): void {
    this.saveStore()
    this.releaseLock()
  }

  private loadStore(): GraphStore {
    if (!existsSync(this.storePath)) {
      return createEmptyStore()
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.storePath, 'utf8')) as unknown
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw error
      }
      throw error
    }
    if (isGraphStore(parsed)) {
      return parsed
    }
    throw new GraphStoreFormatError()
  }

  private findActiveVersion(workspaceRoot: string, scopeRoot: string): GraphVersionRecord | undefined {
    const workspaceKey = getWorkspaceKey(workspaceRoot)
    return this.store.versions
      .filter((item) => item.workspaceRoot === workspaceKey && item.scopeRoot === scopeRoot && item.isActive)
      .sort((a, b) => b.id - a.id)[0]
  }

  private createDiagnostic(
    code: Exclude<GraphStorageDiagnosticCode, 'ok'>,
    scopeRoot: string,
    availableScopes: string[],
    recoverBy: string,
    options: { problemPath?: string; problemChunkId?: string } = {},
  ): GraphStorageDiagnostic {
    return {
      code,
      message: formatDiagnosticMessage(code, scopeRoot),
      scopeRoot,
      recoverBy,
      availableScopes,
      nearestScope: findNearestScope(scopeRoot, availableScopes),
      canUsePartialData: false,
      ...options,
    }
  }

  private readIndex(versionId: number, indexName: string): unknown | undefined {
    const indexPath = versionIndexPath(this.storePath, versionId, indexName)
    if (!existsSync(indexPath)) {
      return undefined
    }
    return JSON.parse(readFileSync(indexPath, 'utf8')) as unknown
  }

  private loadRelationChunksByIndex(workspaceRoot: string, scopeRoot: string, indexName: string, path: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return { chunks: [], chunkIds: [] }
    }
    const index = this.readIndex(version.id, indexName) as Record<string, string[]> | undefined
    const chunkIds = [...new Set(index?.[path] ?? [])]
    const chunks = chunkIds.map((chunkId) => this.readChunk(version.id, chunkId))
    return { chunks, chunkIds }
  }

  private readChunk(versionId: number, chunkId: string): GraphChunkRecord {
    const chunkPath = join(versionChunkDir(this.storePath, versionId), `${chunkId}.json`)
    if (!existsSync(chunkPath)) {
      throw new Error(`图谱分片缺失：${chunkId}`)
    }
    const parsed = JSON.parse(readFileSync(chunkPath, 'utf8')) as unknown
    if (!isChunkRecord(parsed)) {
      throw new Error(`图谱分片格式不受支持：${chunkId}`)
    }
    return parsed
  }

  private loadVersionFiles(version: GraphVersionRecord): GraphFileNode[] {
    return this.loadVersionChunks(version).flatMap((chunk) => chunk.files)
  }

  private loadVersionRelations(version: GraphVersionRecord): GraphRelation[] {
    return this.loadVersionChunks(version).flatMap((chunk) => chunk.relations)
  }

  private loadVersionChunks(version: GraphVersionRecord): GraphChunkRecord[] {
    if (version.chunkIds.length === 0) {
      return []
    }
    const dir = versionChunkDir(this.storePath, version.id)
    return version.chunkIds.map((chunkId) => {
      const parsed = JSON.parse(readFileSync(join(dir, `${chunkId}.json`), 'utf8')) as unknown
      if (!isChunkRecord(parsed)) {
        throw new Error(`图谱分片格式不受支持：${chunkId}`)
      }
      return parsed
    })
  }

  private writeChunks(versionId: number, files: GraphFileNode[], relations: GraphRelation[]): string[] {
    const dir = versionChunkDir(this.storePath, versionId)
    ensureGraphDir(dir, dirname(dirname(dirname(dir))))
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry)
      if (lstatSync(entryPath).isSymbolicLink()) {
        throw new Error('图谱版本分片目录不能包含符号链接')
      }
      rmSync(entryPath, { force: true, recursive: true })
    }
    const fileChunks = chunkFiles(files)
    const relationChunks = chunkRelations(relations)
    const chunkCount = Math.max(fileChunks.length, relationChunks.length)
    const chunkIds: string[] = []
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkId = sanitizeChunkId(versionId, index)
      const chunkPath = versionChunkPath(this.storePath, versionId, index)
      const fileChunk = fileChunks[index] ?? []
      const relationChunk = relationChunks[index] ?? []
      const chunk: GraphChunkRecord = {
        id: chunkId,
        fileCount: countFileLevelNodes(fileChunk),
        nodeCount: fileChunk.length,
        relationCount: relationChunk.length,
        files: cloneFiles(fileChunk),
        relations: cloneRelations(relationChunk),
      }
      writeJsonAtomic(chunkPath, chunk)
      chunkIds.push(chunkId)
    }
    this.writeIndexes(versionId, chunkIds, files, relations)
    return chunkIds
  }

  private writeIndexes(versionId: number, chunkIds: string[], files: GraphFileNode[], relations: GraphRelation[]): void {
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
    const fileToNodeChunks: Record<string, string[]> = {}
    const sourceToRelationChunks: Record<string, string[]> = {}
    const targetToRelationChunks: Record<string, string[]> = {}
    const sourceNodeToRelationChunks: Record<string, string[]> = {}
    const targetNodeToRelationChunks: Record<string, string[]> = {}
    const directoryToFileChunks: Record<string, string[]> = {}
    const relationTypeToChunks: Record<string, string[]> = {}
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
          directoryToFileChunks[normalizedDirectory] = [...new Set([...(directoryToFileChunks[normalizedDirectory] ?? []), chunkId])]
        }
        nodeIdToChunk[nodeId] = chunkId
        fileToNodeChunks[file.relativePath] = [...new Set([...(fileToNodeChunks[file.relativePath] ?? []), chunkId])]
        nodeKindCounts[nodeKind] = (nodeKindCounts[nodeKind] ?? 0) + 1
      }
      for (const relation of relationChunk) {
        const sourceId = getRelationSourceId(relation)
        const targetId = getRelationTargetId(relation)
        const relationType = getRelationType(relation)
        sourceToRelationChunks[relation.sourcePath] = [...new Set([...(sourceToRelationChunks[relation.sourcePath] ?? []), chunkId])]
        targetToRelationChunks[relation.targetPath] = [...new Set([...(targetToRelationChunks[relation.targetPath] ?? []), chunkId])]
        sourceNodeToRelationChunks[sourceId] = [...new Set([...(sourceNodeToRelationChunks[sourceId] ?? []), chunkId])]
        targetNodeToRelationChunks[targetId] = [...new Set([...(targetNodeToRelationChunks[targetId] ?? []), chunkId])]
        relationTypeToChunks[relationType] = [...new Set([...(relationTypeToChunks[relationType] ?? []), chunkId])]
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
    const indexes: Record<(typeof INDEX_NAMES)[number], unknown> = {
      'scope-summary': summary,
      'path-to-file-chunk': pathToFileChunk,
      'node-id-to-chunk': nodeIdToChunk,
      'file-to-node-chunks': fileToNodeChunks,
      'source-to-relation-chunks': sourceToRelationChunks,
      'target-to-relation-chunks': targetToRelationChunks,
      'source-node-to-relation-chunks': sourceNodeToRelationChunks,
      'target-node-to-relation-chunks': targetNodeToRelationChunks,
      'directory-to-file-chunks': directoryToFileChunks,
      'relation-type-to-chunks': relationTypeToChunks,
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
    } satisfies GraphVersionManifest)
  }

  private saveStore(): void {
    if (this.options.readonly) {
      return
    }
    writeJsonAtomic(this.storePath, this.store)
  }

  private acquireLock(): void {
    try {
      writeFileSync(this.lockPath, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' })
      this.lockAcquired = true
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        if (this.options.force) {
          rmSync(this.lockPath, { force: true })
          writeFileSync(this.lockPath, `${process.pid}\n`, { encoding: 'utf8', flag: 'wx' })
          this.lockAcquired = true
          return
        }
        throw new Error('图谱存储正在被其他进程写入，请稍后重试')
      }
      throw error
    }
  }

  private releaseLock(): void {
    if (!this.lockAcquired) {
      return
    }
    rmSync(this.lockPath, { force: true })
    this.lockAcquired = false
  }

  private assertWritable(): void {
    if (this.options.readonly) {
      throw new Error('只读模式不允许修改图谱存储')
    }
  }

  private findVersion(versionId: number): GraphVersionRecord | undefined {
    return this.store.versions.find((version) => version.id === versionId)
  }

  private getWritableVersion(versionId: number): GraphVersionRecord {
    this.assertWritable()
    const version = this.findVersion(versionId)
    if (!version) {
      throw new Error(`图谱版本不存在：${versionId}`)
    }
    return version
  }

  private getRelationKey(relation: GraphRelation): string {
    return relation.id ?? [
      getRelationSourceId(relation),
      getRelationTargetId(relation),
      getRelationType(relation),
      relation.sourcePath,
      relation.targetPath,
    ].join('\u0000')
  }
}

export function resolveGraphDatabasePath(worktree: string): string {
  return join(resolve(worktree), docsAePath(DOCS_AE_SUBDIRS.GRAPHS), 'graph.json')
}

export function resolveGraphGraphDir(worktree: string): string {
  return join(resolve(worktree), docsAePath(DOCS_AE_SUBDIRS.GRAPHS))
}

export function graphDatabaseExists(worktree: string): boolean {
  return existsSync(resolveGraphDatabasePath(worktree))
}

export function createGraphStorage(worktree: string, options: GraphStorageOptions = {}): GraphStorage {
  return new GraphStorage(resolveGraphDatabasePath(worktree), { ...options, workspaceRoot: resolve(worktree) })
}
