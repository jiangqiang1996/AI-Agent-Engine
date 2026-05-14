import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
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
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'manifest.json'))).toBe(true)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'indexes', 'scope-summary.json'))).toBe(true)
  })

  it('应该返回 active version 的 manifest 和索引诊断', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)

    const diagnostic = storage.diagnoseActiveVersion(root, '.')
    const summary = storage.readScopeSummary(root, '.')
    storage.closeDatabase()

    expect(diagnostic.code).toBe('ok')
    expect(summary?.fileCount).toBe(1)
    expect(summary?.nodeCount).toBe(1)
    expect(summary?.fileTypeCounts.source).toBe(1)
    expect(summary?.nodeKindCounts.file).toBe(1)
  })

  it('应该写入 schema v3 节点索引和节点关系索引', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { id: 'file:src/a.ts', kind: 'file', relativePath: 'src/a.ts', fileType: 'source', parser: 'regex' },
      { id: 'symbol:src/a.ts#fn:main', kind: 'symbol', relativePath: 'src/a.ts', label: 'main', fileType: 'source', parser: 'typescript' },
    ])
    storage.insertRelations(versionId, [
      {
        id: 'rel:main-call',
        sourceId: 'symbol:src/a.ts#fn:main',
        targetId: 'external:npm:pkg',
        sourcePath: 'src/a.ts',
        targetPath: 'pkg',
        relationType: 'external',
        type: 'call',
        confidence: 'candidate',
        parser: 'typescript',
      },
    ])
    storage.activateVersion(versionId)
    const active = storage.getActiveVersion(root, '.')
    const summary = storage.readScopeSummary(root, '.')
    storage.closeDatabase()

    expect(active?.files.map((file) => file.id).sort()).toEqual(['file:src/a.ts', 'symbol:src/a.ts#fn:main'])
    expect(active?.relations[0]).toMatchObject({ sourceId: 'symbol:src/a.ts#fn:main', type: 'call', confidence: 'candidate' })
    expect(summary?.nodeCount).toBe(2)
    expect(summary?.nodeKindCounts.symbol).toBe(1)
    expect(summary?.relationTypeCounts.call).toBe(1)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'indexes', 'node-id-to-chunk.json'))).toBe(true)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'indexes', 'source-node-to-relation-chunks.json'))).toBe(true)
  })

  it('不应该用旧路径关系键覆盖同文件内不同节点关系', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [
      { id: 'symbol:src/a.ts#fn:one', kind: 'symbol', relativePath: 'src/a.ts', fileType: 'source' },
      { id: 'symbol:src/a.ts#fn:two', kind: 'symbol', relativePath: 'src/a.ts', fileType: 'source' },
    ])
    storage.insertRelations(versionId, [
      {
        sourceId: 'symbol:src/a.ts#fn:one',
        targetId: 'external:npm:pkg',
        sourcePath: 'src/a.ts',
        targetPath: 'pkg',
        relationType: 'external',
        type: 'call',
      },
      {
        sourceId: 'symbol:src/a.ts#fn:two',
        targetId: 'external:npm:pkg',
        sourcePath: 'src/a.ts',
        targetPath: 'pkg',
        relationType: 'external',
        type: 'type_reference',
      },
    ])
    storage.activateVersion(versionId)
    const active = storage.getActiveVersion(root, '.')
    storage.closeDatabase()

    expect(active?.relations).toHaveLength(2)
    expect(active?.relations.map((relation) => relation.type).sort()).toEqual(['call', 'type_reference'])
  })

  it('应该在 manifest 缺失时返回可恢复诊断', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    unlinkSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'manifest.json'))

    const diagnostic = storage.diagnoseActiveVersion(root, '.')
    storage.closeDatabase()

    expect(diagnostic.code).toBe('missing_manifest')
    expect(diagnostic.recoverBy).toContain('ae-graph-build')
  })

  it('应该在 chunk 缺失时返回可恢复诊断', () => {
    const root = createTempRoot()
    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    unlinkSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'chunk-000001-0000.json'))

    const diagnostic = storage.diagnoseActiveVersion(root, '.')
    storage.closeDatabase()

    expect(diagnostic.code).toBe('missing_chunk')
    expect(diagnostic.problemChunkId).toBe('chunk-000001-0000')
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

    const storage = createGraphStorage(root)
    storage.closeDatabase()

    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
  })

  it('应该在图谱 schema 不兼容时清理旧图谱并重建空存储', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'docs', 'ae', 'graphs', 'version-1'), { recursive: true })
    writeFileSync(join(root, 'docs', 'ae', 'graphs', 'graph.json'), JSON.stringify({ schemaVersion: 2, nextVersionId: 2, versions: [] }), 'utf8')
    writeFileSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'chunk.json'), '{}', 'utf8')
    writeFileSync(join(root, 'docs', 'ae', 'graphs', 'README.md'), 'keep', 'utf8')

    const storage = createGraphStorage(root)
    const versionId = storage.createVersion(root, '.', [])
    storage.insertFiles(versionId, [{ relativePath: 'src/a.ts', fileType: 'source' }])
    storage.activateVersion(versionId)
    const active = storage.getActiveVersion(root, '.')
    storage.closeDatabase()

    expect(active?.versionId).toBe(1)
    expect(active?.files[0].relativePath).toBe('src/a.ts')
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'version-1', 'chunk.json'))).toBe(false)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'README.md'))).toBe(true)
    expect(existsSync(join(root, 'docs', 'ae', 'graphs', 'graph.json.lock'))).toBe(false)
  })
})
