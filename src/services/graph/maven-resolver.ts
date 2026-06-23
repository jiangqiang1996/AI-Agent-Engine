import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

import type { DependencyResolver, DependencyNode, DependencyTree } from './dependency-resolver.js'
import { extractErrorMessage } from '../graph-storage-utils.js'

/** Maven 树形输出行的正则：[INFO] +- groupId:artifactId:type:version:scope */
const MAVEN_TREE_LINE_REGEX =
  /^\[INFO\]\s+([+\\| -]+)\s*([\w.-]+):([\w.-]+):([\w.-]+):([\w.-]+):([\w.-]+)/

/** pom.xml 中 dependency 块的正则 */
const POM_DEP_BLOCK_REGEX = /<dependency>([\s\S]*?)<\/dependency>/g
const POM_GROUP_ID_REGEX = /<groupId>([\w.-]+)<\/groupId>/
const POM_ARTIFACT_ID_REGEX = /<artifactId>([\w.-]+)<\/artifactId>/
const POM_VERSION_REGEX = /<version>([\w.-]+)<\/version>/
const POM_SCOPE_REGEX = /<scope>([\w.-]+)<\/scope>/

/**
 * 计算缩进深度
 * Maven 树每 3 个字符为一组："+- "、"\- "、"|  "
 * 深度 = 组数（+- 算第 1 层，|  +- 算第 2 层）
 */
function computeDepth(indent: string): number {
  const trimmed = indent.trimEnd()
  if (trimmed.length === 0) {
    return 0
  }
  return Math.round(trimmed.length / 3)
}

/**
 * 解析 Maven dependency:tree 的文本输出为 DependencyNode 列表
 * 纯函数，便于测试
 */
export function parseMavenTreeOutput(output: string, rootName: string): DependencyNode {
  const root: DependencyNode = { name: rootName, children: [] }
  const stack: DependencyNode[] = [root]

  for (const line of output.split('\n')) {
    // 跳过 omitted for conflict 行
    if (line.includes('(omitted for conflict') || line.includes('(omitted for duplicate')) {
      continue
    }

    const match = MAVEN_TREE_LINE_REGEX.exec(line)
    if (!match) {
      continue
    }

    const [, indent, groupId, artifactId, , version, scope] = match
    const depth = computeDepth(indent)
    const node: DependencyNode = {
      name: `${groupId}:${artifactId}`,
      version,
      scope,
      children: [],
    }

    // 回溯到正确的父节点
    while (stack.length > depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(node)
    }
    stack.push(node)
  }

  return root
}

/**
 * 解析 pom.xml 内容提取直接依赖
 * 纯函数，便于测试；不递归传递依赖
 */
export function parsePomXml(content: string): DependencyNode[] {
  const deps: DependencyNode[] = []
  let match: RegExpExecArray | null

  // 重置正则 lastIndex
  POM_DEP_BLOCK_REGEX.lastIndex = 0
  while ((match = POM_DEP_BLOCK_REGEX.exec(content)) !== null) {
    const block = match[1] ?? ''
    const groupId = POM_GROUP_ID_REGEX.exec(block)?.[1]
    const artifactId = POM_ARTIFACT_ID_REGEX.exec(block)?.[1]
    if (!groupId || !artifactId) {
      continue
    }
    const version = POM_VERSION_REGEX.exec(block)?.[1]
    const scope = POM_SCOPE_REGEX.exec(block)?.[1]
    deps.push({
      name: `${groupId}:${artifactId}`,
      version,
      scope: scope ?? 'compile',
      children: [],
    })
  }

  return deps
}

/** Maven 依赖解析器 */
export const mavenResolver: DependencyResolver = {
  ecosystem: 'maven',

  detect(worktree: string): boolean {
    return existsSync(join(worktree, 'pom.xml'))
  },

  async resolve(worktree: string, timeout: number = 60000): Promise<DependencyTree> {
    const pomPath = join(worktree, 'pom.xml')

    // 尝试从 pom.xml 提取项目坐标作为根名称
    let rootName = 'maven-project'
    try {
      const pomContent = readFileSync(pomPath, 'utf-8')
      const artifactIdMatch = /<artifactId>([\w.-]+)<\/artifactId>/.exec(pomContent)
      if (artifactIdMatch?.[1]) {
        const groupIdMatch = /<groupId>([\w.-]+)<\/groupId>/.exec(pomContent)
        rootName = groupIdMatch?.[1]
          ? `${groupIdMatch[1]}:${artifactIdMatch[1]}`
          : artifactIdMatch[1]
      }
    } catch {
      // 读取失败时使用默认名称
    }

    // 优先调用 mvn dependency:tree
    try {
      const output = execSync('mvn dependency:tree -DoutputType=text', {
        cwd: worktree,
        timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const root = parseMavenTreeOutput(output, rootName)
      return { ecosystem: 'maven', root, parser: 'tool-cli' }
    } catch {
      // 命令失败时降级为正则解析 pom.xml
    }

    // 降级：正则解析 pom.xml
    try {
      const pomContent = readFileSync(pomPath, 'utf-8')
      const children = parsePomXml(pomContent)
      return {
        ecosystem: 'maven',
        root: { name: rootName, children },
        parser: 'regex-fallback',
      }
    } catch (error) {
      const message = extractErrorMessage(error)
      throw new Error(`Maven 依赖解析失败：${message}`)
    }
  },
}
