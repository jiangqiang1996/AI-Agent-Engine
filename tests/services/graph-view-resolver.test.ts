import { describe, it, expect } from 'vitest'

import { resolveBuiltInView, resolveView } from '../../src/services/graph/graph-view-resolver.js'
import { BUILTIN_VIEWS } from '../../src/services/graph/graph-schema.js'
import { filterGraph } from '../../src/services/graph/graph-filter.js'
import type { GraphFileNode, GraphRelation } from '../../src/services/graph-storage-service.js'

// ---- 测试数据工厂 ----

function makeFile(overrides: Partial<GraphFileNode> & { relativePath: string }): GraphFileNode {
  return {
    fileType: 'source',
    ...overrides,
  }
}

function makeRelation(overrides: Partial<GraphRelation> & { sourcePath: string; targetPath: string; relationType: GraphRelation['relationType'] }): GraphRelation {
  return {
    ...overrides,
  }
}

// ---- 测试数据 ----

const sampleFiles: GraphFileNode[] = [
  makeFile({ relativePath: 'src/index.ts', kind: 'file', fileType: 'source', language: 'TypeScript' }),
  makeFile({ relativePath: 'src/utils/helper.ts', kind: 'file', fileType: 'source', language: 'TypeScript' }),
  makeFile({ relativePath: 'docs/README.md', kind: 'file', fileType: 'document' }),
  makeFile({ relativePath: 'package.json', kind: 'file', fileType: 'config' }),
]

const sampleRelations: GraphRelation[] = [
  // code 层关系
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import', layer: 'code' }),
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'call', layer: 'code' }),
  // document 层关系
  makeRelation({ sourcePath: 'docs/README.md', targetPath: 'src/utils/helper.ts', relationType: 'link', layer: 'document' }),
  makeRelation({ sourcePath: 'docs/README.md', targetPath: 'src/index.ts', relationType: 'include', layer: 'document' }),
  // artifact 层关系
  makeRelation({ sourcePath: 'package.json', targetPath: 'react', relationType: 'external', layer: 'artifact' }),
  // 无 layer 字段（默认 code）
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'require' }),
]

// ---- resolveBuiltInView ----

describe('resolveBuiltInView', () => {
  it('应返回 code 内置视图', () => {
    const view = resolveBuiltInView('code')
    expect(view.id).toBe('code')
    expect(view.label).toBe('代码视图')
    expect(view.layers).toEqual(['code'])
  })

  it('应返回 document 内置视图', () => {
    const view = resolveBuiltInView('document')
    expect(view.id).toBe('document')
    expect(view.label).toBe('文档视图')
    expect(view.layers).toEqual(['document'])
  })

  it('应返回 artifact 内置视图', () => {
    const view = resolveBuiltInView('artifact')
    expect(view.id).toBe('artifact')
    expect(view.label).toBe('制品视图')
    expect(view.layers).toEqual(['artifact'])
  })

  it('应返回 full 内置视图', () => {
    const view = resolveBuiltInView('full')
    expect(view.id).toBe('full')
    expect(view.label).toBe('完整视图')
    expect(view.layers).toEqual(['code', 'document', 'artifact', 'inferred'])
  })

  it('未知 viewId 应降级为 full 视图', () => {
    const view = resolveBuiltInView('nonexistent')
    expect(view.id).toBe('full')
  })

  it('空字符串 viewId 应降级为 full 视图', () => {
    const view = resolveBuiltInView('')
    expect(view.id).toBe('full')
  })
})

// ---- resolveView 正常路径 ----

describe('resolveView', () => {
  it('code 视图应仅保留 code 层关系', () => {
    const result = resolveView(sampleFiles, sampleRelations, 'code')
    // code 层：import、call、require（无 layer 默认 code）
    expect(result.relations).toHaveLength(3)
    for (const relation of result.relations) {
      expect(relation.layer ?? 'code').toBe('code')
    }
  })

  it('document 视图应仅保留 document 层关系', () => {
    const result = resolveView(sampleFiles, sampleRelations, 'document')
    // document 层：link、include
    expect(result.relations).toHaveLength(2)
    for (const relation of result.relations) {
      expect(relation.layer).toBe('document')
    }
  })

  it('artifact 视图应仅保留 artifact 层关系', () => {
    const result = resolveView(sampleFiles, sampleRelations, 'artifact')
    // artifact 层：external
    expect(result.relations).toHaveLength(1)
    expect(result.relations[0].layer).toBe('artifact')
  })

  it('full 视图应保留所有层关系', () => {
    const result = resolveView(sampleFiles, sampleRelations, 'full')
    expect(result.relations).toHaveLength(sampleRelations.length)
  })

  it('未知 viewId 应降级为 full 视图并保留所有关系', () => {
    const result = resolveView(sampleFiles, sampleRelations, 'unknown')
    expect(result.relations).toHaveLength(sampleRelations.length)
  })
})

// ---- resolveView 边界情况 ----

describe('resolveView 边界情况', () => {
  it('空图谱应返回空结果', () => {
    const result = resolveView([], [], 'code')
    expect(result.files).toHaveLength(0)
    expect(result.relations).toHaveLength(0)
  })

  it('无对应 layer 关系时应返回空关系', () => {
    // 只有 code 层关系，查 document 视图
    const codeOnlyRelations = [
      makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import', layer: 'code' }),
    ]
    const result = resolveView(sampleFiles, codeOnlyRelations, 'document')
    expect(result.relations).toHaveLength(0)
  })

  it('所有关系无 layer 字段时应默认为 code 层', () => {
    const noLayerRelations = [
      makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import' }),
      makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'call' }),
    ]
    // code 视图应包含全部（默认 code）
    const codeResult = resolveView(sampleFiles, noLayerRelations, 'code')
    expect(codeResult.relations).toHaveLength(2)
    // document 视图应无匹配
    const docResult = resolveView(sampleFiles, noLayerRelations, 'document')
    expect(docResult.relations).toHaveLength(0)
  })

  it('inferred 层关系应在 full 视图中保留', () => {
    const inferredRelation = makeRelation({
      sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import', layer: 'inferred',
    })
    const result = resolveView(sampleFiles, [inferredRelation], 'full')
    expect(result.relations).toHaveLength(1)
  })

  it('inferred 层关系不应在 code 视图中保留', () => {
    const inferredRelation = makeRelation({
      sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import', layer: 'inferred',
    })
    const result = resolveView(sampleFiles, [inferredRelation], 'code')
    expect(result.relations).toHaveLength(0)
  })
})

// ---- resolveView 与 filterGraph 一致性 ----

describe('resolveView 与 filterGraph 一致性', () => {
  it('code 视图结果应与直接调用 filterGraph(layers=["code"]) 一致', () => {
    const viewResult = resolveView(sampleFiles, sampleRelations, 'code')
    const directResult = filterGraph(sampleFiles, sampleRelations, { layers: ['code'], includeSymbolNodes: false })
    expect(viewResult.files).toEqual(directResult.files)
    expect(viewResult.relations).toEqual(directResult.relations)
  })

  it('document 视图结果应与直接调用 filterGraph(layers=["document"]) 一致', () => {
    const viewResult = resolveView(sampleFiles, sampleRelations, 'document')
    const directResult = filterGraph(sampleFiles, sampleRelations, { layers: ['document'], includeSymbolNodes: false })
    expect(viewResult.files).toEqual(directResult.files)
    expect(viewResult.relations).toEqual(directResult.relations)
  })

  it('full 视图结果应与直接调用 filterGraph(layers=所有层) 一致', () => {
    const viewResult = resolveView(sampleFiles, sampleRelations, 'full')
    const directResult = filterGraph(sampleFiles, sampleRelations, {
      layers: ['code', 'document', 'artifact', 'inferred'],
      includeSymbolNodes: false,
    })
    expect(viewResult.files).toEqual(directResult.files)
    expect(viewResult.relations).toEqual(directResult.relations)
  })
})

// ---- BUILTIN_VIEWS 常量校验 ----

describe('BUILTIN_VIEWS', () => {
  it('应包含 4 个内置视图', () => {
    expect(BUILTIN_VIEWS).toHaveLength(4)
  })

  it('每个视图应有唯一 id', () => {
    const ids = BUILTIN_VIEWS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('每个视图应有 label 和 layers', () => {
    for (const view of BUILTIN_VIEWS) {
      expect(view.id).toBeTruthy()
      expect(view.label).toBeTruthy()
      expect(view.layers.length).toBeGreaterThan(0)
    }
  })
})
