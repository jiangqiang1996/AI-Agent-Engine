import { resolve } from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { executeGraphQuery } from '../services/graph-query-service.js'
import { graphDatabaseExists } from '../services/graph-storage-service.js'
import { evaluateGraphFreshnessBasis } from '../services/graph-freshness-service.js'
import { loadGraphConfig } from '../services/graph-config-service.js'
import { appendGraphUsageRecord } from '../services/graph-usage-logger.js'
import { isInsideRoot, resolvePathWithBase, toRepoRelativePath } from '../utils/path-utils.js'

type QueryMode = 'deps' | 'impact' | 'health' | 'filter' | 'path' | 'core' | 'stats' | 'pattern'

function requireRelativePath(worktree: string, baseDirectory: string, input: string | undefined, name: string): string | undefined {
  if (!input) {
    return undefined
  }
  const absolute = resolvePathWithBase(baseDirectory, input)
  if (!isInsideRoot(worktree, absolute)) {
    throw new Error(`${name} 路径不在当前工作区内：${input}`)
  }
  return toRepoRelativePath(worktree, absolute)
}

function normalizeScopeRoot(worktree: string, baseDirectory: string, input: string | undefined): string {
  if (!input) {
    return '.'
  }
  const absolute = resolvePathWithBase(baseDirectory, input)
  if (!isInsideRoot(worktree, absolute)) {
    throw new Error(`scope 路径不在当前工作区内：${input}`)
  }
  return toRepoRelativePath(worktree, absolute)
}

export const aeGraphQueryTool = tool({
  description: [
    '查询项目文件关系图谱。',
    '',
    '功能说明：',
    '- 查询单文件依赖、影响范围、健康检查、条件筛选、最短路径、核心模块和关系统计',
    '- 读取 `ae/graphs/graph.json` 的 active version、manifest、索引和必要分片，返回 scope、diagnostic、freshness 和截断信息',
    '- freshness 非 fresh 时，图谱结果只能作为定位线索，不能单独作为无影响、无依赖或完整覆盖结论',
    '- 所有路径参数必须位于当前 worktree 内',
    '',
    '适用场景：',
    '- 修改文件前评估影响范围，识别循环依赖、孤立文件和核心模块',
    '- 图谱不可用、scope 不匹配或分片损坏时获取可恢复诊断',
    '',
    '不适用场景：',
    '- 不构建图谱；图谱文件不存在时请先执行 ae-graph-build。',
  ].join('\n'),
  args: {
    mode: z.enum(['deps', 'impact', 'health', 'filter', 'path', 'core', 'stats', 'pattern']).describe('查询模式。'),
    file: z.string().optional().describe('目标文件路径，deps/impact/path 模式使用，支持绝对路径或相对路径。'),
    target: z.string().optional().describe('目标文件路径，path 模式使用，支持绝对路径或相对路径。'),
    relation_type: z.string().optional().describe('关系类型筛选。'),
    file_type: z.string().optional().describe('文件类型筛选。'),
    directory: z.string().optional().describe('目录路径筛选，支持绝对路径或相对路径。'),
    scope: z.string().optional().describe('图谱范围，需与构建 target 对应；省略时使用工作区根目录图谱。'),
    exclude: z.array(z.string()).optional().describe('查询时额外排除的路径集合，仅影响结果过滤，不修改图谱。'),
    limit: z.number().int().positive().optional().describe('结果数量上限，默认 50，服务端会限制最大输出体积。'),
    top: z.number().int().positive().optional().describe('Top N，core 模式使用，默认 10。'),
    pattern_type: z.enum(['cycle', 'long', 'all']).optional().describe('pattern 模式：cycle/long/all。'),
  },
  execute: async (args, ctx) => {
    const startedAt = Date.now()
    const worktree = resolve(ctx.worktree)
    const baseDirectory = resolve(ctx.directory ?? ctx.worktree)
    const mode = args.mode as QueryMode
    if (!graphDatabaseExists(worktree)) {
      appendGraphUsageRecord(worktree, {
        tool: 'ae-graph-query',
        queryMode: mode,
        resultStatus: 'not_found',
        elapsedMs: Date.now() - startedAt,
      })
      return '未找到文件关系图谱，请先执行 ae-graph-build 构建图谱。'
    }
    try {
      const scopeRoot = args.scope ? normalizeScopeRoot(worktree, baseDirectory, args.scope) : '.'
      const file = requireRelativePath(worktree, baseDirectory, args.file, 'file')
      const target = requireRelativePath(worktree, baseDirectory, args.target, 'target')
      const directory = requireRelativePath(worktree, baseDirectory, args.directory, 'directory')
      const excluded = (args.exclude ?? []).map((item) => requireRelativePath(worktree, baseDirectory, item, 'exclude')).filter((item): item is string => !!item)
      const result = executeGraphQuery({
        worktree,
        mode,
        scopeRoot,
        file,
        target,
        directory,
        relationType: args.relation_type,
        fileType: args.file_type,
        exclude: excluded,
        limit: args.limit,
        top: args.top,
        patternType: args.pattern_type,
      })
      const freshnessStatus = (result as { freshness?: { status?: string } }).freshness?.status
      const resultStatus = (result as { status?: string }).status === 'diagnostic' ? 'diagnostic' : 'success'
      appendGraphUsageRecord(worktree, {
        tool: 'ae-graph-query',
        queryMode: mode,
        scopeRoot,
        targetFile: file ?? target,
        freshnessStatus,
        resultStatus,
        resultSize: JSON.stringify(result).length,
        elapsedMs: Date.now() - startedAt,
      })
      return JSON.stringify({ ...result as Record<string, unknown>, tool: TOOL.AE_GRAPH_QUERY }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const resultStatus = error instanceof SyntaxError ? 'diagnostic' : 'error'
      appendGraphUsageRecord(worktree, {
        tool: 'ae-graph-query',
        queryMode: mode,
        resultStatus,
        elapsedMs: Date.now() - startedAt,
      })
      if (error instanceof SyntaxError) {
        return JSON.stringify({
          status: 'diagnostic',
          diagnostic: {
            code: 'invalid_json',
            message: '图谱存储 JSON 无法解析。',
            scopeRoot: '.',
            recoverBy: '请重新执行 ae-graph-build 重建图谱存储。',
            availableScopes: [],
            canUsePartialData: false,
          },
          tool: TOOL.AE_GRAPH_QUERY,
        }, null, 2)
      }
      return `文件关系图谱查询失败：${message}`
    }
  },
})
