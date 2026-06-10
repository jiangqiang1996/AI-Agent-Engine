import { dirname } from 'node:path'

import type { GraphFileNode, GraphRelation } from '../graph-storage-service.js'
import { BUILTIN_VIEWS } from './graph-schema.js'
import { filterGraph, getRelationType } from './graph-filter.js'

/** 按关系类型分组的边 ID 列表 */
export type RelationTypeIndex = Record<string, string[]>

/** 按目录分组的节点相对路径列表 */
export type DirectoryIndex = Record<string, string[]>

/** 视图统计 */
export interface ViewStats {
  viewId: string
  nodeCount: number
  relationCount: number
}

/** query-index 预计算摘要 */
export interface QueryIndex {
  byRelationType: RelationTypeIndex
  byDirectory: DirectoryIndex
  viewStats: ViewStats[]
  totalNodes: number
  totalRelations: number
}

/**
 * 生成 query-index 预计算摘要
 * 构建时调用，结果写入 query-index.json 供预览页快速查询
 */
export function generateQueryIndex(
  files: GraphFileNode[],
  relations: GraphRelation[],
): QueryIndex {
  const byRelationType: RelationTypeIndex = {}
  for (const relation of relations) {
    const type = getRelationType(relation)
    const id = relation.id ?? `${relation.sourcePath}->${relation.targetPath}:${type}`
    if (!byRelationType[type]) {
      byRelationType[type] = []
    }
    byRelationType[type].push(id)
  }

  const byDirectory: DirectoryIndex = {}
  for (const file of files) {
    const dir = dirname(file.relativePath)
    if (!byDirectory[dir]) {
      byDirectory[dir] = []
    }
    byDirectory[dir].push(file.relativePath)
  }

  const viewStats: ViewStats[] = BUILTIN_VIEWS.map((view) => {
    const filtered = filterGraph(files, relations, { layers: view.layers })
    return {
      viewId: view.id,
      nodeCount: filtered.files.length,
      relationCount: filtered.relations.length,
    }
  })

  return {
    byRelationType,
    byDirectory,
    viewStats,
    totalNodes: files.length,
    totalRelations: relations.length,
  }
}
