import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import stripJsonComments from 'strip-json-comments'

export interface GraphConfig {
  exclude: string[]
}

interface AeProjectConfig {
  graph?: {
    exclude?: unknown
  }
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function resolveGraphConfigPath(worktree: string): string {
  return join(worktree, '.opencode', 'ae.jsonc')
}

function readProjectConfig(configPath: string): AeProjectConfig {
  if (!existsSync(configPath)) {
    return {}
  }

  const raw = readFileSync(configPath, 'utf8')
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(raw))
    if (!isRecord(parsed)) {
      throw new Error('配置必须是 JSON 对象')
    }
    return parsed as AeProjectConfig
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`项目级 ae.jsonc 解析失败：${message}`)
  }
}

export function loadGraphConfig(worktree: string): GraphConfig {
  const config = readProjectConfig(resolveGraphConfigPath(worktree))
  const exclude = config.graph?.exclude
  if (exclude === undefined) {
    return { exclude: [] }
  }
  if (!Array.isArray(exclude) || !exclude.every((item) => typeof item === 'string')) {
    throw new Error('graph.exclude 必须是字符串数组')
  }
  return { exclude: [...new Set(exclude)] }
}

export function saveGraphExcludeRule(worktree: string, rule: string): GraphConfig {
  const configPath = resolveGraphConfigPath(worktree)
  const config = readProjectConfig(configPath)
  const currentGraph = isRecord(config.graph) ? config.graph : {}
  const currentExclude = Array.isArray(currentGraph.exclude)
    ? currentGraph.exclude.filter((item): item is string => typeof item === 'string')
    : []
  const nextExclude = [...new Set([...currentExclude, rule])].sort((a, b) => a.localeCompare(b))
  const nextConfig: AeProjectConfig = {
    ...config,
    graph: {
      ...currentGraph,
      exclude: nextExclude,
    },
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`)
  return { exclude: nextExclude }
}
