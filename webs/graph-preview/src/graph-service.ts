import type {
  CyData,
  CyNodeData,
  DirectoryStat,
  GraphChunk,
  GraphFileNode,
  GraphIndex,
  GraphLayer,
  GraphManifest,
  GraphRelation,
  GraphSelectedLayer,
  GraphStore,
  IndexedGraphRelation,
  LoadedGraph,
} from './graph-types.js'

const RELATION_META: Record<string, { label: string; color: string }> = {
  import: { label: '导入', color: '#0969da' },
  require: { label: '引用', color: '#8250df' },
  include: { label: '包含', color: '#bf3989' },
  link: { label: '链接', color: '#1a7f37' },
  contains: { label: '包含', color: '#8250df' },
  call: { label: '调用', color: '#cf222e' },
  extends: { label: '继承', color: '#1a7f37' },
  implements: { label: '实现', color: '#8250df' },
  type_reference: { label: '类型引用', color: '#0969da' },
  field_reference: { label: '字段引用', color: '#9a6700' },
  variable_reference: { label: '变量引用', color: '#bf3989' },
  construct: { label: '构造', color: '#cf222e' },
  export: { label: '导出', color: '#1f883d' },
  directory: { label: '目录', color: '#6e7781' },
  external: { label: '外部', color: '#d4a72c' },
  external_reference: { label: '外部引用', color: '#d4a72c' },
  dependency: { label: '依赖', color: '#d4a72c' },
  image_reference: { label: '图片引用', color: '#bf3989' },
}

export const RELATION_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(RELATION_META).map(([k, v]) => [k, v.label]),
)

export const typeColors: Record<string, string> = Object.fromEntries(
  Object.entries(RELATION_META).map(([k, v]) => [k, v.color]),
)

export const fileColors: Record<string, string> = {
  source: '#0969da',
  document: '#1a7f37',
  config: '#9a6700',
  directory: '#6e7781',
  asset: '#8250df',
  external: '#d4a72c',
  symbol: '#8250df',
}

export const fileBadges: Record<string, string> = {
  source: 'src',
  document: 'doc',
  config: 'cfg',
  directory: 'dir',
  asset: 'asset',
  external: 'ext',
  symbol: 'sym',
}

const CODE_FILE_RELATIONS = new Set(['import', 'require', 'include', 'directory'])
const CODE_SYMBOL_RELATIONS = new Set([
  'contains', 'call', 'extends', 'implements', 'type_reference',
  'field_reference', 'variable_reference', 'construct', 'export',
])
const DOC_RELATIONS = new Set(['link', 'image_reference'])
const ARTIFACT_RELATIONS = new Set(['dependency', 'external', 'external_reference'])

function inferLayer(entry: IndexedGraphRelation): GraphLayer {
  if (entry.relation.layer) {
    return entry.relation.layer
  }
  if (CODE_FILE_RELATIONS.has(entry.type) || CODE_SYMBOL_RELATIONS.has(entry.type)) {
    return 'code'
  }
  if (DOC_RELATIONS.has(entry.type)) {
    return 'document'
  }
  if (ARTIFACT_RELATIONS.has(entry.type)) {
    return 'artifact'
  }
  return 'inferred'
}

function layerMatches(entry: IndexedGraphRelation, selected: GraphSelectedLayer): boolean {
  if (selected === 'full') return true
  return inferLayer(entry) === selected
}

function isCodeSymbolRelation(type: string): boolean {
  return CODE_SYMBOL_RELATIONS.has(type)
}

function isArtifactRelation(type: string): boolean {
  return ARTIFACT_RELATIONS.has(type)
}

async function loadJSON<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`加载失败: ${path} (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function loadGraphData(base = '.'): Promise<LoadedGraph> {
  const store = await loadJSON<GraphStore>(`${base}/graph.json`)
  const active = store.versions.find((version) => version.isActive)
  if (!active) {
    throw new Error('未找到 active version，请先执行 ae-graph-build')
  }

  const versionDir = `${base}/version-${active.id}`
  const manifest = await loadJSON<GraphManifest>(`${versionDir}/manifest.json`)
  const chunks = await Promise.all(manifest.chunks.map((chunkId) => loadJSON<GraphChunk>(`${versionDir}/${chunkId}.json`)))

  const files = chunks.flatMap((chunk) => chunk.files ?? [])
  const relations = chunks.flatMap((chunk) => chunk.relations ?? [])

  return {
    files,
    relations,
    index: buildGraphIndex(files, relations),
    manifest,
  }
}

export function nodeId(file: GraphFileNode): string {
  return file.id ?? (file.fileType === 'directory' ? `directory:${file.relativePath}` : `file:${file.relativePath}`)
}

export function symbolNodeId(file: GraphFileNode): string {
  return file.id ?? `symbol:${file.relativePath}#${file.nodePath ?? file.label ?? ''}`
}

function relationType(relation: GraphRelation): string {
  return relation.relationType ?? relation.type ?? 'unknown'
}

export function relationSourceId(relation: GraphRelation): string {
  return relation.sourceId ?? `file:${relation.sourcePath}`
}

export function relationTargetId(relation: GraphRelation): string {
  if (relation.targetId) {
    return relation.targetId
  }
  const type = relationType(relation)
  if (type === 'directory') {
    return `directory:${relation.targetPath}`
  }
  return type === 'external' || type === 'external_reference'
    ? `external:unknown:${relation.targetPath}`
    : `file:${relation.targetPath}`
}

function fileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

export function relationLabel(type: string): string {
  return RELATION_LABELS[type] ?? type
}

function nodeType(file: GraphFileNode): string {
  return file.kind === 'symbol' ? 'symbol' : file.fileType
}

function displayLabel(file: GraphFileNode): string {
  const type = nodeType(file)
  const label = file.kind === 'symbol'
    ? file.label ?? fileName(file.relativePath)
    : fileName(file.relativePath)
  return `${fileBadges[type] ?? 'asset'}  ${label}`
}

function fullLabel(file: GraphFileNode): string {
  return file.kind === 'symbol'
    ? `${file.relativePath}#${file.label ?? file.nodePath ?? ''}`
    : file.relativePath
}

function makeCyNode(file: GraphFileNode): { data: CyNodeData } {
  const type = nodeType(file)
  return {
    data: {
      id: file.kind === 'symbol' ? symbolNodeId(file) : nodeId(file),
      label: file.kind === 'symbol' ? file.label ?? fileName(file.relativePath) : fileName(file.relativePath),
      displayLabel: displayLabel(file),
      fullLabel: fullLabel(file),
      type,
      color: fileColors[type] ?? '#6e7781',
      path: file.relativePath,
      parentId: file.parentId ?? '',
      symbolKind: file.symbolKind ?? '',
      range: file.range ?? null,
      language: file.language ?? '',
      ecosystem: file.ecosystem ?? '',
    },
  }
}

function relationPathForId(relation: GraphRelation, id: string, isSource: boolean): string {
  if (id.startsWith('file:') || id.startsWith('directory:')) {
    return id.split(':').slice(1).join(':')
  }
  return isSource ? relation.sourcePath : relation.targetPath
}

function virtualNodeType(id: string): string {
  if (id.startsWith('directory:')) return 'directory'
  if (id.startsWith('external:')) return 'external'
  if (id.startsWith('unresolved:')) return 'source'
  return 'source'
}

function parentDirectories(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function buildGraphIndex(files: GraphFileNode[], relations: GraphRelation[]): GraphIndex {
  const indexedFiles = files.map((file) => ({
    file,
    id: file.kind === 'symbol' ? symbolNodeId(file) : nodeId(file),
  }))
  const fileById = new Map(indexedFiles.map((entry) => [entry.id, entry.file]))
  const indexedRelations = relations.map((relation) => {
    const type = relationType(relation)
    const entry: IndexedGraphRelation = {
      relation,
      source: relationSourceId(relation),
      target: relationTargetId(relation),
      type,
      layer: inferLayer({
        relation,
        source: relationSourceId(relation),
        target: relationTargetId(relation),
        type,
        layer: 'code',
        searchText: '',
      }),
      searchText: [type, relation.type, relation.sourcePath, relation.targetPath, relation.evidence, relation.reason]
        .join(' ')
        .toLowerCase(),
    }
    return entry
  })

  return { files: indexedFiles, relations: indexedRelations, fileById }
}

function ensureDirectoryStat(stats: Map<string, DirectoryStat>, path: string, kind: DirectoryStat['kind']): DirectoryStat | null {
  const value = path.trim().replace(/\/+$|^\/+/, '')
  if (!isWorkspaceTreePath(value)) return null
  const current = stats.get(value) ?? { path: value, kind, files: 0, relations: 0 }
  if (current.kind === 'file' && kind === 'directory') {
    current.kind = 'directory'
  }
  stats.set(value, current)
  return current
}

function isWorkspaceTreePath(path: string): boolean {
  if (!path || path === '.' || path === '..') return false
  if (path.includes(':') || path.startsWith('@')) return false
  return true
}

function isUnselectedPath(path: string, unselectedDirs: Set<string>): boolean {
  return unselectedDirs.has(path)
}

export function buildDirectoryStats(files: GraphFileNode[], relations: GraphRelation[]): DirectoryStat[] {
  const stats = new Map<string, DirectoryStat>()
  for (const file of files) {
    if (!file.relativePath || file.kind === 'symbol') continue
    if (file.fileType === 'directory') {
      ensureDirectoryStat(stats, file.relativePath, 'directory')
    } else {
      const current = ensureDirectoryStat(stats, file.relativePath, 'file')
      if (current) current.files = 1
    }
    for (const dir of parentDirectories(file.relativePath)) {
      const current = ensureDirectoryStat(stats, dir, 'directory')
      if (current) current.files += 1
    }
  }

  for (const relation of relations) {
    const seen = new Set<string>()
    const relationDirs: string[] = []
    if (stats.has(relation.sourcePath)) {
      relationDirs.push(...parentDirectories(relation.sourcePath))
    }
    if (stats.has(relation.targetPath)) {
      relationDirs.push(...parentDirectories(relation.targetPath))
    }
    if (relationType(relation) === 'directory' && stats.has(relation.targetPath)) {
      relationDirs.push(relation.targetPath)
    }
    for (const dir of relationDirs) {
      const current = stats.get(dir)
      if (!current || seen.has(dir)) continue
      current.relations += 1
      seen.add(dir)
    }
  }

  return [...stats.values()].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
}

export function buildCyData(options: {
  index: GraphIndex
  selectedLayer: GraphSelectedLayer
  fileFilter: string
  typeFilter: string
  nodeLimit: number
  granularity: string
  relationSearch: string
  unselectedDirs: Set<string>
}): CyData {
  const { index, selectedLayer, fileFilter, typeFilter, nodeLimit, granularity, relationSearch, unselectedDirs } = options
  const search = relationSearch.toLowerCase()
  const isSymbolGranularity = granularity === 'symbol'

  const filteredFiles = index.files.filter(({ file }) => {
    if (isUnselectedPath(file.relativePath, unselectedDirs)) return false
    if (fileFilter && !file.relativePath.startsWith(fileFilter)) return false
    if (granularity === 'file') return file.kind !== 'symbol' && file.fileType !== 'directory'
    if (granularity === 'symbol') return file.kind === 'symbol'
    return file.fileType !== 'directory'
  })

  const filteredRelations = index.relations.filter((entry) => {
    if (!layerMatches(entry, selectedLayer)) return false
    const { relation, type } = entry
    if (isUnselectedPath(relation.sourcePath, unselectedDirs) || isUnselectedPath(relation.targetPath, unselectedDirs)) return false
    if (typeFilter && type !== typeFilter) return false
    if (search && !entry.searchText.includes(search)) return false
    if (!fileFilter && type === 'directory') return false
    if (isSymbolGranularity && isArtifactRelation(type)) return false
    if (granularity === 'file' && isCodeSymbolRelation(type)) return false
    if (isSymbolGranularity && type === 'directory') return false
    if (!fileFilter) return true
    return relation.sourcePath.startsWith(fileFilter) || relation.targetPath.startsWith(fileFilter)
  })

  if (selectedLayer === 'artifact') {
    return buildArtifactCyData(filteredFiles, filteredRelations, nodeLimit, search)
  }

  return buildStandardCyData(index, filteredFiles, filteredRelations, nodeLimit, search)
}

function buildArtifactCyData(
  filteredFiles: GraphIndex['files'],
  filteredRelations: IndexedGraphRelation[],
  nodeLimit: number,
  search: string,
): CyData {
  const packageNodeMap = new Map<string, { file: GraphFileNode; degree: number }>()
  const fileIdMap = new Map<string, string>()

  for (const entry of filteredFiles) {
    const { file, id } = entry
    if (file.kind === 'external' || file.kind === 'external-package') {
      const key = file.id ?? file.relativePath
      fileIdMap.set(id, key)
      const current = packageNodeMap.get(key) ?? { file, degree: 0 }
      packageNodeMap.set(key, current)
    }
  }

  for (const { source, target } of filteredRelations) {
    const srcKey = fileIdMap.get(source) ?? source
    const tgtKey = fileIdMap.get(target) ?? target
    if (!packageNodeMap.has(srcKey)) {
      packageNodeMap.set(srcKey, { file: { relativePath: srcKey, fileType: 'external' }, degree: 0 })
    }
    if (!packageNodeMap.has(tgtKey)) {
      packageNodeMap.set(tgtKey, { file: { relativePath: tgtKey, fileType: 'external' }, degree: 0 })
    }
    const srcEntry = packageNodeMap.get(srcKey)
    const tgtEntry = packageNodeMap.get(tgtKey)
    if (!srcEntry || !tgtEntry) continue
    srcEntry.degree += 1
    tgtEntry.degree += 1
  }

  const sorted = [...packageNodeMap.entries()]
    .sort(([, a], [, b]) => b.degree - a.degree)

  if (nodeLimit > 0 && sorted.length > nodeLimit) {
    sorted.length = nodeLimit
  }

  const validKeySet = new Set(sorted.map(([key]) => key))

  const cyNodes: CyData['cyNodes'] = []
  const seenEdges = new Set<string>()
  const cyEdges: CyData['cyEdges'] = []
  let edgeIndex = 0

  for (const [key, entry] of sorted) {
    const isExt = entry.file.kind === 'external' || entry.file.kind === 'external-package' || key.startsWith('external:')
    const shortLabel = isExt ? key : fileName(key.replace(/^file:/, ''))
    cyNodes.push({
      data: {
        id: key,
        label: shortLabel,
        displayLabel: `${isExt ? 'ext' : 'src'}  ${shortLabel}`,
        fullLabel: key,
        type: isExt ? 'external' : 'source',
        color: isExt ? fileColors.external : fileColors.source,
        path: key,
        parentId: '',
        symbolKind: '',
        range: null,
        language: '',
        ecosystem: entry.file.ecosystem ?? '',
      },
    })
  }

  for (const { relation, source, target, type } of filteredRelations) {
    const srcKey = fileIdMap.get(source) ?? source
    const tgtKey = fileIdMap.get(target) ?? target
    if (!validKeySet.has(srcKey) || !validKeySet.has(tgtKey)) continue
    const edgeKey = `${srcKey}\u0000${tgtKey}\u0000${type}`
    if (seenEdges.has(edgeKey)) continue
    seenEdges.add(edgeKey)
    const label = relationLabel(type)
    cyEdges.push({
      data: {
        id: `e${edgeIndex++}`,
        source: srcKey,
        target: tgtKey,
        relType: type,
        label,
        color: typeColors[type] ?? '#d1d5da',
        evidence: relation.evidence ?? relation.metadata?.raw ?? '',
        reason: relation.reason ?? '',
        range: relation.range ?? null,
        confidence: relation.confidence ?? '',
        parser: relation.parser ?? '',
        searchMatch: search ? 'true' : 'false',
      },
    })
  }

  return {
    cyNodes,
    cyEdges,
    stats: {
      nodes: cyNodes.length,
      edges: cyEdges.length,
      filteredFiles: filteredFiles.length,
      filteredRelations: filteredRelations.length,
    },
  }
}

function buildStandardCyData(
  index: GraphIndex,
  filteredFiles: GraphIndex['files'],
  filteredRelations: IndexedGraphRelation[],
  nodeLimit: number,
  search: string,
): CyData {
  const degreeById = new Map<string, number>()
  for (const relation of filteredRelations) {
    degreeById.set(relation.source, (degreeById.get(relation.source) ?? 0) + 1)
    degreeById.set(relation.target, (degreeById.get(relation.target) ?? 0) + 1)
  }

  let nodes = filteredFiles.filter((entry) => degreeById.has(entry.id))
  nodes = nodes.sort((a, b) => (degreeById.get(b.id) ?? 0) - (degreeById.get(a.id) ?? 0) || a.file.relativePath.localeCompare(b.file.relativePath))
  if (nodeLimit > 0 && nodes.length > nodeLimit) {
    nodes = nodes.slice(0, nodeLimit)
  }

  const nodeSet = new Set(nodes.map((entry) => entry.id))
  const cyNodes = nodes.map((entry) => makeCyNode(entry.file))
  const virtualNodes = new Map<string, GraphFileNode | { id: string; path: string; type: string }>()
  const seenEdges = new Set<string>()
  const cyEdges: CyData['cyEdges'] = []

  filteredRelations
    .filter((entry) => nodeSet.has(entry.source) || nodeSet.has(entry.target))
    .forEach((entry, relationIndex) => {
      const { relation, source, target, type } = entry
      if (!nodeSet.has(source) && !virtualNodes.has(source)) {
        virtualNodes.set(source, index.fileById.get(source) ?? { id: source, path: relationPathForId(relation, source, true), type: virtualNodeType(source) })
      }
      if (!nodeSet.has(target) && !virtualNodes.has(target)) {
        virtualNodes.set(target, index.fileById.get(target) ?? { id: target, path: relationPathForId(relation, target, false), type: virtualNodeType(target) })
      }
      const key = `${source}\u0000${target}\u0000${type}`
      if (seenEdges.has(key)) return
      seenEdges.add(key)
      const label = relationLabel(type)
      cyEdges.push({
        data: {
          id: `e${relationIndex}`,
          source,
          target,
          relType: type,
          label,
          color: typeColors[type] ?? '#d1d5da',
          evidence: relation.evidence ?? relation.metadata?.raw ?? '',
          reason: relation.reason ?? '',
          range: relation.range ?? null,
          confidence: relation.confidence ?? '',
          parser: relation.parser ?? '',
          searchMatch: search ? 'true' : 'false',
        },
      })
    })

  for (const [, node] of virtualNodes) {
    if ('relativePath' in node) {
      cyNodes.push(makeCyNode(node))
    } else {
      cyNodes.push({
        data: {
          id: node.id,
          label: fileName(node.path),
          displayLabel: `${fileBadges[node.type] ?? 'asset'}  ${fileName(node.path)}`,
          fullLabel: node.path,
          type: node.type,
          color: fileColors[node.type] ?? '#6e7781',
          path: node.path,
          parentId: '',
          symbolKind: '',
          range: null,
          language: '',
          ecosystem: '',
        },
      })
    }
  }

  return {
    cyNodes,
    cyEdges,
    stats: {
      nodes: cyNodes.length,
      edges: cyEdges.length,
      filteredFiles: filteredFiles.length,
      filteredRelations: filteredRelations.length,
    },
  }
}

export function relationEndpointLabel(files: GraphFileNode[], relation: GraphRelation, id: string, isSource: boolean): string {
  const node = files.find((file) => (file.kind === 'symbol' ? symbolNodeId(file) : nodeId(file)) === id)
  if (node?.kind === 'symbol') {
    return `${node.relativePath}#${node.label ?? node.nodePath ?? id}`
  }
  return relationPathForId(relation, id, isSource)
}

export function getAvailableRelationTypes(index: GraphIndex, selectedLayer: GraphSelectedLayer, granularity: string): Array<{ label: string; value: string }> {
  const typeSet = new Set<string>()
  for (const entry of index.relations) {
    if (!layerMatches(entry, selectedLayer)) continue
    const type = entry.type
    if (granularity === 'symbol' && (isCodeSymbolRelation(type) || CODE_FILE_RELATIONS.has(type) || DOC_RELATIONS.has(type))) {
      typeSet.add(type)
    } else if (granularity === 'file' && !isCodeSymbolRelation(type)) {
      typeSet.add(type)
    } else if (granularity === 'mixed' || selectedLayer === 'artifact') {
      typeSet.add(type)
    }
  }
  const sorted = [...typeSet].sort()
  return [{ label: '全部', value: '' }, ...sorted.map((v) => ({ label: relationLabel(v), value: v }))]
}

export function layerStats(index: GraphIndex): Record<GraphSelectedLayer, number> {
  const counts: Record<GraphSelectedLayer, number> = { full: 0, code: 0, document: 0, artifact: 0 }
  for (const entry of index.relations) {
    counts.full++
    const layer = inferLayer(entry)
    if (layer === 'code') counts.code++
    else if (layer === 'document') counts.document++
    else if (layer === 'artifact') counts.artifact++
  }
  return counts
}
