import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** npm ls JSON 中依赖条目的结构 */
interface NpmLsDependency {
  version?: string
  resolved?: string
  dependencies?: Record<string, NpmLsDependency>
}

/** npm ls JSON 根结构 */
interface NpmLsOutput {
  name?: string
  version?: string
  dependencies?: Record<string, NpmLsDependency>
}

/**
 * 解析 npm ls --json --all 的 JSON 输出为 DependencyNode
 * 纯函数，便于测试
 */
export function parseNpmLsJson(json: string): DependencyNode {
  let parsed: NpmLsOutput
  try {
    parsed = JSON.parse(json) as NpmLsOutput
  } catch {
    return { name: 'npm-project', children: [] }
  }

  const rootName = parsed.name ?? 'npm-project'
  const rootVersion = parsed.version

  function buildNode(name: string, entry: NpmLsDependency, scope?: string): DependencyNode {
    const children: DependencyNode[] = []
    if (entry.dependencies) {
      for (const [childName, childEntry] of Object.entries(entry.dependencies)) {
        children.push(buildNode(childName, childEntry))
      }
    }
    return {
      name,
      version: entry.version,
      scope,
      children,
    }
  }

  const children: DependencyNode[] = []
  if (parsed.dependencies) {
    for (const [depName, depEntry] of Object.entries(parsed.dependencies)) {
      children.push(buildNode(depName, depEntry))
    }
  }

  return {
    name: rootName,
    version: rootVersion,
    children,
  }
}

/**
 * 解析 package.json 内容提取直接依赖
 * 纯函数，便于测试；devDependencies 的 scope 标记为 dev
 */
export function parsePackageJson(content: string): DependencyNode[] {
  let parsed: {
    name?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  try {
    parsed = JSON.parse(content) as typeof parsed
  } catch {
    return []
  }

  const deps: DependencyNode[] = []

  if (parsed.dependencies) {
    for (const [name, version] of Object.entries(parsed.dependencies)) {
      deps.push({
        name,
        version: version.startsWith('^') || version.startsWith('~') ? version.slice(1) : version,
        scope: 'dependencies',
        children: [],
      })
    }
  }

  if (parsed.devDependencies) {
    for (const [name, version] of Object.entries(parsed.devDependencies)) {
      deps.push({
        name,
        version: version.startsWith('^') || version.startsWith('~') ? version.slice(1) : version,
        scope: 'dev',
        children: [],
      })
    }
  }

  return deps
}

/** npm 依赖解析器 */
export const npmResolver: DependencyResolver = {
  ecosystem: 'npm',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'package.json'))
  },

  async resolve(worktree: string, timeout: number = 30000): Promise<DependencyTree> {
    const pkgPath = join(worktree, 'package.json')

    // 读取项目名称
    let rootName = 'npm-project'
    try {
      const pkgContent = readFileSync(pkgPath, 'utf-8')
      const parsed = JSON.parse(pkgContent) as { name?: string }
      if (parsed.name) {
        rootName = parsed.name
      }
    } catch {
      // 读取失败时使用默认名称
    }

    // 优先调用 npm ls --json --all
    try {
      const output = execSync('npm ls --json --all', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parseNpmLsJson(output)
      return { ecosystem: 'npm', root, parser: 'tool-cli' }
    } catch (error) {
      // npm ls 在有缺失依赖时返回非零退出码但仍输出有效 JSON
      if (error instanceof Error && 'stdout' in error) {
        const stdout = (error as unknown as { stdout: string }).stdout
        if (stdout && typeof stdout === 'string') {
          try {
            const root = parseNpmLsJson(stdout)
            // 校验解析结果非空
            if (root.children.length > 0 || root.name !== 'npm-project') {
              return { ecosystem: 'npm', root, parser: 'tool-cli' }
            }
          } catch {
            // stdout 不是有效 JSON，继续降级
          }
        }
      }
    }

    // 降级：解析 package.json
    try {
      const pkgContent = readFileSync(pkgPath, 'utf-8')
      const children = parsePackageJson(pkgContent)
      return {
        ecosystem: 'npm',
        root: { name: rootName, children },
        parser: 'regex-fallback',
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      throw new Error(`npm 依赖解析失败：${message}`)
    }
  },
}
