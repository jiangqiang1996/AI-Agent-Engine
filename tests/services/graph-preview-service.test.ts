import { describe, expect, it } from 'vitest'

import { buildCyData, buildGraphIndex } from '../../webs/graph-preview/src/graph-service.js'
import type { CyData, GraphFileNode, GraphRelation } from '../../webs/graph-preview/src/graph-types.js'

const files: GraphFileNode[] = [
  { id: 'file:src/app.ts', kind: 'file', relativePath: 'src/app.ts', fileType: 'source' },
  { id: 'file:src/util.ts', kind: 'file', relativePath: 'src/util.ts', fileType: 'source' },
  { id: 'file:src/extra.ts', kind: 'file', relativePath: 'src/extra.ts', fileType: 'source' },
  {
    id: 'symbol:src/app.ts#function:start:1',
    kind: 'symbol',
    relativePath: 'src/app.ts',
    fileType: 'source',
    label: 'start',
    parentId: 'file:src/app.ts',
    symbolKind: 'function',
  },
  {
    id: 'symbol:src/util.ts#function:helper:1',
    kind: 'symbol',
    relativePath: 'src/util.ts',
    fileType: 'source',
    label: 'helper',
    parentId: 'file:src/util.ts',
    symbolKind: 'function',
  },
]

const relations: GraphRelation[] = [
  {
    sourceId: 'file:src/app.ts',
    targetId: 'file:src/util.ts',
    sourcePath: 'src/app.ts',
    targetPath: 'src/util.ts',
    relationType: 'import',
    evidence: './util',
  },
  {
    sourceId: 'file:src/app.ts',
    targetId: 'file:src/extra.ts',
    sourcePath: 'src/app.ts',
    targetPath: 'src/extra.ts',
    relationType: 'require',
    evidence: './extra',
  },
  {
    sourceId: 'symbol:src/app.ts#function:start:1',
    targetId: 'symbol:src/util.ts#function:helper:1',
    sourcePath: 'src/app.ts',
    targetPath: 'src/util.ts',
    relationType: 'contains',
    evidence: 'start helper',
  },
  {
    sourceId: 'file:src/app.ts',
    targetId: 'directory:src',
    sourcePath: 'src/app.ts',
    targetPath: 'src',
    relationType: 'directory',
    evidence: 'src',
  },
]

function buildData(options: Partial<Parameters<typeof buildCyData>[0]> = {}) {
  return buildCyData({
    index: buildGraphIndex(files, relations),
    selectedLayer: 'full',
    fileFilter: '',
    typeFilter: '',
    nodeLimit: 0,
    granularity: 'file',
    relationSearch: '',
    unselectedDirs: new Set(),
    ...options,
  })
}

function nodeIds(data: CyData): string[] {
  return data.cyNodes.map((node) => node.data.id).sort()
}

function edgeTypes(data: CyData): string[] {
  return data.cyEdges.map((edge) => edge.data.relType).sort()
}

describe('graph-preview 图谱筛选服务', () => {
  it('应该保持文件粒度默认筛选语义', () => {
    const data = buildData()

    expect(nodeIds(data)).toEqual(['file:src/app.ts', 'file:src/extra.ts', 'file:src/util.ts'])
    expect(edgeTypes(data)).toEqual(['import', 'require'])
    expect(data.stats.filteredRelations).toBe(2)
  })

  it('应该保持目录取消为精确路径匹配', () => {
    const data = buildData({ unselectedDirs: new Set(['src']) })

    expect(nodeIds(data)).toEqual(['file:src/app.ts', 'file:src/extra.ts', 'file:src/util.ts'])
    expect(edgeTypes(data)).toEqual(['import', 'require'])
  })

  it('应该按关系搜索、类型和文件过滤生成相同节点与边', () => {
    const data = buildData({ relationSearch: 'UTIL', typeFilter: 'import', fileFilter: 'src/app.ts' })

    expect(nodeIds(data)).toEqual(['file:src/app.ts', 'file:src/util.ts'])
    expect(edgeTypes(data)).toEqual(['import'])
    expect(data.cyEdges[0]?.data.searchMatch).toBe('true')
  })

  it('应该保持 symbol 粒度筛选和虚拟节点补全语义', () => {
    const data = buildData({ granularity: 'symbol' })

    expect(nodeIds(data)).toEqual(['symbol:src/app.ts#function:start:1', 'symbol:src/util.ts#function:helper:1'])
    expect(edgeTypes(data)).toEqual(['contains'])
  })

  it('应该保持节点上限后的相邻虚拟节点补全语义', () => {
    const data = buildData({ nodeLimit: 1 })

    expect(nodeIds(data)).toEqual(['file:src/app.ts', 'file:src/extra.ts', 'file:src/util.ts'])
    expect(edgeTypes(data)).toEqual(['import', 'require'])
    expect(data.stats.filteredFiles).toBe(3)
  })

  it('应该保持缺省关系端点的索引推导语义', () => {
    const index = buildGraphIndex([{ relativePath: 'src/app.ts', fileType: 'source' }], [
      { sourcePath: 'src/app.ts', targetPath: 'src/util.ts', relationType: 'import' },
      { sourcePath: 'src/app.ts', targetPath: 'src', relationType: 'directory' },
      { sourcePath: 'src/app.ts', targetPath: 'npm:pkg', relationType: 'external_reference' },
    ])

    expect(index.relations.map((relation) => [relation.source, relation.target, relation.type])).toEqual([
      ['file:src/app.ts', 'file:src/util.ts', 'import'],
      ['file:src/app.ts', 'directory:src', 'directory'],
      ['file:src/app.ts', 'external:unknown:npm:pkg', 'external_reference'],
    ])
  })
})
