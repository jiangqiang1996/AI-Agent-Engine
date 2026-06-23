import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** go mod graph 输出行正则：module@version dependency@version，支持 +incompatible 后缀 */
const GO_MOD_GRAPH_LINE_REGEX = /^(\S+@v[\d.]+(?:-[\w.]+)*(?:\+incompatible)?)\s+(\S+@v[\d.]+(?:-[\w.]+)*(?:\+incompatible)?)$/

/** go.mod require 块内单行正则 */
const GO_REQUIRE_SINGLE_REGEX = /^require\s+(\S+)\s+(v[\d.]+(?:-\w+)*)/

/** go.mod require 块内多行条目正则 */
const GO_REQUIRE_ENTRY_REGEX = /^\s+(\S+)\s+(v[\d.]+(?:-\w*)*)/

/**
 * 解析 go mod graph 输出为 DependencyNode 树
 * 纯函数，便于测试
 *
 * go mod graph 每行格式：from@version to@version
 * 需要结合 rootModule 确定根节点，并构建父子树
 */
export function parseGoModGraph(output: string, rootModule: string): DependencyNode {
  const root: DependencyNode = { name: rootModule, children: [] }

  // 收集所有边
  const edges: Array<{ from: string; to: string }> = []
  for (const line of output.split('\n')) {
    const match = GO_MOD_GRAPH_LINE_REGEX.exec(line.trim())
    if (!match) {
      continue
    }
    const [, from, to] = match
    edges.push({ from, to })
  }

  // 构建邻接表：module@version -> 子模块@version 列表
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    const existing = adj.get(edge.from) ?? []
    existing.push(edge.to)
    adj.set(edge.from, existing)
  }

  // 从 rootModule@v* 开始 BFS 构建树，防止循环
  const rootKey = edges.length > 0 ? edges[0].from : rootModule
  const visited = new Set<string>()

  function buildNode(key: string): DependencyNode {
    const atIndex = key.lastIndexOf('@')
    const name = atIndex > 0 ? key.slice(0, atIndex) : key
    const version = atIndex > 0 ? key.slice(atIndex + 1) : undefined

    if (visited.has(key)) {
      return { name, version, children: [] }
    }
    visited.add(key)

    const children: DependencyNode[] = []
    const deps = adj.get(key)
    if (deps) {
      for (const dep of deps) {
        children.push(buildNode(dep))
      }
    }

    return { name, version, children }
  }

  return buildNode(rootKey)
}

/**
 * 解析 go.mod 内容提取 require 依赖
 * 纯函数，便于测试；只提取直接依赖
 */
export function parseGoMod(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  const lines = content.split('\n')
  let inRequireBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    // 单行 require
    const singleMatch = GO_REQUIRE_SINGLE_REGEX.exec(trimmed)
    if (singleMatch && !inRequireBlock) {
      const [, module, version] = singleMatch
      deps.push({ name: module, version, children: [] })
      continue
    }

    // require 块开始
    if (trimmed.startsWith('require (') || trimmed === 'require(') {
      inRequireBlock = true
      continue
    }

    // require 块结束
    if (inRequireBlock && trimmed === ')') {
      inRequireBlock = false
      continue
    }

    // require 块内条目
    if (inRequireBlock) {
      const entryMatch = GO_REQUIRE_ENTRY_REGEX.exec(line)
      if (entryMatch) {
        const [, module, version] = entryMatch
        deps.push({ name: module, version, children: [] })
      }
    }
  }

  return deps
}

/** 从 go.mod 提取 module 行作为根模块名 */
function extractRootModule(content: string): string {
  const match = /^module\s+(\S+)/m.exec(content)
  return match?.[1] ?? 'go-module'
}

/** Go 依赖解析器 */
export const goResolver: DependencyResolver = {
  ecosystem: 'gomod',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'go.mod'))
  },

  async resolve(worktree: string, timeout: number = 30000): Promise<DependencyTree> {
    const goModPath = join(worktree, 'go.mod')

    // 提取根模块名
    let rootModule = 'go-module'
    try {
      const goModContent = readFileSync(goModPath, 'utf-8')
      rootModule = extractRootModule(goModContent)
    } catch {
      // 读取失败时使用默认名称
    }

    // 优先调用 go mod graph
    try {
      const output = execSync('go mod graph', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parseGoModGraph(output, rootModule)
      return { ecosystem: 'gomod', root, parser: 'tool-cli' }
    } catch {
      // 命令失败时降级
    }

    // 降级：正则解析 go.mod
    try {
      const goModContent = readFileSync(goModPath, 'utf-8')
      const children = parseGoMod(goModContent)
      return {
        ecosystem: 'gomod',
        root: { name: rootModule, children },
        parser: 'regex-fallback',
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      throw new Error(`Go 依赖解析失败：${message}`)
    }
  },
}
