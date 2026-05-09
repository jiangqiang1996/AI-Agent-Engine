import { existsSync, lstatSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import Database from 'better-sqlite3'

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

interface VersionRow {
  id: number
}

interface VersionScopeRow extends VersionRow {
  scope_root: string
}

interface FileRow {
  relative_path: string
  file_type: GraphFileType
  language: string | null
  size_bytes: number | null
}

interface RelationRow {
  source_path: string
  target_path: string
  relation_type: GraphRelationType
  metadata: string | null
}

export class GraphStorage {
  private readonly db: Database.Database

  constructor(private readonly dbPath: string, options: GraphStorageOptions = {}) {
    const dbDir = dirname(dbPath)
    if (existsSync(dbDir) && lstatSync(dbDir).isSymbolicLink()) {
      throw new Error('图谱数据库目录不能是符号链接')
    }
    if (existsSync(dbPath) && lstatSync(dbPath).isSymbolicLink()) {
      throw new Error('图谱数据库文件不能是符号链接')
    }
    if (!options.readonly) {
      mkdirSync(dbDir, { recursive: true })
    }
    this.db = new Database(dbPath, options.readonly ? { readonly: true, fileMustExist: true } : {})
    this.db.pragma('busy_timeout = 10000')
    if (!options.readonly) {
      this.db.pragma('journal_mode = WAL')
      this.initializeSchema()
    }
  }

  createVersion(workspaceRoot: string, scopeRoot: string, excludeRules: string[], gitRef?: string): number {
    const result = this.db.prepare([
      'INSERT INTO graph_versions (workspace_root, scope_root, exclude_rules, git_ref)',
      'VALUES (?, ?, ?, ?)',
    ].join(' ')).run(getWorkspaceKey(workspaceRoot), scopeRoot, JSON.stringify(excludeRules), gitRef ?? null)
    return Number(result.lastInsertRowid)
  }

  insertFiles(versionId: number, files: GraphFileNode[]): void {
    const insert = this.db.prepare([
      'INSERT OR IGNORE INTO files (version_id, relative_path, file_type, language, size_bytes)',
      'VALUES (?, ?, ?, ?, ?)',
    ].join(' '))
    const transaction = this.db.transaction((items: GraphFileNode[]) => {
      for (const file of items) {
        insert.run(versionId, file.relativePath, file.fileType, file.language ?? null, file.sizeBytes ?? null)
      }
    })
    transaction(files)
  }

  insertRelations(versionId: number, relations: GraphRelation[]): void {
    const insert = this.db.prepare([
      'INSERT OR IGNORE INTO relations (version_id, source_path, target_path, relation_type, metadata)',
      'VALUES (?, ?, ?, ?, ?)',
    ].join(' '))
    const transaction = this.db.transaction((items: GraphRelation[]) => {
      for (const relation of items) {
        insert.run(
          versionId,
          relation.sourcePath,
          relation.targetPath,
          relation.relationType,
          relation.metadata ? JSON.stringify(relation.metadata) : null,
        )
      }
    })
    transaction(relations)
  }

  copyVersion(sourceVersionId: number, targetVersionId: number): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare([
        'INSERT OR IGNORE INTO files (version_id, relative_path, file_type, language, size_bytes)',
        'SELECT ?, relative_path, file_type, language, size_bytes FROM files WHERE version_id = ?',
      ].join(' ')).run(targetVersionId, sourceVersionId)
      this.db.prepare([
        'INSERT OR IGNORE INTO relations (version_id, source_path, target_path, relation_type, metadata)',
        'SELECT ?, source_path, target_path, relation_type, metadata FROM relations WHERE version_id = ?',
      ].join(' ')).run(targetVersionId, sourceVersionId)
    })
    transaction()
  }

  deleteVersionData(versionId: number, filePaths: string[]): void {
    const deleteFile = this.db.prepare('DELETE FROM files WHERE version_id = ? AND relative_path = ?')
    const deleteRelations = this.db.prepare([
      'DELETE FROM relations WHERE version_id = ?',
      'AND (source_path = ? OR target_path = ?)',
    ].join(' '))
    const transaction = this.db.transaction((paths: string[]) => {
      for (const filePath of paths) {
        deleteRelations.run(versionId, filePath, filePath)
        deleteFile.run(versionId, filePath)
      }
    })
    transaction(filePaths)
  }

  activateVersion(versionId: number): void {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare('SELECT workspace_root, scope_root FROM graph_versions WHERE id = ?').get(versionId) as
        | { workspace_root: string; scope_root: string }
        | undefined
      if (!row) {
        throw new Error(`图谱版本不存在：${versionId}`)
      }
      const fileCount = this.db.prepare('SELECT COUNT(*) AS count FROM files WHERE version_id = ?').get(versionId) as { count: number }
      const relationCount = this.db.prepare('SELECT COUNT(*) AS count FROM relations WHERE version_id = ?').get(versionId) as { count: number }
      this.db.prepare('UPDATE graph_versions SET is_active = 0 WHERE workspace_root = ? AND scope_root = ?')
        .run(row.workspace_root, row.scope_root)
      this.db.prepare([
        'UPDATE graph_versions SET is_active = 1, file_count = ?, relation_count = ?',
        'WHERE id = ?',
      ].join(' ')).run(fileCount.count, relationCount.count, versionId)
    })
    transaction()
  }

  getActiveVersion(workspaceRoot: string, scopeRoot: string): ActiveGraph | undefined {
    const row = this.db.prepare([
      'SELECT id, scope_root FROM graph_versions',
      'WHERE workspace_root = ? AND scope_root = ? AND is_active = 1',
      'ORDER BY id DESC LIMIT 1',
    ].join(' ')).get(getWorkspaceKey(workspaceRoot), scopeRoot) as VersionScopeRow | undefined
    if (!row) {
      return undefined
    }
    const fileRows = this.db.prepare('SELECT relative_path, file_type, language, size_bytes FROM files WHERE version_id = ?')
      .all(row.id) as FileRow[]
    const relationRows = this.db.prepare([
      'SELECT source_path, target_path, relation_type, metadata FROM relations',
      'WHERE version_id = ?',
    ].join(' ')).all(row.id) as RelationRow[]
    return {
      versionId: row.id,
      scopeRoot: row.scope_root,
      files: fileRows.map((file) => ({
        relativePath: file.relative_path,
        fileType: file.file_type,
        language: file.language ?? undefined,
        sizeBytes: file.size_bytes ?? undefined,
      })),
      relations: relationRows.map((relation) => ({
        sourcePath: relation.source_path,
        targetPath: relation.target_path,
        relationType: relation.relation_type,
        metadata: relation.metadata ? JSON.parse(relation.metadata) as Record<string, unknown> : undefined,
      })),
    }
  }

  cleanupIncompleteVersions(workspaceRoot: string, scopeRoot: string): void {
    const staleRows = this.db.prepare([
      'SELECT id FROM graph_versions',
      'WHERE workspace_root = ? AND scope_root = ? AND is_active = 0',
      "AND datetime(created_at) < datetime('now', '-10 minutes')",
    ].join(' ')).all(getWorkspaceKey(workspaceRoot), scopeRoot) as VersionRow[]
    const deleteFiles = this.db.prepare('DELETE FROM files WHERE version_id = ?')
    const deleteRelations = this.db.prepare('DELETE FROM relations WHERE version_id = ?')
    const deleteVersion = this.db.prepare('DELETE FROM graph_versions WHERE id = ?')
    const transaction = this.db.transaction((rows: VersionRow[]) => {
      for (const row of rows) {
        deleteRelations.run(row.id)
        deleteFiles.run(row.id)
        deleteVersion.run(row.id)
      }
    })
    transaction(staleRows)
  }

  closeDatabase(): void {
    this.db.close()
  }

  private initializeSchema(): void {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS graph_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_root TEXT NOT NULL,
  scope_root TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  relation_count INTEGER NOT NULL DEFAULT 0,
  exclude_rules TEXT,
  git_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_root, scope_root, id)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES graph_versions(id),
  relative_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  language TEXT,
  size_bytes INTEGER,
  UNIQUE(version_id, relative_path)
);
CREATE TABLE IF NOT EXISTS relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES graph_versions(id),
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(version_id, source_path, target_path, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_files_version ON files(version_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON files(version_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_relations_version ON relations(version_id);
CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(version_id, source_path);
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(version_id, target_path);
CREATE INDEX IF NOT EXISTS idx_graph_versions_active ON graph_versions(workspace_root, scope_root, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_graph_versions_active ON graph_versions(workspace_root, scope_root) WHERE is_active = 1;
`)
  }
}

export function resolveGraphDatabasePath(worktree: string): string {
  return join(worktree, '.ae', 'graph.db')
}

function getWorkspaceKey(_workspaceRoot: string): string {
  return '.'
}

export function graphDatabaseExists(worktree: string): boolean {
  return existsSync(resolveGraphDatabasePath(worktree))
}

export function createGraphStorage(worktree: string, options: GraphStorageOptions = {}): GraphStorage {
  return new GraphStorage(resolveGraphDatabasePath(worktree), options)
}
