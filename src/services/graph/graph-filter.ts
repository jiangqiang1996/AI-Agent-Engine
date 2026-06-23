import { getRelationType, isFileLevelRelation } from '../graph-storage-utils.js'
import type { GraphFileNode, GraphRelation } from '../graph-storage-service.js'

export { getRelationType, isFileLevelRelation }

/** 图谱过滤选项 */
export interface GraphFilterOptions {
  /** 按目录前缀过滤，'.' 或 undefined 表示不限 */
  directory?: string
  /** 按关系类型过滤，匹配 getRelationType 的返回值 */
  relationTypes?: string[]
  /** 按文件类型过滤，匹配 GraphFileNode.fileType */
  fileType?: string
  /** 排除的文件路径集合 */
  excludePaths?: string[]
  /** 是否包含 kind==='symbol' 的节点，默认 false */
  includeSymbolNodes?: boolean
  /** 按 layer 过滤，匹配关系的 layer 字段（未标注 layer 的关系默认为 'code'） */
  layers?: string[]
}

/** 过滤后的图谱子集 */
export interface FilteredGraph {
  files: GraphFileNode[]
  relations: GraphRelation[]
}

/**
 * 判断文件路径是否在指定目录内
 * 目录为 undefined 或 '.' 时视为不限，始终返回 true
 */
export function isInDirectory(filePath: string, directory: string | undefined): boolean {
  if (!directory || directory === '.') {
    return true
  }
  const normalized = directory.replace(/\/$/, '')
  return filePath === normalized || filePath.startsWith(`${normalized}/`)
}

/**
 * 按目录过滤关系：两端至少一端在目录内
 */
export function filterRelationsByDirectory(relations: GraphRelation[], directory: string | undefined): GraphRelation[] {
  if (!directory || directory === '.') {
    return relations
  }
  return relations.filter((relation) =>
    isInDirectory(relation.sourcePath, directory) || isInDirectory(relation.targetPath, directory),
  )
}

/**
 * 统一图谱过滤纯函数
 * 按顺序应用：excludePaths → directory → fileType → relationTypes → includeSymbolNodes → 关系端点闭合
 */
export function filterGraph(
  files: GraphFileNode[],
  relations: GraphRelation[],
  options: GraphFilterOptions,
): FilteredGraph {
  const {
    directory,
    relationTypes,
    fileType,
    excludePaths,
    includeSymbolNodes,
    layers,
  } = options

  // 按 excludePaths 排除文件和关系
  const excludeSet = new Set(excludePaths ?? [])
  let filteredFiles = excludeSet.size > 0
    ? files.filter((file) => !excludeSet.has(file.relativePath))
    : files
  let filteredRelations = excludeSet.size > 0
    ? relations.filter((relation) => !excludeSet.has(relation.sourcePath) && !excludeSet.has(relation.targetPath))
    : relations

  // 按 directory 过滤文件
  if (directory && directory !== '.') {
    filteredFiles = filteredFiles.filter((file) => isInDirectory(file.relativePath, directory))
  }

  // 按 fileType 过滤文件
  if (fileType) {
    filteredFiles = filteredFiles.filter((file) => file.fileType === fileType)
  }

  // 按 includeSymbolNodes 决定是否包含 symbol 节点
  if (!includeSymbolNodes) {
    filteredFiles = filteredFiles.filter((file) => file.kind !== 'symbol')
  }

  // 按 layers 过滤关系：匹配关系的 layer 字段（未标注 layer 的关系默认为 'code'）
  if (layers !== undefined && layers.length > 0) {
    const layerSet = new Set(layers)
    filteredRelations = filteredRelations.filter((relation) =>
      layerSet.has(relation.layer ?? 'code'),
    )
  }

  // 按 relationTypes 过滤关系，空数组视为不过滤（与 layers 语义一致）
  if (relationTypes !== undefined && relationTypes.length > 0) {
    const typeSet = new Set(relationTypes)
    filteredRelations = filteredRelations.filter((relation) => typeSet.has(getRelationType(relation)))
  }

  // 按 directory 过滤关系：两端至少一端在目录内
  if (directory && directory !== '.') {
    filteredRelations = filteredRelations.filter((relation) =>
      isInDirectory(relation.sourcePath, directory) || isInDirectory(relation.targetPath, directory),
    )
  }

  // 关系端点闭合：两端至少一端在过滤后的文件集中
  const filePathSet = new Set(filteredFiles.map((file) => file.relativePath))
  filteredRelations = filteredRelations.filter((relation) =>
    filePathSet.has(relation.sourcePath) || filePathSet.has(relation.targetPath),
  )

  return { files: filteredFiles, relations: filteredRelations }
}
