import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** cargo tree 输出行正则：缩进 + name vversion */
const CARGO_TREE_LINE_REGEX = /^([│├└┘─┣━┃ ]*)(\S+)\s+v(\S+)/

/**
 * 解析 cargo tree 输出为 DependencyNode 树
 * 纯函数，便于测试
 *
 * cargo tree 每行格式：[缩进]name vversion
 * 缩进用 │├└ 等字符表示层级，每层4字符
 */
export function parseCargoTreeOutput(output: string): DependencyNode {
  const root: DependencyNode = { name: 'cargo-project', children: [] }
  // 预置 root 到栈中，首行匹配项作为 root 子节点
  const stack: Array<{ node: DependencyNode; depth: number }> = [{ node: root, depth: -1 }]

  for (const line of output.split('\n')) {
    const match = CARGO_TREE_LINE_REGEX.exec(line)
    if (!match) {
      continue
    }

    const [, prefix, name, version] = match
    const prefixLen = prefix.length
    // 无缩进的首行作为 depth 0（root 的直接子节点）
    if (prefixLen === 0) {
      const current: DependencyNode = { name, version, children: [] }
      root.children.push(current)
      stack.length = 1
      stack.push({ node: current, depth: 0 })
      continue
    }
    // 深度由缩进字符数决定
    // cargo tree 每层3字符（├── 或 │  ）或4字符（含空格变体）
    const depthBy3 = Math.round(prefixLen / 3)
    const depthBy4 = Math.round(prefixLen / 4)
    const depth = Math.min(depthBy3, depthBy4) || 1
    const current: DependencyNode = { name, version, children: [] }

    // 弹出栈直到找到父节点
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.node.children.push(current)
    }
    stack.push({ node: current, depth })
  }

  return root
}

/** Cargo.toml [dependencies] 行正则 */
const CARGO_DEP_TOML_REGEX = /^(\S+)\s*=\s*"([^"]+)"/

/** Cargo.toml [dependencies] table 行正则：name = { version = "x" } */
const CARGO_DEP_TABLE_REGEX = /^(\S+)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"[^}]*\}/

/**
 * 解析 Cargo.toml 内容提取直接依赖
 * 纯函数，便于测试
 */
export function parseCargoToml(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  const lines = content.split('\n')
  let inDeps = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '[dependencies]' || trimmed === '[dev-dependencies]') {
      inDeps = true
      continue
    }

    // 其他段开始时退出
    if (inDeps && trimmed.startsWith('[')) {
      inDeps = false
      continue
    }

    if (inDeps) {
      // table 格式：name = { version = "x", ... }
      const tableMatch = CARGO_DEP_TABLE_REGEX.exec(trimmed)
      if (tableMatch) {
        const [, name, version] = tableMatch
        deps.push({ name, version, children: [] })
        continue
      }

      // 简单格式：name = "version"
      const simpleMatch = CARGO_DEP_TOML_REGEX.exec(trimmed)
      if (simpleMatch) {
        const [, name, version] = simpleMatch
        deps.push({ name, version, children: [] })
      }
    }
  }

  return deps
}

/** cargo 依赖解析器 */
export const cargoResolver: DependencyResolver = {
  ecosystem: 'cargo',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'Cargo.toml'))
  },

  async resolve(worktree: string, timeout: number = 30000): Promise<DependencyTree> {
    // 优先调用 cargo tree
    try {
      const output = execSync('cargo tree', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parseCargoTreeOutput(output)
      return { ecosystem: 'cargo', root, parser: 'tool-cli' }
    } catch {
      // 命令失败时降级
    }

    // 降级：正则解析 Cargo.toml
    try {
      const cargoTomlPath = join(worktree, 'Cargo.toml')
      const content = readFileSync(cargoTomlPath, 'utf-8')
      const children = parseCargoToml(content)
      const rootName = extractCrateName(content)
      return {
        ecosystem: 'cargo',
        root: { name: rootName, children },
        parser: 'regex-fallback',
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      throw new Error(`cargo 依赖解析失败：${message}`)
    }
  },
}

/** 从 Cargo.toml 提取 [package] name 作为根 crate 名 */
function extractCrateName(content: string): string {
  const match = /^name\s*=\s*"([^"]+)"/m.exec(content)
  return match?.[1] ?? 'cargo-project'
}
