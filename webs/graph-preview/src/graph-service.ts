import type {
  CyData,
  DirectoryStat,
  GraphIndex,
  GraphChunk,
  GraphFileNode,
  GraphManifest,
  GraphRelation,
  GraphStore,
  LoadedGraph,
} from './graph-types.js'

export const typeColors: Record<string, string> = {
  import: '#0969da',
  require: '#8250df',
  link: '#1a7f37',
  include: '#bf3989',
  directory: '#6e7781',
  contains: '#8250df',
  external: '#d4a72c',
  external_reference: '#d4a72c',
}

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

export function relationType(relation: GraphRelation): string {
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

export function fileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function nodeType(file: GraphFileNode): string {
  return file.kind === 'symbol' ? 'symbol' : file.fileType
}

function makeCyNode(file: GraphFileNode): { data: CyData['cyNodes'][number]['data'] } {
  const type = nodeType(file)
  const label = file.kind === 'symbol' ? file.label ?? fileName(file.relativePath) : fileName(file.relativePath)
  return {
    data: {
      id: nodeId(file),
      label,
      displayLabel: `${fileBadges[type] ?? 'asset'}  ${label}`,
      fullLabel: file.kind === 'symbol'
        ? `${file.relativePath}#${file.label ?? file.nodePath ?? ''}`
        : file.relativePath,
      type,
      color: fileColors[type] ?? '#6e7781',
      path: file.relativePath,
      parentId: file.parentId ?? '',
      symbolKind: file.symbolKind ?? '',
      range: file.range ?? null,
      language: file.language ?? '',
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
  if (id.startsWith('directory:')) {
    return 'directory'
  }
  if (id.startsWith('external:') || id.startsWith('unresolved:')) {
    return 'external'
  }
  return 'source'
}

function parentDirectories(path: string): string[] {
  const parts = path.split('/').filter(Boolean)
  return parts.slice(1).map((_, index) => parts.slice(0, index + 1).join('/'))
}

export function buildGraphIndex(files: GraphFileNode[], relations: GraphRelation[]): GraphIndex {
  const indexedFiles = files.map((file) => ({
    file,
    id: nodeId(file),
  }))
  const fileById = new Map(indexedFiles.map((entry) => [entry.id, entry.file]))
  const indexedRelations = relations.map((relation) => {
    const type = relationType(relation)
    return {
      relation,
      source: relationSourceId(relation),
      target: relationTargetId(relation),
      type,
      searchText: [type, relation.type, relation.sourcePath, relation.targetPath, relation.evidence, relation.reason]
        .join(' ')
        .toLowerCase(),
    }
  })

  return { files: indexedFiles, relations: indexedRelations, fileById }
}

function ensureDirectoryStat(stats: Map<string, DirectoryStat>, path: string, kind: DirectoryStat['kind']): DirectoryStat | null {
  const value = path.trim().replace(/\/+$|^\/+/, '')
  if (!isWorkspaceTreePath(value)) {
    return null
  }
  const current = stats.get(value) ?? { path: value, kind, files: 0, relations: 0 }
  if (current.kind === 'file' && kind === 'directory') {
    current.kind = 'directory'
  }
  stats.set(value, current)
  return current
}

function isWorkspaceTreePath(path: string): boolean {
  if (!path || path === '.' || path === '..') {
    return false
  }
  if (path.includes(':') || path.startsWith('@')) {
    return false
  }
  return true
}

function isUnselectedPath(path: string, unselectedDirs: Set<string>): boolean {
  return unselectedDirs.has(path)
}

export function isCollapsedPath(path: string, collapsedDirs: Set<string>): boolean {
  for (const dir of collapsedDirs) {
    if (path !== dir && path.startsWith(`${dir}/`)) {
      return true
    }
  }
  return false
}

export function buildDirectoryStats(files: GraphFileNode[], relations: GraphRelation[]): DirectoryStat[] {
  const stats = new Map<string, DirectoryStat>()
  for (const file of files) {
    if (!file.relativePath || file.kind === 'symbol') {
      continue
    }
    if (file.fileType === 'directory') {
      ensureDirectoryStat(stats, file.relativePath, 'directory')
    } else {
      const current = ensureDirectoryStat(stats, file.relativePath, 'file')
      if (current) {
        current.files = 1
      }
    }
    for (const dir of parentDirectories(file.relativePath)) {
      const current = ensureDirectoryStat(stats, dir, 'directory')
      if (!current) {
        continue
      }
      current.files += 1
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
      if (!current || seen.has(dir)) {
        continue
      }
      current.relations += 1
      seen.add(dir)
    }
  }

  return [...stats.values()].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path))
}

export function buildCyData(options: {
  index: GraphIndex
  fileFilter: string
  typeFilter: string
  nodeLimit: number
  granularity: string
  relationSearch: string
  unselectedDirs: Set<string>
}): CyData {
  const { index, fileFilter, typeFilter, nodeLimit, granularity, relationSearch, unselectedDirs } = options
  const search = relationSearch.toLowerCase()
  const filteredFiles = index.files.filter(({ file }) => {
    if (isUnselectedPath(file.relativePath, unselectedDirs)) {
      return false
    }
    if (fileFilter && !file.relativePath.startsWith(fileFilter)) {
      return false
    }
    if (granularity === 'file') {
      return file.kind !== 'symbol' && file.fileType !== 'directory'
    }
    if (granularity === 'symbol') {
      return file.kind === 'symbol'
    }
    return file.fileType !== 'directory'
  })

  const filteredRelations = index.relations.filter((entry) => {
    const { relation, type } = entry
    if (isUnselectedPath(relation.sourcePath, unselectedDirs) || isUnselectedPath(relation.targetPath, unselectedDirs)) {
      return false
    }
    if (typeFilter && type !== typeFilter) {
      return false
    }
    if (search && !entry.searchText.includes(search)) {
      return false
    }
    if (!fileFilter && type === 'directory') {
      return false
    }
    if (granularity === 'file' && type === 'contains') {
      return false
    }
    if (granularity === 'symbol' && type !== 'contains' && !entry.source.startsWith('symbol:') && !entry.target.startsWith('symbol:')) {
      return false
    }
    return !fileFilter || relation.sourcePath.startsWith(fileFilter) || relation.targetPath.startsWith(fileFilter)
  })

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
  const virtualNodes = new Map<string, { id: string; path: string; type: string } | GraphFileNode>()
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
      if (seenEdges.has(key)) {
        return
      }
      seenEdges.add(key)
      cyEdges.push({
        data: {
          id: `e${relationIndex}`,
          source,
          target,
          relType: type,
          label: type,
          color: typeColors[type] ?? '#d1d5da',
          evidence: relation.evidence ?? relation.metadata?.raw ?? '',
          reason: relation.reason ?? '',
          range: relation.range ?? null,
          confidence: relation.confidence ?? '',
          parser: relation.parser ?? '',
          searchMatch: relationSearch ? 'true' : 'false',
        },
      })
    })

  for (const [id, node] of virtualNodes) {
    if ('relativePath' in node) {
      cyNodes.push(makeCyNode(node))
    } else {
      cyNodes.push({
        data: {
          id,
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
  const node = files.find((file) => nodeId(file) === id)
  if (node?.kind === 'symbol') {
    return `${node.relativePath}#${node.label ?? node.nodePath ?? id}`
  }
  return relationPathForId(relation, id, isSource)
}
