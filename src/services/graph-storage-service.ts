import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
}

interface GraphStorageOptions {
  readonly?: boolean
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
  files: GraphFileNode[]
  relations: GraphRelation[]
}

interface GraphStore {
  schemaVersion: 1
  nextVersionId: number
  versions: GraphVersionRecord[]
}

function createEmptyStore(): GraphStore {
  return { schemaVersion: 1, nextVersionId: 1, versions: [] }
}

function getWorkspaceKey(_workspaceRoot: string): string {
  return '.'
}

function cloneFiles(files: GraphFileNode[]): GraphFileNode[] {
  return files.map((file) => ({ ...file }))
}

function cloneRelations(relations: GraphRelation[]): GraphRelation[] {
  return relations.map((relation) => ({
    ...relation,
    metadata: relation.metadata ? { ...relation.metadata } : undefined,
  }))
}

function isGraphStore(value: unknown): value is GraphStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const candidate = value as { schemaVersion?: unknown; nextVersionId?: unknown; versions?: unknown }
  return candidate.schemaVersion === 1 && typeof candidate.nextVersionId === 'number' && Array.isArray(candidate.versions)
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
      mkdirSync(storeDir, { recursive: true })
      this.acquireLock()
    }
    try {
      this.store = this.loadStore()
    } catch (error) {
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
      files: [],
      relations: [],
    })
    this.saveStore()
    return id
  }

  insertFiles(versionId: number, files: GraphFileNode[]): void {
    const version = this.getWritableVersion(versionId)
    const existing = new Set(version.files.map((file) => file.relativePath))
    for (const file of files) {
      if (!existing.has(file.relativePath)) {
        version.files.push({ ...file })
        existing.add(file.relativePath)
      }
    }
    this.saveStore()
  }

  insertRelations(versionId: number, relations: GraphRelation[]): void {
    const version = this.getWritableVersion(versionId)
    const existing = new Set(version.relations.map((relation) => this.getRelationKey(relation)))
    for (const relation of relations) {
      const key = this.getRelationKey(relation)
      if (!existing.has(key)) {
        version.relations.push({
          ...relation,
          metadata: relation.metadata ? { ...relation.metadata } : undefined,
        })
        existing.add(key)
      }
    }
    this.saveStore()
  }

  copyVersion(sourceVersionId: number, targetVersionId: number): void {
    this.assertWritable()
    const source = this.findVersion(sourceVersionId)
    const target = this.findVersion(targetVersionId)
    if (!source || !target) {
      throw new Error('图谱版本不存在，无法复制')
    }
    target.files = cloneFiles(source.files)
    target.relations = cloneRelations(source.relations)
    this.saveStore()
  }

  deleteVersionData(versionId: number, filePaths: string[]): void {
    const version = this.getWritableVersion(versionId)
    const changed = new Set(filePaths)
    version.files = version.files.filter((file) => !changed.has(file.relativePath))
    version.relations = version.relations.filter((relation) => !changed.has(relation.sourcePath) && !changed.has(relation.targetPath))
    this.saveStore()
  }

  activateVersion(versionId: number): void {
    this.assertWritable()
    const version = this.findVersion(versionId)
    if (!version) {
      throw new Error(`图谱版本不存在：${versionId}`)
    }
    for (const item of this.store.versions) {
      if (item.workspaceRoot === version.workspaceRoot && item.scopeRoot === version.scopeRoot) {
        item.isActive = false
      }
    }
    version.isActive = true
    version.fileCount = version.files.length
    version.relationCount = version.relations.length
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
    return {
      versionId: version.id,
      scopeRoot: version.scopeRoot,
      files: cloneFiles(version.files),
      relations: cloneRelations(version.relations),
    }
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
    if (!isGraphStore(parsed)) {
      throw new Error('图谱存储文件格式不受支持')
    }
    return parsed
  }

  private saveStore(): void {
    if (this.options.readonly) {
      return
    }
    const tempPath = `${this.storePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    writeFileSync(tempPath, `${JSON.stringify(this.store, null, 2)}\n`, 'utf8')
    renameSync(tempPath, this.storePath)
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
  return join(worktree, 'docs', 'ae', 'graphs', 'graph.json')
}

export function graphDatabaseExists(worktree: string): boolean {
  return existsSync(resolveGraphDatabasePath(worktree))
}

export function createGraphStorage(worktree: string, options: GraphStorageOptions = {}): GraphStorage {
  return new GraphStorage(resolveGraphDatabasePath(worktree), options)
}
