import type { DependencyTree, DependencyNode } from './dependency-resolver.js'
import type { GraphLayer, GraphParserDiagnostic, GraphRelationSource } from './graph-schema.js'
import type { GraphFileNode, GraphRelation } from '../graph-storage-service.js'
import type { ToolchainProfile } from './toolchain-profile.js'
import { mavenResolver } from './maven-resolver.js'
import { npmResolver } from './npm-resolver.js'
import { goResolver } from './go-resolver.js'
import { pipResolver } from './pip-resolver.js'
import { cargoResolver } from './cargo-resolver.js'
import { gradleResolver } from './gradle-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** 工具描述符 */
export interface ToolDescriptor {
  tool: string
  command: string
  detectFiles: string[]
}

/** Stage 结果 */
export interface StageResult {
  nodes: GraphFileNode[]
  relations: GraphRelation[]
  diagnostics: GraphParserDiagnostic[]
}

/** 构建阶段抽象 */
export interface BuildStage {
  /** 阶段名称 */
  name: string
  /** 产出层 */
  layer: GraphLayer
  /** 所需工具 */
  requiredTools: ToolDescriptor[]
  /** 提取图谱数据 */
  extract(worktree: string, toolchain: ToolchainProfile): Promise<StageResult>
  /** 置信度 */
  confidence: 'deterministic' | 'heuristic'
}

/** 已注册的依赖解析器列表 */
const RESOLVERS = [mavenResolver, npmResolver, goResolver, pipResolver, cargoResolver, gradleResolver]

/** 生态系统到关系来源的映射 */
const ECOSYSTEM_TO_SOURCE: Record<string, GraphRelationSource> = {
  maven: 'maven-cli',
  npm: 'npm-ls',
  gomod: 'go-mod',
  pip: 'pipdeptree',
  cargo: 'cargo-tree',
  gradle: 'gradle-deps',
}

/** 生态系统到根特征文件的映射 */
const ECOSYSTEM_TO_MANIFEST: Record<string, string> = {
  maven: 'pom.xml',
  npm: 'package.json',
  gomod: 'go.mod',
  pip: 'requirements.txt',
  cargo: 'Cargo.toml',
  gradle: 'build.gradle',
}

/** 生态系统类型联合 */
type GraphEcosystem = 'maven' | 'npm' | 'gomod' | 'pip' | 'cargo' | 'gradle'

/** 递归展平 DependencyNode 树为图谱节点和关系 */
function flattenDependencyTree(
  tree: DependencyTree,
  worktree: string,
): { nodes: GraphFileNode[]; relations: GraphRelation[] } {
  const nodes: GraphFileNode[] = []
  const relations: GraphRelation[] = []
  const source: GraphRelationSource = ECOSYSTEM_TO_SOURCE[tree.ecosystem] ?? 'regex'
  const parserSource: 'tool-cli' | 'regex-fallback' = tree.parser
  const manifestFile = ECOSYSTEM_TO_MANIFEST[tree.ecosystem] ?? 'unknown'
  const ecosystem = tree.ecosystem as GraphEcosystem

  let nodeIndex = 0

  // 为根项目创建节点
  const rootId = `ext:${tree.ecosystem}:${tree.root.name}`
  nodes.push({
    id: rootId,
    kind: 'external-package',
    relativePath: manifestFile,
    label: tree.root.name,
    fileType: 'config',
    ecosystem,
    version: tree.root.version,
    parser: parserSource,
  })
  function visitNode(parentId: string, node: DependencyNode, visited: Set<string>): void {
    nodeIndex++
    const nodeId = `ext:${tree.ecosystem}:${node.name}@${node.version ?? 'unknown'}`

    // 环检测：已访问节点截断，防止循环依赖导致栈溢出
    if (visited.has(nodeId)) {
      return
    }
    visited.add(nodeId)

    const isMaven = tree.ecosystem === 'maven'
    const colonIndex = isMaven ? node.name.indexOf(':') : -1
    const groupId = isMaven && colonIndex > 0 ? node.name.slice(0, colonIndex) : undefined
    const artifactId = isMaven && colonIndex > 0 ? node.name.slice(colonIndex + 1) : node.name

    nodes.push({
      id: nodeId,
      kind: 'external-package',
      relativePath: node.name,
      label: node.name,
      fileType: 'config',
      ecosystem,
      groupId,
      artifactId,
      version: node.version,
      scope: node.scope,
      parser: parserSource,
    })

    relations.push({
      id: `rel:dep:${nodeIndex}`,
      sourceId: parentId,
      targetId: nodeId,
      sourcePath: parentId,
      targetPath: nodeId,
      type: 'dependency',
      relationType: 'dependency',
      confidence: parserSource === 'tool-cli' ? 'resolved' : 'candidate',
      parser: parserSource,
      layer: 'artifact',
      source,
      completeness: parserSource === 'tool-cli' ? 'full' : 'partial',
    })

    for (const child of node.children) {
      visitNode(nodeId, child, visited)
    }
  }

  const visited = new Set<string>()
  visited.add(rootId)
  for (const child of tree.root.children) {
    visitNode(rootId, child, visited)
  }

  return { nodes, relations }
}

/** 内置 Stage：制品依赖解析（depth=medium 时激活） */
export const ARTIFACT_STAGE: BuildStage = {
  name: 'artifact',
  layer: 'artifact',
  requiredTools: [{ tool: 'dependency-resolver', command: '', detectFiles: [] }],
  async extract(worktree: string, toolchain: ToolchainProfile): Promise<StageResult> {
    const allNodes: GraphFileNode[] = []
    const allRelations: GraphRelation[] = []
    const allDiagnostics: GraphParserDiagnostic[] = []

    for (const resolver of RESOLVERS) {
      const info = toolchain.get(resolver.ecosystem)
      // 只处理可用且检测到特征文件的生态系统
      if (!info?.available) {
        continue
      }

      try {
        const tree = await resolver.resolve(worktree, 60000)
        const { nodes, relations } = flattenDependencyTree(tree, worktree)
        allNodes.push(...nodes)
        allRelations.push(...relations)
      } catch (error) {
        const message = extractErrorMessage(error)
        allDiagnostics.push({
          filePath: ECOSYSTEM_TO_MANIFEST[resolver.ecosystem] ?? 'unknown',
          parser: resolver.ecosystem,
          severity: 'warning',
          message: `${resolver.ecosystem} 依赖解析失败：${message}`,
        })
      }
    }

    return { nodes: allNodes, relations: allRelations, diagnostics: allDiagnostics }
  },
  confidence: 'heuristic',
}
