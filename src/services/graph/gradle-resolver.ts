import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** gradle dependencies 输出行正则：缩进 + group:name:version */
const GRADLE_DEP_LINE_REGEX = /^([+|\\`\-─━├└┘┃ ]*)([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+):([^\s]+)/

/**
 * 解析 gradle dependencies 输出为 DependencyNode 树
 * 纯函数，便于测试
 *
 * gradle dependencies 每行格式：[缩进]group:name:version
 * 缩进用 +---、|、\\--- 等字符表示层级
 * ASCII 格式每层5字符（+--- ），Unicode 格式每层4字符（├── ）
 * 使用缩进中非空格字符数估算深度
 */
export function parseGradleDependenciesOutput(output: string): DependencyNode {
  const root: DependencyNode = { name: 'gradle-project', children: [] }
  // 预置 root 到栈中，首行匹配项作为 root 子节点
  const stack: Array<{ node: DependencyNode; depth: number }> = [{ node: root, depth: -1 }]

  for (const line of output.split('\n')) {
    const match = GRADLE_DEP_LINE_REGEX.exec(line)
    if (!match) {
      continue
    }

    const [, prefix, group, artifact, version] = match
    const name = `${group}:${artifact}`
    const prefixLen = prefix.length
    // 无缩进的首行作为 depth 0（root 的直接子节点）
    if (prefixLen === 0) {
      const current: DependencyNode = { name, version, scope: group, children: [] }
      root.children.push(current)
      stack.length = 1
      stack.push({ node: current, depth: 0 })
      continue
    }
    // ASCII 格式：每层5字符（+--- ），Unicode 格式：每层4字符（├── ）
    const depthByAscii = Math.round(prefixLen / 5)
    const depthByUnicode = Math.round(prefixLen / 4)
    const depth = Math.min(depthByAscii, depthByUnicode) || 1
    const current: DependencyNode = { name, version, scope: group, children: [] }

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

/** build.gradle dependencies 行正则：implementation 'group:name:version' */
const GRADLE_IMPL_REGEX = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^:]+):([^:]+):([^'"]+)['"]/

/** build.gradle.kts dependencies 行正则：implementation("group:name:version") */
const GRADLE_KTS_IMPL_REGEX = /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s*\(\s*"([^:]+):([^:]+):([^"]+)"\s*\)/

/**
 * 解析 build.gradle / build.gradle.kts 内容提取直接依赖
 * 纯函数，便于测试
 */
export function parseBuildGradle(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []

  for (const line of content.split('\n')) {
    // Groovy 格式
    const groovyMatch = GRADLE_IMPL_REGEX.exec(line)
    if (groovyMatch) {
      const [, group, artifact, version] = groovyMatch
      deps.push({ name: `${group}:${artifact}`, version, scope: group, children: [] })
      continue
    }

    // Kotlin DSL 格式
    const ktsMatch = GRADLE_KTS_IMPL_REGEX.exec(line)
    if (ktsMatch) {
      const [, group, artifact, version] = ktsMatch
      deps.push({ name: `${group}:${artifact}`, version, scope: group, children: [] })
    }
  }

  return deps
}

/** gradle 依赖解析器 */
export const gradleResolver: DependencyResolver = {
  ecosystem: 'gradle',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'build.gradle'))
      || existsSync(join(worktree, 'build.gradle.kts'))
  },

  async resolve(worktree: string, timeout: number = 60000): Promise<DependencyTree> {
    // 优先调用 gradle dependencies
    try {
      const output = execSync('gradle dependencies', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parseGradleDependenciesOutput(output)
      return { ecosystem: 'gradle', root, parser: 'tool-cli' }
    } catch {
      // 命令失败时降级
    }

    // 降级：正则解析 build.gradle / build.gradle.kts
    const gradlePath = join(worktree, 'build.gradle')
    const ktsPath = join(worktree, 'build.gradle.kts')
    const filePath = existsSync(ktsPath) ? ktsPath : gradlePath

    try {
      const content = readFileSync(filePath, 'utf-8')
      const children = parseBuildGradle(content)
      return {
        ecosystem: 'gradle',
        root: { name: 'gradle-project', children },
        parser: 'regex-fallback',
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      throw new Error(`gradle 依赖解析失败：${message}`)
    }
  },
}
