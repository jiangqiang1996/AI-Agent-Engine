import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createGraphStorage } from '../../src/services/graph-storage-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-storage-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('graph-storage-service', () => {
  it('应该创建 version、插入数据、激活并查询 active version', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source', language: 'typescript', sizeBytes: 10 }])
    storage.insertRelations(versionId, [{ sourcePath: 'src/a.ts', targetPath: 'src/b.ts', relationType: 'import' }])
    storage.activateVersion(versionId)

    const active = storage.getActiveVersion(root, '.')
    storage.closeDatabase()

    expect(active?.files).toHaveLength(1)
    expect(active?.relations[0].targetPath).toBe('src/b.ts')
  })

  it('应该支持复制旧 version、删除变更文件数据并激活新 version', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const version1 = storage.createVersion(root, '.', [])
    storage.insertFiles(version1, [
      { relativePath: 'src/a.ts', fileType: 'source' },
      { relativePath: 'src/old.ts', fileType: 'source' },
    ])
    storage.insertRelations(version1, [{ sourcePath: 'src/a.ts', targetPath: 'src/old.ts', relationType: 'import' }])
    storage.activateVersion(version1)

    const version2 = storage.createVersion(root, '.', [])
    storage.copyVersion(version1, version2)
    storage.deleteVersionData(version2, ['src/old.ts'])
    storage.insertFiles(version2, [{ relativePath: 'src/new.ts', fileType: 'source' }])
    storage.activateVersion(version2)

    const active = storage.getActiveVersion(root, '.')
    storage.closeDatabase()

    expect(active?.files.map((file) => file.relativePath).sort()).toEqual(['src/a.ts', 'src/new.ts'])
    expect(active?.relations).toHaveLength(0)
  })

  it('应该按 scopeRoot 隔离 active version', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const rootVersion = storage.createVersion(root, '.', [])
    storage.insertFiles(rootVersion, [{ relativePath: 'README.md', fileType: 'document' }])
    storage.activateVersion(rootVersion)
    const srcVersion = storage.createVersion(root, 'src', [])
    storage.insertFiles(srcVersion, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(srcVersion)

    const rootActive = storage.getActiveVersion(root, '.')
    const srcActive = storage.getActiveVersion(root, 'src')
    storage.closeDatabase()

    expect(rootActive?.scopeRoot).toBe('.')
    expect(rootActive?.files[0].relativePath).toBe('README.md')
    expect(srcActive?.scopeRoot).toBe('src')
    expect(srcActive?.files[0].relativePath).toBe('src/a.ts')
  })

  it('应该持久化到 JSON 文件并支持重新打开读取', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const reopened = createGraphStorage(root, { readonly: true })
    const active = reopened.getActiveVersion(root, '.')
    reopened.closeDatabase()

    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json'))).toBe(true)
    expect(active?.files[0].relativePath).toBe('src/a.ts')
  })

  it('应该在大图谱场景下写入分片并保留 active summary', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    const files = Array.from({ length: 260 }, (_, index) => ({ relativePath: `src/file-${index}.ts`, fileType: 'source' as const }))
    storage.insertFiles(versionId, files)
    storage.insertRelations(versionId, Array.from({ length: 260 }, (_, index) => ({ sourcePath: `src/file-${index}.ts`, targetPath: `src/file-${(index + 1) % 260}.ts`, relationType: 'import' as const })))
    storage.activateVersion(versionId)
    const summary = storage.getActiveVersionSummary(root, '.')
    const chunks = storage.loadActiveGraphChunks(root, '.')
    storage.closeDatabase()

    expect(summary?.chunkIds.length).toBeGreaterThan(1)
    expect(chunks.length).toBeGreaterThan(1)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1'))).toBe(true)
  })

  it('应该拒绝在只读存储中创建新版本', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.activateVersion(versionId)
    storage.closeDatabase()

    const readonlyStorage = createGraphStorage(root, { readonly: true })

    expect(() => readonlyStorage.createVersion(root, '.', [])).toThrow('只读模式不允许修改图谱存储')
    readonlyStorage.closeDatabase()
  })

  it('应该在已有写入锁时返回可恢复错误', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'docs', 'ae', 'graphs'), { recursive: true })
    writeFileSync(join(root, 'docs', 'ae', 'graphs', 'graph.json.lock'), 'other\n', 'utf8')

    expect(() => createGraphStorage(root)).toThrow('图谱存储正在被其他进程写入')
  })

  it('应该在存储文件损坏时释放写入锁', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'docs', 'ae', 'graphs'), { recursive: true })
    writeFileSync(join(root, 'docs', 'ae', 'graphs', 'graph.json'), '{broken', 'utf8')

    expect(() => createGraphStorage(root)).toThrow()
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
  })
})
