import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export type GraphFileType = 'source' | 'document' | 'config' | 'directory' | 'asset'
export type GraphRelationType = 'import' | 'require' | 'include' | 'link' | 'ae_ref' | 'directory' | 'external'

export interface GraphFileNode {
  relativePath: string
  fileType: GraphFileType
  language?: string
  sizeBytes?: number
}

export interface GraphRelation {
  sourcePath: string
  targetPath: string
  relationType: GraphRelationType
  metadata?: Record<string, unknown>
}

export interface ActiveGraph {
  versionId: number
  scopeRoot: string
  files: GraphFileNode[]
  relations: GraphRelation[]
  chunkIds?: string[]
}

export interface ActiveGraphSummary {
  versionId: number
  scopeRoot: string
  chunkIds: string[]
  fileCount: number
  relationCount: number
}

interface GraphStorageOptions {
  readonly?: boolean
}

interface GraphChunkRecord {
  id: string
  fileCount: number
  relationCount: number
  files: GraphFileNode[]
  relations: GraphRelation[]
}

interface GraphVersionRecord {
  id: number
  workspaceRoot: string
  scopeRoot: string
  isActive: boolean
  fileCount: number
  relationCount: number
  excludeRules: string[]
  gitRef?: string
  createdAt: string
  chunkIds: string[]
  files?: GraphFileNode[]
  relations?: GraphRelation[]
}

interface GraphStore {
  schemaVersion: 2
  nextVersionId: number
  versions: GraphVersionRecord[]
}

const CHUNK_SIZE_FILES = 250
const CHUNK_SIZE_RELATIONS = 1000

function createEmptyStore(): GraphStore {
  return { schemaVersion: 2, nextVersionId: 1, versions: [] }
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

function isGraphStore(value: unknown): value is GraphStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { schemaVersion?: unknown; nextVersionId?: unknown; versions?: unknown }
  return candidate.schemaVersion === 2 && typeof candidate.nextVersionId === 'number' && Array.isArray(candidate.versions)
}

function isChunkRecord(value: unknown): value is GraphChunkRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { id?: unknown; fileCount?: unknown; relationCount?: unknown; files?: unknown; relations?: unknown }
  return typeof candidate.id === 'string'
    && typeof candidate.fileCount === 'number'
    && typeof candidate.relationCount === 'number'
    && Array.isArray(candidate.files)
    && Array.isArray(candidate.relations)
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
    rmSync(entryPath, { force: true, recursive: true })
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(path, { force: true })
    renameSync(tempPath, path)
    if (error instanceof Error && 'code' in error && (error.code === 'EPERM' || error.code === 'EEXIST')) {
      return
    }
    throw error
  }
}

export class GraphStorage {
  private store: GraphStore
  private readonly lockPath: string
  private lockAcquired = false

  constructor(private readonly storePath: string, private readonly options: GraphStorageOptions = {}) {
    this.lockPath = `${storePath}.lock`
    const storeDir = dirname(storePath)
    if (existsSync(storeDir) && lstatSync(storeDir).isSymbolicLink()) {
      throw new Error('图谱存储目录不能是符号链接')
    }
    if (existsSync(storePath) && lstatSync(storePath).isSymbolicLink()) {
      throw new Error('图谱存储文件不能是符号链接')
    }
    if (!options.readonly) {
      ensureDir(storeDir)
      this.acquireLock()
    }
    try {
      this.store = this.loadStore()
    } catch (error) {
      if (error instanceof GraphStoreFormatError && !options.readonly) {
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

  createVersion(workspaceRoot: string, scopeRoot: string, excludeRules: string[], gitRef?: string): number {
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
      excludeRules: [...excludeRules],
      gitRef,
      createdAt: new Date().toISOString(),
      chunkIds: [],
      files: [],
      relations: [],
    })
    this.saveStore()
    return id
  }

  insertFiles(versionId: number, files: GraphFileNode[]): void {
    const version = this.getWritableVersion(versionId)
    const existing = new Map((version.files ?? []).map((file) => [file.relativePath, file]))
    for (const file of files) {
      existing.set(file.relativePath, { ...file })
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
    version.files = (version.files ?? []).filter((file) => !changed.has(file.relativePath))
    version.relations = (version.relations ?? []).filter((relation) => !changed.has(relation.sourcePath) && !changed.has(relation.targetPath))
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
    version.fileCount = files.length
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
      relationCount: version.relationCount,
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
      return [{ id: sanitizeChunkId(version.id, 0), fileCount: version.fileCount, relationCount: version.relationCount, files: version.files ?? this.loadVersionFiles(version), relations: version.relations ?? this.loadVersionRelations(version) }]
    }
    return chunkIds.flatMap((chunkId) => {
      const chunkPath = join(versionChunkDir(this.storePath, version.id), `${chunkId}.json`)
      if (!existsSync(chunkPath)) {
        return []
      }
      const parsed = JSON.parse(readFileSync(chunkPath, 'utf8')) as unknown
      if (!isChunkRecord(parsed)) {
        return []
      }
      return [parsed]
    })
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
    const parsed = JSON.parse(readFileSync(this.storePath, 'utf8')) as unknown
    if (isGraphStore(parsed)) {
      return parsed
    }
    throw new GraphStoreFormatError()
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
    ensureDir(dir)
    for (const entry of readdirSync(dir)) {
      rmSync(join(dir, entry), { force: true, recursive: true })
    }
    const fileChunks = chunkFiles(files)
    const relationChunks = chunkRelations(relations)
    const chunkCount = Math.max(fileChunks.length, relationChunks.length)
    const chunkIds: string[] = []
    for (let index = 0; index < chunkCount; index += 1) {
      const chunkId = sanitizeChunkId(versionId, index)
      const chunkPath = versionChunkPath(this.storePath, versionId, index)
      const chunk: GraphChunkRecord = {
        id: chunkId,
        fileCount: fileChunks[index]?.length ?? 0,
        relationCount: relationChunks[index]?.length ?? 0,
        files: cloneFiles(fileChunks[index] ?? []),
        relations: cloneRelations(relationChunks[index] ?? []),
      }
      writeJsonAtomic(chunkPath, chunk)
      chunkIds.push(chunkId)
    }
    writeJsonAtomic(versionManifestPath(this.storePath, versionId), { versionId, chunkIds, fileCount: files.length, relationCount: relations.length })
    return chunkIds
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
    return [relation.sourcePath, relation.targetPath, relation.relationType].join('\u0000')
  }
}

export function resolveGraphDatabasePath(worktree: string): string {
  return join(resolve(worktree), 'docs', 'ae', 'graphs', 'graph.json')
}

export function resolveGraphGraphDir(worktree: string): string {
  return join(resolve(worktree), 'docs', 'ae', 'graphs')
}

export function graphDatabaseExists(worktree: string): boolean {
  return existsSync(resolveGraphDatabasePath(worktree))
}

export function createGraphStorage(worktree: string, options: GraphStorageOptions = {}): GraphStorage {
  return new GraphStorage(resolveGraphDatabasePath(worktree), options)
}
