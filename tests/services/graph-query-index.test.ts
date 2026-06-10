import { describe, it, expect } from 'vitest'

import { generateQueryIndex } from '../../src/services/graph/graph-query-index.js'
import type { GraphFileNode, GraphRelation } from '../../src/services/graph-storage-service.js'

function makeFile(relativePath: string, overrides?: Partial<GraphFileNode>): GraphFileNode {
  return {
    relativePath,
    fileType: 'source',
    ...overrides,
  }
}

function makeRelation(
  sourcePath: string,
  targetPath: string,
  relationType: 'import' | 'link' | 'dependency' | 'image_reference' | 'include',
  overrides?: Partial<GraphRelation>,
): GraphRelation {
  return {
    sourcePath,
    targetPath,
    relationType,
    ...overrides,
  }
}

describe('graph-query-index', () => {
  it('应该按关系类型分组边', () => {
    const files = [
      makeFile('src/a.ts'),
      makeFile('src/b.ts'),
      makeFile('docs/readme.md', { fileType: 'document' }),
    ]
    const relations = [
      makeRelation('src/a.ts', 'src/b.ts', 'import'),
      makeRelation('src/a.ts', 'docs/readme.md', 'link'),
      makeRelation('src/b.ts', 'src/a.ts', 'import'),
    ]
    const index = generateQueryIndex(files, relations)
    expect(index.byRelationType['import']).toHaveLength(2)
    expect(index.byRelationType['link']).toHaveLength(1)
  })

  it('应该按目录分组节点', () => {
    const files = [
      makeFile('src/a.ts'),
      makeFile('src/b.ts'),
      makeFile('docs/readme.md', { fileType: 'document' }),
      makeFile('docs/guide/intro.md', { fileType: 'document' }),
    ]
    const relations: GraphRelation[] = []
    const index = generateQueryIndex(files, relations)
    expect(index.byDirectory['src']).toEqual(['src/a.ts', 'src/b.ts'])
    expect(index.byDirectory['docs']).toEqual(['docs/readme.md'])
    expect(index.byDirectory['docs/guide']).toEqual(['docs/guide/intro.md'])
  })

  it('应该计算各视图统计', () => {
    const files = [
      makeFile('src/a.ts', { fileType: 'source' }),
      makeFile('src/b.ts', { fileType: 'source' }),
      makeFile('docs/readme.md', { fileType: 'document' }),
      makeFile('lib/jar:com.example:core:1.0', { fileType: 'source', kind: 'external-package' }),
    ]
    const relations = [
      makeRelation('src/a.ts', 'src/b.ts', 'import', { layer: 'code' }),
      makeRelation('docs/readme.md', 'docs/guide.md', 'link', { layer: 'document' }),
      makeRelation('src/a.ts', 'lib/jar:com.example:core:1.0', 'dependency', { layer: 'artifact' }),
    ]
    const index = generateQueryIndex(files, relations)
    const codeView = index.viewStats.find((v) => v.viewId === 'code')
    const docView = index.viewStats.find((v) => v.viewId === 'document')
    const artifactView = index.viewStats.find((v) => v.viewId === 'artifact')
    const fullView = index.viewStats.find((v) => v.viewId === 'full')
    expect(codeView).toBeDefined()
    // filterGraph 保留所有文件，仅按 layer 过滤关系
    expect(codeView!.nodeCount).toBe(4)
    expect(codeView!.relationCount).toBe(1)
    expect(docView!.nodeCount).toBe(4)
    expect(docView!.relationCount).toBe(1)
    expect(artifactView!.nodeCount).toBe(4)
    expect(artifactView!.relationCount).toBe(1)
    expect(fullView!.nodeCount).toBe(4)
    expect(fullView!.relationCount).toBe(3)
  })

  it('应该计算总统计', () => {
    const files = [makeFile('a.ts'), makeFile('b.ts')]
    const relations = [makeRelation('a.ts', 'b.ts', 'import')]
    const index = generateQueryIndex(files, relations)
    expect(index.totalNodes).toBe(2)
    expect(index.totalRelations).toBe(1)
  })

  it('空图谱应返回空索引', () => {
    const index = generateQueryIndex([], [])
    expect(index.byRelationType).toEqual({})
    expect(index.byDirectory).toEqual({})
    expect(index.totalNodes).toBe(0)
    expect(index.totalRelations).toBe(0)
    expect(index.viewStats).toHaveLength(4)
    for (const vs of index.viewStats) {
      expect(vs.nodeCount).toBe(0)
      expect(vs.relationCount).toBe(0)
    }
  })

  it('无 layer 的节点应被所有视图包含', () => {
    const files = [makeFile('a.ts')]
    const relations: GraphRelation[] = []
    const index = generateQueryIndex(files, relations)
    for (const vs of index.viewStats) {
      expect(vs.nodeCount).toBeGreaterThanOrEqual(1)
    }
  })
})
