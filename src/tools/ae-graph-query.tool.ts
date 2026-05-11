import { resolve } from 'node:path'

import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { createGraphStorage, graphDatabaseExists } from '../services/graph-storage-service.js'
import type { ActiveGraph, GraphRelation } from '../services/graph-storage-service.js'
import { isInsideRoot, toRepoRelativePath } from '../utils/path-utils.js'

type QueryMode = 'deps' | 'impact' | 'health' | 'filter' | 'path' | 'core' | 'stats' | 'pattern'

function requireRelativePath(worktree: string, input: string | undefined, name: string): string | undefined {
  if (!input) {
    return undefined
  }
  const absolute = resolve(worktree, input)
  if (!isInsideRoot(worktree, absolute)) {
    throw new Error(`${name} 路径不在当前工作区内：${input}`)
  }
  return toRepoRelativePath(worktree, absolute)
}

function normalizeScopeRoot(worktree: string, input: string | undefined): string {
  if (!input) {
    return '.'
  }
  const absolute = resolve(worktree, input)
  if (!isInsideRoot(worktree, absolute)) {
    throw new Error(`scope 路径不在当前工作区内：${input}`)
  }
  return toRepoRelativePath(worktree, absolute)
}

function isInDirectory(filePath: string, directory: string | undefined): boolean {
  if (!directory || directory === '.') {
    return true
  }
  const normalized = directory.replace(/\/$/, '')
  return filePath === normalized || filePath.startsWith(`${normalized}/`)
}

function findCycles(graph: ActiveGraph, limit: number): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const relation of graph.relations) {
    if (relation.relationType === 'external') {
      continue
    }
    adjacency.set(relation.sourcePath, [...(adjacency.get(relation.sourcePath) ?? []), relation.targetPath])
  }
  const cycles: string[][] = []
  const visit = (node: string, stack: string[]): void => {
    if (cycles.length >= limit) {
      return
    }
    const existingIndex = stack.indexOf(node)
    if (existingIndex >= 0) {
      cycles.push([...stack.slice(existingIndex), node])
      return
    }
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...stack, node])
    }
  }
  for (const file of graph.files) {
    visit(file.relativePath, [])
  }
  return cycles
}

function shortestPath(relations: GraphRelation[], source: string, target: string): string[] {
  const adjacency = new Map<string, string[]>()
  for (const relation of relations) {
    adjacency.set(relation.sourcePath, [...(adjacency.get(relation.sourcePath) ?? []), relation.targetPath])
  }
  const queue: string[][] = [[source]]
  const visited = new Set<string>([source])
  while (queue.length > 0) {
    const path = queue.shift()
    if (!path) {
      continue
    }
    const current = path[path.length - 1]
    if (current === target) {
      return path
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push([...path, next])
      }
    }
  }
  return []
}

function longPaths(relations: GraphRelation[], minLength: number, limit: number): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const relation of relations) {
    if (relation.relationType === 'external') {
      continue
    }
    adjacency.set(relation.sourcePath, [...(adjacency.get(relation.sourcePath) ?? []), relation.targetPath])
  }
  const result: string[][] = []
  const maxDepth = Math.max(minLength, 10)
  for (const source of adjacency.keys()) {
    const stack: string[][] = [[source]]
    while (stack.length > 0 && result.length < limit) {
      const path = stack.pop()
      if (!path) {
        continue
      }
      const current = path[path.length - 1]
      if (path.length >= minLength) {
        result.push(path)
        continue
      }
      if (path.length >= maxDepth) {
        continue
      }
      for (const next of adjacency.get(current) ?? []) {
        if (!path.includes(next)) {
          stack.push([...path, next])
        }
      }
    }
    if (result.length >= limit) {
      break
    }
  }
  return result
}

function impact(relations: GraphRelation[], file: string, limit: number): string[] {
  const reverse = new Map<string, string[]>()
  for (const relation of relations) {
    reverse.set(relation.targetPath, [...(reverse.get(relation.targetPath) ?? []), relation.sourcePath])
  }
  const result: string[] = []
  const queue = [file]
  const visited = new Set<string>([file])
  while (queue.length > 0 && result.length < limit) {
    const current = queue.shift()
    if (!current) {
      continue
    }
    for (const next of reverse.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        result.push(next)
        queue.push(next)
      }
    }
  }
  return result.sort((a, b) => a.localeCompare(b))
}

export const aeGraphQueryTool = tool({
  description: [
    '查询项目文件关系图谱。',
    '',
    '功能说明：',
    '- 查询单文件依赖、影响范围、健康检查、条件筛选、最短路径、核心模块和关系统计',
    '- 只读取 `docs/ae/graphs/graph.json` 的 active version，不读取构建中的半成品',
    '- 所有路径参数必须位于当前 worktree 内',
    '',
    '适用场景：',
    '- 修改文件前评估影响范围，识别循环依赖、孤立文件和核心模块',
    '',
    '不适用场景：',
    '- 不构建图谱；图谱文件不存在时请先执行 ae-graph-build。',
  ].join('\n'),
  args: {
    mode: z.enum(['deps', 'impact', 'health', 'filter', 'path', 'core', 'stats', 'pattern']).describe('查询模式。'),
    file: z.string().optional().describe('目标文件路径，deps/impact/path 模式使用。'),
    target: z.string().optional().describe('目标文件路径，path 模式使用。'),
    relation_type: z.string().optional().describe('关系类型筛选。'),
    file_type: z.string().optional().describe('文件类型筛选。'),
    directory: z.string().optional().describe('目录路径筛选。'),
    scope: z.string().optional().describe('图谱范围，需与构建 target 对应。默认当前 worktree。'),
    limit: z.number().int().positive().optional().describe('结果数量上限，默认 50。'),
    top: z.number().int().positive().optional().describe('Top N，core 模式使用，默认 10。'),
    pattern_type: z.enum(['cycle', 'long', 'all']).optional().describe('pattern 模式：cycle/long/all。'),
  },
  execute: async (args, ctx) => {
    const worktree = resolve(ctx.worktree)
    const mode = args.mode as QueryMode
    const limit = args.limit ?? 50
    if (!graphDatabaseExists(worktree)) {
      return '未找到文件关系图谱，请先执行 ae-graph-build 构建图谱。'
    }
    let storage: ReturnType<typeof createGraphStorage> | undefined
    try {
      storage = createGraphStorage(worktree, { readonly: true })
      const scopeRoot = normalizeScopeRoot(worktree, args.scope)
      const graph = storage.getActiveVersion(worktree, scopeRoot)
      if (!graph) {
        return `未找到 scope=${scopeRoot} 的文件关系图谱，请先用对应 target 执行 ae-graph-build。`
      }
      const file = requireRelativePath(worktree, args.file, 'file')
      const target = requireRelativePath(worktree, args.target, 'target')
      const directory = requireRelativePath(worktree, args.directory, 'directory')

      let result: unknown
      if (mode === 'deps') {
        if (!file) {
          return 'deps 模式必须提供 file 参数。'
        }
        result = {
          dependencies: graph.relations.filter((relation) => relation.sourcePath === file).slice(0, limit),
          dependents: graph.relations.filter((relation) => relation.targetPath === file).slice(0, limit),
        }
      } else if (mode === 'impact') {
        if (!file) {
          return 'impact 模式必须提供 file 参数。'
        }
        result = { file, impacted: impact(graph.relations, file, limit) }
      } else if (mode === 'health') {
        const related = new Set(graph.relations.flatMap((relation) => [relation.sourcePath, relation.targetPath]))
        result = {
          cycles: findCycles(graph, limit),
          isolatedFiles: graph.files.filter((fileNode) => !related.has(fileNode.relativePath)).map((fileNode) => fileNode.relativePath).slice(0, limit),
        }
      } else if (mode === 'filter') {
        result = {
          files: graph.files.filter((fileNode) => {
            return (!args.file_type || fileNode.fileType === args.file_type)
              && isInDirectory(fileNode.relativePath, directory)
          }).slice(0, limit),
          relations: graph.relations.filter((relation) => !args.relation_type || relation.relationType === args.relation_type).slice(0, limit),
        }
      } else if (mode === 'path') {
        if (!file || !target) {
          return 'path 模式必须提供 file 和 target 参数。'
        }
        result = { path: shortestPath(graph.relations, file, target) }
      } else if (mode === 'core') {
        const fileNodes = new Set(graph.files.filter((fileNode) => fileNode.fileType !== 'directory').map((fileNode) => fileNode.relativePath))
        const counts = new Map<string, number>()
        for (const relation of graph.relations) {
          if (!fileNodes.has(relation.targetPath)) {
            continue
          }
          counts.set(relation.targetPath, (counts.get(relation.targetPath) ?? 0) + 1)
        }
        result = [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, args.top ?? 10)
          .map(([path, count]) => ({ path, count }))
      } else if (mode === 'stats') {
        const stats = new Map<string, number>()
        for (const relation of graph.relations) {
          stats.set(relation.relationType, (stats.get(relation.relationType) ?? 0) + 1)
        }
        result = Object.fromEntries([...stats.entries()].sort((a, b) => a[0].localeCompare(b[0])))
      } else {
        const patternType = args.pattern_type ?? 'all'
        const cycles = patternType === 'long' ? [] : findCycles(graph, limit)
        const paths = patternType === 'cycle'
          ? []
          : longPaths(graph.relations, 6, limit)
        result = { cycles, longPaths: paths }
      }

      return JSON.stringify({ mode, scopeRoot, versionId: graph.versionId, result, tool: TOOL.AE_GRAPH_QUERY }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `文件关系图谱查询失败：${message}`
    } finally {
      storage?.closeDatabase()
    }
  },
})
