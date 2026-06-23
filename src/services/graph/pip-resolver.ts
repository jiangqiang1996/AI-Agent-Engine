import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** pipdeptree JSON 条目 */
interface PipDepTreeEntry {
  package: { key: string; package_name: string; installed_version: string }
  dependencies?: Array<{ key: string; package_name: string; installed_version: string }>
}

/**
 * 解析 pipdeptree --json 输出为 DependencyNode 树
 * 纯函数，便于测试
 *
 * pipdeptree --json 返回扁平数组，每个条目含自身 package 和 dependencies。
 * 以第一个条目为根，其余条目中未被任何条目引用的包作为根的直接依赖。
 */
export function parsePipDepTreeJson(json: string): DependencyNode {
  let entries: PipDepTreeEntry[]
  try {
    entries = JSON.parse(json) as PipDepTreeEntry[]
  } catch {
    return { name: 'pip-project', children: [] }
  }

  if (entries.length === 0) {
    return { name: 'pip-project', children: [] }
  }

  // 构建包名到条目的映射
  const entryMap = new Map<string, PipDepTreeEntry>()
  for (const entry of entries) {
    entryMap.set(entry.package.key, entry)
  }

  // 收集被引用的子包（不作为根级直接依赖）
  const referenced = new Set<string>()
  for (const entry of entries) {
    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        referenced.add(dep.key)
      }
    }
  }

  function buildNode(entry: PipDepTreeEntry, visited: Set<string>): DependencyNode {
    if (visited.has(entry.package.key)) {
      return { name: entry.package.package_name, version: entry.package.installed_version, children: [] }
    }
    visited.add(entry.package.key)

    const children: DependencyNode[] = []
    if (entry.dependencies) {
      for (const dep of entry.dependencies) {
        const depEntry = entryMap.get(dep.key)
        if (depEntry) {
          children.push(buildNode(depEntry, visited))
        } else {
          children.push({
            name: dep.package_name,
            version: dep.installed_version,
            children: [],
          })
        }
      }
    }
    return {
      name: entry.package.package_name,
      version: entry.package.installed_version,
      children,
    }
  }

  // 以第一个条目为根，未被引用的条目也作为根的直接依赖
  const rootEntry = entries[0]!
  const root = buildNode(rootEntry, new Set())

  for (let i = 1; i < entries.length; i++) {
    const entry = entries[i]!
    if (!referenced.has(entry.package.key)) {
      root.children.push(buildNode(entry, new Set()))
    }
  }

  return root
}

/** requirements.txt 行正则 */
const REQUIREMENTS_LINE_REGEX = /^([A-Za-z0-9_.-]+)\s*(?:[=<>~!]+\s*([^\s;]+))?/

/**
 * 解析 requirements.txt 内容提取直接依赖
 * 纯函数，便于测试
 */
export function parseRequirementsTxt(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) {
      continue
    }
    const match = REQUIREMENTS_LINE_REGEX.exec(trimmed)
    if (match) {
      const [, name, version] = match
      deps.push({ name, version, children: [] })
    }
  }
  return deps
}

/** pip 依赖解析器 */
export const pipResolver: DependencyResolver = {
  ecosystem: 'pip',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'requirements.txt'))
      || existsSync(join(worktree, 'pyproject.toml'))
      || existsSync(join(worktree, 'setup.py'))
  },

  async resolve(worktree: string, timeout: number = 30000): Promise<DependencyTree> {
    // 优先调用 pipdeptree --json
    try {
      const output = execSync('pipdeptree --json', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parsePipDepTreeJson(output)
      return { ecosystem: 'pip', root, parser: 'tool-cli' }
    } catch {
      // 命令失败时降级
    }

    // 降级：解析 requirements.txt
    const reqPath = join(worktree, 'requirements.txt')
    if (existsSync(reqPath)) {
      try {
        const content = readFileSync(reqPath, 'utf-8')
        const children = parseRequirementsTxt(content)
        return {
          ecosystem: 'pip',
          root: { name: 'pip-project', children },
          parser: 'regex-fallback',
        }
      } catch (error) {
        const message = extractErrorMessage(error)
        throw new Error(`pip 依赖解析失败：${message}`)
      }
    }

    // 降级：解析 pyproject.toml 中的 dependencies 段
    const pyprojectPath = join(worktree, 'pyproject.toml')
    if (existsSync(pyprojectPath)) {
      try {
        const content = readFileSync(pyprojectPath, 'utf-8')
        const children = parsePyprojectTomlDeps(content)
        return {
          ecosystem: 'pip',
          root: { name: 'pip-project', children },
          parser: 'regex-fallback',
        }
      } catch (error) {
        const message = extractErrorMessage(error)
        throw new Error(`pip 依赖解析失败：${message}`)
      }
    }

    // 降级：解析 setup.py 中的 install_requires
    const setupPath = join(worktree, 'setup.py')
    if (existsSync(setupPath)) {
      try {
        const content = readFileSync(setupPath, 'utf-8')
        const children = parseSetupPy(content)
        return {
          ecosystem: 'pip',
          root: { name: 'pip-project', children },
          parser: 'regex-fallback',
        }
      } catch (error) {
        const message = extractErrorMessage(error)
        throw new Error(`pip 依赖解析失败：${message}`)
      }
    }

    throw new Error('pip 依赖解析失败：未找到 requirements.txt、pyproject.toml 或 setup.py')
  },
}

/** pyproject.toml dependencies 行正则 */
const PYPROJECT_DEP_REGEX = /^\s*"([A-Za-z0-9_.-]+)\s*(?:([=<>~!]+)\s*([^\s",]+))?"/

/**
 * 解析 pyproject.toml 中 [project] dependencies 列表
 * 纯函数，便于测试；只处理 PEP 621 格式
 */
export function parsePyprojectTomlDeps(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  const lines = content.split('\n')
  let inDependencies = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '[project.dependencies]' || trimmed === '[project.optional-dependencies]') {
      inDependencies = true
      continue
    }

    // 其他段开始时退出
    if (inDependencies && trimmed.startsWith('[')) {
      inDependencies = false
      continue
    }

    if (inDependencies) {
      const match = PYPROJECT_DEP_REGEX.exec(line)
        if (match) {
          const [, name, , version] = match
          deps.push({ name, version, children: [] })
        }
      }
    }

  return deps
}

/** setup.py install_requires 行正则 */
const SETUP_PY_REQUIRES_REGEX = /install_requires\s*=\s*\[([^\]]*)\]/

/** setup.py 单个依赖行正则 */
const SETUP_PY_DEP_LINE_REGEX = /['"]([A-Za-z0-9_.-]+)\s*(?:([=<>~!]+)\s*([^\s'",;]+))?['"]/g

/**
 * 解析 setup.py 中的 install_requires
 * 纯函数，便于测试
 */
export function parseSetupPy(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  const match = SETUP_PY_REQUIRES_REGEX.exec(content)
  if (!match) {
    return deps
  }
  const requiresBlock = match[1]!
  for (const depMatch of requiresBlock.matchAll(SETUP_PY_DEP_LINE_REGEX)) {
    const [, name, , version] = depMatch
    deps.push({ name, version, children: [] })
  }
  return deps
}
