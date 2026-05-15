export type GraphFileType = 'source' | 'document' | 'config' | 'directory' | 'asset' | 'external'
export type GraphNodeKind = 'file' | 'directory' | 'symbol' | 'external' | 'unresolved'

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
  symbolKind?: string
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
