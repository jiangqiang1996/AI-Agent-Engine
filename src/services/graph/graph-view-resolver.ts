import type { GraphFileNode, GraphRelation } from '../graph-storage-service.js'
import type { GraphView } from './graph-schema.js'
import { BUILTIN_VIEWS } from './graph-schema.js'
import { filterGraph, type GraphFilterOptions, type FilteredGraph } from './graph-filter.js'

/**
 * 根据 viewId 查找内置视图
 * 未知 id 降级为 full 视图
 */
export function resolveBuiltInView(viewId: string): GraphView {
  const found = BUILTIN_VIEWS.find((view) => view.id === viewId)
  if (found) {
    return found
  }
  // 未知视图降级为 full
  return BUILTIN_VIEWS.find((view) => view.id === 'full')!
}

/**
 * 解析视图：按视图定义的 layers 和 relationTypes 过滤图谱
 */
export function resolveView(
  files: GraphFileNode[],
  relations: GraphRelation[],
  viewId: string,
): FilteredGraph {
  const view = resolveBuiltInView(viewId)
  const options: GraphFilterOptions = {
    layers: view.layers,
    includeSymbolNodes: false,
  }
  // 视图额外约束了 relationTypes 时一并传入
  if (view.relationTypes) {
    options.relationTypes = view.relationTypes
  }
  return filterGraph(files, relations, options)
}
