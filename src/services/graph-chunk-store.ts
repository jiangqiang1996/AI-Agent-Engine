import { lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { isRegularFile } from '../utils/path-utils.js'

import type { GraphFileNode, GraphRelation, GraphChunkRecord, GraphVersionRecord } from './graph-storage-utils.js'
import {
  chunkFiles,
  chunkRelations,
  cloneFiles,
  cloneRelations,
  countFileLevelNodes,
  ensureGraphDir,
  extractErrorMessage,
  isChunkRecord,
  sanitizeChunkId,
  versionChunkDir,
  versionChunkPath,
} from './graph-storage-utils.js'
import { writeJsonAtomic } from './graph-fs-utils.js'

export class GraphChunkStore {
  constructor(
    private readonly storePath: string,
    private readonly findActiveVersion: (workspaceRoot: string, scopeRoot: string) => GraphVersionRecord | undefined,
    private readonly findVersion: (versionId: number) => GraphVersionRecord | undefined,
  ) {}

  private parseChunkFile(chunkPath: string, chunkId: string): GraphChunkRecord {
    let raw: string
    try {
      raw = readFileSync(chunkPath, 'utf8')
    } catch (error) {
      throw new Error(`图谱分片文件读取失败：${chunkId}（${extractErrorMessage(error)}）`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`图谱分片 JSON 格式无效：${chunkId}（${extractErrorMessage(error)}）`)
    }
    if (!isChunkRecord(parsed)) {
      throw new Error(`图谱分片格式不受支持：${chunkId}`)
    }
    return parsed
  }

  loadActiveGraphChunks(workspaceRoot: string, scopeRoot: string): GraphChunkRecord[] {
    const version = this.findActiveVersion(workspaceRoot, scopeRoot)
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
      if (!isRegularFile(chunkPath)) {
        throw new Error(`图谱分片缺失：${chunkId}`)
      }
      return [this.parseChunkFile(chunkPath, chunkId)]
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

  readChunk(versionId: number, chunkId: string): GraphChunkRecord {
    const chunkPath = join(versionChunkDir(this.storePath, versionId), `${chunkId}.json`)
    if (!isRegularFile(chunkPath)) {
      throw new Error(`图谱分片缺失：${chunkId}`)
    }
    return this.parseChunkFile(chunkPath, chunkId)
  }

  loadVersionFiles(version: GraphVersionRecord): GraphFileNode[] {
    return this.loadVersionChunks(version).flatMap((chunk) => chunk.files)
  }

  loadVersionRelations(version: GraphVersionRecord): GraphRelation[] {
    return this.loadVersionChunks(version).flatMap((chunk) => chunk.relations)
  }

  loadVersionChunks(version: GraphVersionRecord): GraphChunkRecord[] {
    if (version.chunkIds.length === 0) {
      return []
    }
    const dir = versionChunkDir(this.storePath, version.id)
    return version.chunkIds.map((chunkId) => {
      const chunkPath = join(dir, `${chunkId}.json`)
      if (!isRegularFile(chunkPath)) {
        throw new Error(`图谱分片缺失：${chunkId}`)
      }
      return this.parseChunkFile(chunkPath, chunkId)
    })
  }

  writeChunks(versionId: number, files: GraphFileNode[], relations: GraphRelation[]): string[] {
    const dir = versionChunkDir(this.storePath, versionId)
    ensureGraphDir(dir, dirname(dirname(dirname(dir))))
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
    return chunkIds
  }

  removeStaleChunks(versionId: number, activeChunkIds: string[]): void {
    const dir = versionChunkDir(this.storePath, versionId)
    if (!isRegularFile(dir)) {
      return
    }
    const newChunkSet = new Set(activeChunkIds.map((id) => `${id}.json`))
    for (const entry of readdirSync(dir)) {
      if (newChunkSet.has(entry) || !entry.startsWith('chunk-') || !entry.endsWith('.json')) {
        continue
      }
      const entryPath = join(dir, entry)
      let stat: ReturnType<typeof lstatSync>
      try {
        stat = lstatSync(entryPath)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) {
        throw new Error('图谱版本分片目录不能包含符号链接')
      }
      rmSync(entryPath, { force: true, recursive: true })
    }
  }
}
