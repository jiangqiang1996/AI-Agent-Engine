export type GraphLayer = 'code' | 'document' | 'artifact' | 'inferred'

export type GraphSelectedLayer = 'full' | 'code' | 'document' | 'artifact'

export interface LayerDef {
  id: GraphSelectedLayer
  label: string
  description: string
}

export const LAYER_DEFS: LayerDef[] = [
  { id: 'full', label: '完整', description: '全部层级关系' },
  { id: 'code', label: '代码', description: 'import / call / extends 等代码关系' },
  { id: 'document', label: '文档', description: 'link / include / image 引用' },
  { id: 'artifact', label: '制品', description: '外部包依赖 (npm / maven / pip 等)' },
]

export type GraphFileType = 'source' | 'document' | 'config' | 'directory' | 'asset' | 'external'
export type GraphNodeKind = 'file' | 'directory' | 'symbol' | 'external' | 'unresolved' | 'external-package'
export type GraphSymbolKind =
  | 'module'
  | 'package'
  | 'class'
  | 'interface'
  | 'enum'
  | 'function'
  | 'method'
  | 'constructor'
  | 'field'
  | 'variable'
  | 'struct'
  | 'type'
  | 'section'

export interface SourceRange {
  startLine: number
  startColumn?: number
  endLine?: number
  endColumn?: number
}

export interface GraphFileNode {
  id?: string
  kind?: GraphNodeKind
  relativePath: string
  fileType: GraphFileType
  label?: string
  language?: string
  nodePath?: string
  parentId?: string
  parser?: string
  range?: SourceRange
  sizeBytes?: number
  symbolKind?: GraphSymbolKind
  ecosystem?: string
  groupId?: string
  artifactId?: string
  version?: string
  scope?: string
  status?: string
}

export interface GraphRelation {
  id?: string
  sourceId?: string
  targetId?: string
  sourcePath: string
  targetPath: string
  relationType?: string
  type?: string
  confidence?: string
  evidence?: string
  metadata?: { raw?: string }
  parser?: string
  range?: SourceRange
  reason?: string
  layer?: GraphLayer
  source?: string
  completeness?: string
}

export interface GraphVersionRecord {
  id: number
  isActive: boolean
}

export interface GraphStore {
  versions: GraphVersionRecord[]
}

export interface GraphManifest {
  chunks: string[]
}

export interface GraphChunk {
  files?: GraphFileNode[]
  relations?: GraphRelation[]
}

export interface LoadedGraph {
  files: GraphFileNode[]
  relations: GraphRelation[]
  index: GraphIndex
  manifest: GraphManifest
}

export interface DirectoryStat {
  path: string
  kind: 'directory' | 'file'
  files: number
  relations: number
}

export interface CyNodeData {
  id: string
  label: string
  displayLabel: string
  fullLabel: string
  type: string
  color: string
  path: string
  parentId: string
  symbolKind: string
  range: SourceRange | null
  language: string
  ecosystem: string
}

export interface CyEdgeData {
  id: string
  source: string
  target: string
  relType: string
  label: string
  color: string
  evidence: string
  reason: string
  range: SourceRange | null
  confidence: string
  parser: string
  searchMatch: string
}

export interface CyData {
  cyNodes: Array<{ data: CyNodeData }>
  cyEdges: Array<{ data: CyEdgeData }>
  stats: {
    nodes: number
    edges: number
    filteredFiles: number
    filteredRelations: number
  }
}

export interface IndexedGraphFile {
  file: GraphFileNode
  id: string
}

export interface IndexedGraphRelation {
  relation: GraphRelation
  source: string
  target: string
  type: string
  layer: GraphLayer
  searchText: string
}

export interface GraphIndex {
  files: IndexedGraphFile[]
  relations: IndexedGraphRelation[]
  fileById: Map<string, GraphFileNode>
}
