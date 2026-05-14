export type GraphNodeKind = 'file' | 'directory' | 'symbol' | 'external' | 'unresolved'

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

export type GraphRelationType =
  | 'contains'
  | 'import'
  | 'require'
  | 'include'
  | 'link'
  | 'export'
  | 'call'
  | 'construct'
  | 'extends'
  | 'implements'
  | 'type_reference'
  | 'field_reference'
  | 'variable_reference'
  | 'directory'
  | 'external_reference'

export type GraphConfidence = 'resolved' | 'candidate' | 'unresolved'

export interface SourceRange {
  startLine: number
  startColumn?: number
  endLine?: number
  endColumn?: number
}

export interface GraphNode {
  id: string
  kind: GraphNodeKind
  label: string
  filePath?: string
  language?: string
  nodePath?: string
  range?: SourceRange
  parentId?: string
  parser: string
  status?: string
  symbolKind?: GraphSymbolKind
}

export interface GraphRelation {
  id: string
  sourceId: string
  targetId: string
  type: GraphRelationType
  confidence: GraphConfidence
  range?: SourceRange
  parser: string
  evidence?: string
  reason?: string
}

export interface GraphParserDiagnostic {
  filePath: string
  parser: string
  severity: 'error' | 'warning'
  message: string
  line?: number
}

export interface GraphParserStats {
  parserName: string
  filesParsed: number
  nodesProduced: number
  relationsProduced: number
  elapsedMs: number
  errors: number
}

export interface GraphParserResult {
  nodes: GraphNode[]
  relations: GraphRelation[]
  diagnostics: GraphParserDiagnostic[]
  parserStats: GraphParserStats
}

export interface GraphBuildStats {
  elapsedMs: number
  filesParsed: number
  nodes: number
  relations: number
  failedFiles: number
  skippedFiles: number
  parserStats: GraphParserStats[]
}

export function makeFileNodeId(filePath: string): string {
  return `file:${filePath}`
}

export function makeSymbolNodeId(filePath: string, stableSymbolPath: string): string {
  return `symbol:${filePath}#${stableSymbolPath}`
}

export function makeExternalNodeId(ecosystem: string, specifier: string): string {
  return `external:${ecosystem}:${specifier}`
}

export function makeUnresolvedNodeId(sourceNodeId: string, relationType: string, stableIndex: number): string {
  return `unresolved:${sourceNodeId}#${relationType}#${stableIndex}`
}
