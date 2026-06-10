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
  | 'dependency'
  | 'image_reference'

export type GraphConfidence = 'resolved' | 'candidate' | 'unresolved'

/** 关系所属层级 */
export type GraphLayer = 'code' | 'document' | 'artifact' | 'inferred'

/** 关系来源解析器 */
export type GraphRelationSource =
  | 'tree-sitter'
  | 'regex'
  | 'maven-cli'
  | 'npm-ls'
  | 'go-mod'
  | 'pipdeptree'
  | 'cargo-tree'
  | 'gradle-deps'
  | 'user-override'

/** 关系完整性 */
export type GraphCompleteness = 'full' | 'partial' | 'incomplete'

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
  /** external-package 节点所属包生态 */
  ecosystem?: 'maven' | 'npm' | 'gomod' | 'pip' | 'cargo' | 'gradle'
  /** Maven groupId 等 */
  groupId?: string
  /** Maven artifactId 等 */
  artifactId?: string
  /** 包版本 */
  version?: string
  /** Maven scope 等 */
  scope?: string
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
  /** 关系所属层级，未标注时默认 code */
  layer?: GraphLayer
  /** 关系来源解析器，未标注时默认 tree-sitter */
  source?: GraphRelationSource
  /** 关系完整性 */
  completeness?: GraphCompleteness
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

/** 图谱视图定义 */
export interface GraphView {
  id: string
  label: string
  layers: GraphLayer[]
  relationTypes?: GraphRelationType[]
  description?: string
}

/** 内置视图常量 */
export const BUILTIN_VIEWS: GraphView[] = [
  { id: 'code', label: '代码视图', layers: ['code'], description: '仅代码层关系（import/call/extends 等）' },
  { id: 'document', label: '文档视图', layers: ['document'], description: '仅文档引用关系（link/include/image_reference）' },
  { id: 'artifact', label: '制品视图', layers: ['artifact'], description: '仅制品依赖关系（dependency）' },
  { id: 'full', label: '完整视图', layers: ['code', 'document', 'artifact', 'inferred'], description: '所有层关系' },
]
