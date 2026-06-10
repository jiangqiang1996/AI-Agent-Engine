import { describe, it, expect } from 'vitest'

import {
  filterGraph,
  filterRelationsByDirectory,
  getRelationType,
  isInDirectory,
  isFileLevelRelation,
} from '../../src/services/graph/graph-filter.js'
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

const sampleFiles: GraphFileNode[] = [
  makeFile({ relativePath: 'src/index.ts', kind: 'file', fileType: 'source', language: 'TypeScript' }),
  makeFile({ relativePath: 'src/utils/helper.ts', kind: 'file', fileType: 'source', language: 'TypeScript' }),
  makeFile({ relativePath: 'docs/README.md', kind: 'file', fileType: 'document' }),
  makeFile({ relativePath: 'config/app.json', kind: 'file', fileType: 'config' }),
  makeFile({ relativePath: 'src', kind: 'directory', fileType: 'directory' }),
  makeFile({ relativePath: 'src/index.ts#MyClass', kind: 'symbol', fileType: 'source' }),
]

const sampleRelations: GraphRelation[] = [
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/utils/helper.ts', relationType: 'import' }),
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'config/app.json', relationType: 'require' }),
  makeRelation({ sourcePath: 'src', targetPath: 'src/index.ts', relationType: 'contains' }),
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'src/index.ts#MyClass', relationType: 'contains' }),
  makeRelation({ sourcePath: 'src/index.ts', targetPath: 'external:react', relationType: 'external' }),
  makeRelation({ sourcePath: 'docs/README.md', targetPath: 'src/utils/helper.ts', relationType: 'link' }),
]

// ---- isInDirectory ----

describe('isInDirectory', () => {
  it('目录为 undefined 时应始终返回 true', () => {
    expect(isInDirectory('src/index.ts', undefined)).toBe(true)
    expect(isInDirectory('any/path', undefined)).toBe(true)
  })

  it('目录为 "." 时应始终返回 true', () => {
    expect(isInDirectory('src/index.ts', '.')).toBe(true)
  })

  it('文件路径等于目录时应返回 true', () => {
    expect(isInDirectory('src', 'src')).toBe(true)
  })

  it('文件路径以目录为前缀时应返回 true', () => {
    expect(isInDirectory('src/index.ts', 'src')).toBe(true)
    expect(isInDirectory('src/utils/helper.ts', 'src')).toBe(true)
  })

  it('文件路径不在目录内时应返回 false', () => {
    expect(isInDirectory('docs/README.md', 'src')).toBe(false)
    expect(isInDirectory('config/app.json', 'src')).toBe(false)
  })

  it('目录尾部斜杠应被规范化', () => {
    expect(isInDirectory('src/index.ts', 'src/')).toBe(true)
  })
})

// ---- getRelationType ----

describe('getRelationType', () => {
  it('有 type 字段时应优先使用 type', () => {
    const relation = makeRelation({
      sourcePath: 'a.ts', targetPath: 'b.ts', relationType: 'import', type: 'call',
    })
    expect(getRelationType(relation)).toBe('call')
  })

  it('无 type 且 relationType 为 external 时应映射为 external_reference', () => {
    const relation = makeRelation({
      sourcePath: 'a.ts', targetPath: 'react', relationType: 'external',
    })
    expect(getRelationType(relation)).toBe('external_reference')
  })

  it('无 type 且 relationType 非 external 时应直接使用 relationType', () => {
    const relation = makeRelation({
      sourcePath: 'a.ts', targetPath: 'b.ts', relationType: 'import',
    })
    expect(getRelationType(relation)).toBe('import')
  })
})

// ---- isFileLevelRelation ----

describe('isFileLevelRelation', () => {
  it('contains 类型应返回 false', () => {
    const relation = makeRelation({
      sourcePath: 'src', targetPath: 'src/index.ts', relationType: 'contains',
    })
    expect(isFileLevelRelation(relation)).toBe(false)
  })

  it('非 contains 类型应返回 true', () => {
    const relation = makeRelation({
      sourcePath: 'a.ts', targetPath: 'b.ts', relationType: 'import',
    })
    expect(isFileLevelRelation(relation)).toBe(true)
  })
})

// ---- filterRelationsByDirectory ----

describe('filterRelationsByDirectory', () => {
  it('目录为 undefined 时应返回全部关系', () => {
    expect(filterRelationsByDirectory(sampleRelations, undefined)).toHaveLength(sampleRelations.length)
  })

  it('目录为 "." 时应返回全部关系', () => {
    expect(filterRelationsByDirectory(sampleRelations, '.')).toHaveLength(sampleRelations.length)
  })

  it('应保留至少一端在目录内的关系', () => {
    const result = filterRelationsByDirectory(sampleRelations, 'src')
    // import: src→src ✓, require: src→config ✓ (source 在 src), contains: src→src ✓,
    // contains: src→symbol ✓, external: src→external ✓ (source 在 src),
    // link: docs→src ✓ (target 在 src)
    expect(result).toHaveLength(6)
  })

  it('两端都不在目录内时应排除', () => {
    const result = filterRelationsByDirectory(sampleRelations, 'docs')
    // 只有 link: docs→src 一端在 docs
    expect(result).toHaveLength(1)
  })
})

// ---- filterGraph ----

describe('filterGraph', () => {
  it('空 options 时应排除 symbol 节点并保留端点闭合的关系', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {})
    // symbol 节点被排除（includeSymbolNodes 默认 false）
    expect(result.files.some((f) => f.kind === 'symbol')).toBe(false)
    // 关系端点需闭合到过滤后的文件集
    const filePathSet = new Set(result.files.map((f) => f.relativePath))
    for (const relation of result.relations) {
      const connected = filePathSet.has(relation.sourcePath) || filePathSet.has(relation.targetPath)
      expect(connected).toBe(true)
    }
  })

  it('空 files 和 relations 时应返回空结果', () => {
    const result = filterGraph([], [], {})
    expect(result.files).toHaveLength(0)
    expect(result.relations).toHaveLength(0)
  })

  it('空 files 和 relations 配合选项也应返回空结果', () => {
    const result = filterGraph([], [], { directory: 'src', fileType: 'source', relationTypes: ['import'] })
    expect(result.files).toHaveLength(0)
    expect(result.relations).toHaveLength(0)
  })

  it('excludePaths 应排除匹配的文件和关系', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      excludePaths: ['config/app.json'],
      includeSymbolNodes: true,
    })
    expect(result.files.some((f) => f.relativePath === 'config/app.json')).toBe(false)
    // require 关系一端是 config/app.json（被排除），关系在 excludePaths 阶段即被移除
    const requireRelation = result.relations.find((r) => r.relationType === 'require')
    expect(requireRelation).toBeUndefined()
  })

  it('excludePaths 排除两端时应排除关系', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      excludePaths: ['src/index.ts', 'src/utils/helper.ts'],
      includeSymbolNodes: true,
    })
    // import 关系两端都被排除
    const importRelation = result.relations.find((r) => r.relationType === 'import')
    expect(importRelation).toBeUndefined()
  })

  it('directory 应按目录前缀过滤文件和关系', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      directory: 'src',
      includeSymbolNodes: true,
    })
    expect(result.files.every((f) => f.relativePath === 'src' || f.relativePath.startsWith('src/'))).toBe(true)
  })

  it('fileType 应按文件类型过滤', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      fileType: 'document',
      includeSymbolNodes: true,
    })
    expect(result.files.every((f) => f.fileType === 'document')).toBe(true)
    expect(result.files.some((f) => f.relativePath === 'docs/README.md')).toBe(true)
  })

  it('relationTypes 应按关系类型过滤', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      relationTypes: ['import'],
      includeSymbolNodes: true,
    })
    expect(result.relations.every((r) => getRelationType(r) === 'import')).toBe(true)
  })

  it('relationTypes 为空数组时应视为不过滤（与 layers 语义一致）', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      relationTypes: [],
      includeSymbolNodes: true,
    })
    expect(result.relations.length).toBeGreaterThan(0)
  })

  it('includeSymbolNodes 为 true 时应保留 symbol 节点', () => {
    const result = filterGraph(sampleFiles, sampleRelations, { includeSymbolNodes: true })
    expect(result.files.some((f) => f.kind === 'symbol')).toBe(true)
  })

  it('includeSymbolNodes 为 false 时应排除 symbol 节点', () => {
    const result = filterGraph(sampleFiles, sampleRelations, { includeSymbolNodes: false })
    expect(result.files.some((f) => f.kind === 'symbol')).toBe(false)
  })

  it('多种过滤条件组合应正确工作', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      directory: 'src',
      fileType: 'source',
      relationTypes: ['import'],
      excludePaths: ['src/utils/helper.ts'],
      includeSymbolNodes: false,
    })
    // 文件：src/index.ts（source, 在 src, 非 symbol, 未排除）
    // src/utils/helper.ts 被排除
    // src 被排除（fileType 不是 source）
    // symbol 被排除
    expect(result.files).toHaveLength(1)
    expect(result.files[0].relativePath).toBe('src/index.ts')
    // import 关系：src/index.ts → src/utils/helper.ts
    // target 在 excludePaths 中，关系在 excludePaths 阶段即被移除
    expect(result.relations).toHaveLength(0)
  })

  it('无效的 relationType 应静默忽略（无匹配结果）', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      relationTypes: ['nonexistent_type'],
      includeSymbolNodes: true,
    })
    expect(result.relations).toHaveLength(0)
  })

  it('无效的 fileType 应静默忽略（无匹配文件）', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      fileType: 'nonexistent',
      includeSymbolNodes: true,
    })
    expect(result.files).toHaveLength(0)
    // 无文件则关系端点闭合后也为空
    expect(result.relations).toHaveLength(0)
  })

  it('关系端点闭合：两端都不在文件集中时应排除', () => {
    // 只保留 document 类型文件，关系两端都不在 document 文件集中时排除
    const result = filterGraph(sampleFiles, sampleRelations, {
      fileType: 'document',
      includeSymbolNodes: true,
    })
    // docs/README.md 是唯一的 document 文件
    // link: docs→src，source 在文件集中，保留
    const linkRelation = result.relations.find((r) => r.relationType === 'link')
    expect(linkRelation).toBeDefined()
    // import: src→src，两端都不在文件集中，排除
    const importRelation = result.relations.find((r) => r.relationType === 'import')
    expect(importRelation).toBeUndefined()
  })

  it('external 关系的 getRelationType 应映射为 external_reference', () => {
    const result = filterGraph(sampleFiles, sampleRelations, {
      relationTypes: ['external_reference'],
      includeSymbolNodes: true,
    })
    const externalRelations = result.relations.filter((r) => r.relationType === 'external')
    expect(externalRelations.length).toBeGreaterThan(0)
  })
})
