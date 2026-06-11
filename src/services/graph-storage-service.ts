import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { isRegularFile } from '../utils/path-utils.js'
import { writeJsonAtomic } from './graph-fs-utils.js'
import { GraphChunkStore } from './graph-chunk-store.js'
import { GraphIndexStore } from './graph-index-store.js'
import {
  assertPathComponentsNotSymlink,
  cloneFiles,
  cloneRelations,
  countFileLevelNodes,
  ensureGraphDir,
  getNodeId,
  getRelationSourceId,
  getRelationTargetId,
  getRelationType,
  GRAPH_SCHEMA_VERSION,
  INDEX_NAMES,
  isChunkRecord,
  versionChunkDir,
  versionManifestPath,
  versionIndexPath,
} from './graph-storage-utils.js'
import type {
  GraphFileNode,
  GraphRelation,
  GraphChunkRecord,
  GraphScopeSummaryIndex,
  GraphVersionBuildMetadata,
  GraphVersionRecord,
} from './graph-storage-utils.js'

export type {
  GraphFileType,
  GraphRelationType,
  GraphFileNode,
  GraphRelation,
  GraphScopeSummaryIndex,
  GraphVersionBuildMetadata,
} from './graph-storage-utils.js'

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

interface GraphStorageOptions {
  readonly?: boolean
  force?: boolean
  workspaceRoot?: string
}

interface GraphStorageDiagnosticOptions {
  verifyChunks?: boolean
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

interface GraphStore {
  schemaVersion: 3
  nextVersionId: number
  versions: GraphVersionRecord[]
}

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

function isGraphStore(value: unknown): value is GraphStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { schemaVersion?: unknown; nextVersionId?: unknown; versions?: unknown }
  return candidate.schemaVersion === GRAPH_SCHEMA_VERSION && typeof candidate.nextVersionId === 'number' && Array.isArray(candidate.versions)
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

export class GraphStorage {
  private store: GraphStore
  private readonly lockPath: string
  private lockAcquired = false
  private readonly chunkStore: GraphChunkStore
  private readonly indexStore: GraphIndexStore

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
        this.chunkStore = new GraphChunkStore(storePath, this.findActiveVersion.bind(this), this.findVersion.bind(this))
        this.indexStore = new GraphIndexStore(storePath, this.findVersion.bind(this))
        return
      }
      this.releaseLock()
      throw error
    }
    this.chunkStore = new GraphChunkStore(storePath, this.findActiveVersion.bind(this), this.findVersion.bind(this))
    this.indexStore = new GraphIndexStore(storePath, this.findVersion.bind(this))
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
    target.files = cloneFiles(source.files ?? this.chunkStore.loadVersionFiles(source))
    target.relations = cloneRelations(source.relations ?? this.chunkStore.loadVersionRelations(source))
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
    const files = version.files ?? this.chunkStore.loadVersionFiles(version)
    const relations = version.relations ?? this.chunkStore.loadVersionRelations(version)
    const chunkIds = this.chunkStore.writeChunks(version.id, files, relations)
    this.indexStore.writeIndexes(version.id, chunkIds, files, relations)
    version.chunkIds = chunkIds
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
    this.chunkStore.removeStaleChunks(version.id, chunkIds)
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
    const files = version.files ?? this.chunkStore.loadVersionFiles(version)
    const relations = version.relations ?? this.chunkStore.loadVersionRelations(version)
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
      nodeCount: this.readScopeSummary(workspaceRoot, scopeRoot)?.nodeCount ?? this.chunkStore.loadVersionFiles(version).length,
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
    return this.chunkStore.loadActiveGraphChunks(workspaceRoot, scopeRoot)
  }

  loadFileChunks(workspaceRoot: string, scopeRoot: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    return this.chunkStore.loadFileChunks(workspaceRoot, scopeRoot)
  }

  readRelationEndpointPaths(workspaceRoot: string, scopeRoot: string): Set<string> {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return new Set()
    }
    const sourceIndex = this.indexStore.readIndex(version.id, 'source-to-relation-chunks') as Record<string, string[]> | undefined
    const targetIndex = this.indexStore.readIndex(version.id, 'target-to-relation-chunks') as Record<string, string[]> | undefined
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
    if (!isRegularFile(manifestPath)) {
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
      if (!manifest.indexes.includes(indexName) || !isRegularFile(indexPath)) {
        return this.createDiagnostic('index_missing', scopeRoot, availableScopes, '请重新执行 ae-graph-build 生成缺失索引。', { problemPath: indexPath })
      }
    }
    if (options.verifyChunks !== false) {
      let fileCount = 0
      let nodeCount = 0
      let relationCount = 0
      for (const chunkId of manifest.chunks) {
        const chunkPath = join(versionChunkDir(this.storePath, version.id), `${chunkId}.json`)
        if (!isRegularFile(chunkPath)) {
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
    return this.indexStore.readIndex(version.id, 'scope-summary') as GraphScopeSummaryIndex | undefined
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
    if (!isRegularFile(this.storePath)) {
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

  private loadRelationChunksByIndex(workspaceRoot: string, scopeRoot: string, indexName: string, path: string): { chunks: GraphChunkRecord[]; chunkIds: string[] } {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
    if (!version) {
      return { chunks: [], chunkIds: [] }
    }
    const index = this.indexStore.readIndex(version.id, indexName) as Record<string, string[]> | undefined
    const chunkIds = [...new Set(index?.[path] ?? [])]
    const chunks = chunkIds.map((chunkId) => this.chunkStore.readChunk(version.id, chunkId))
    return { chunks, chunkIds }
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
  return isRegularFile(resolveGraphDatabasePath(worktree))
}

export function createGraphStorage(worktree: string, options: GraphStorageOptions = {}): GraphStorage {
  return new GraphStorage(resolveGraphDatabasePath(worktree), { ...options, workspaceRoot: resolve(worktree) })
}
