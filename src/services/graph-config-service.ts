import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import stripJsonComments from 'strip-json-comments'

import {
  resolveBuiltinOpencodeConfigPaths,
  resolveEffectiveConfigProperty,
  type BuiltinOpencodeConfig,
  type ConfigLayer,
} from './builtin-opencode-config-service.js'
import { createRuntimeAssetManifest } from './runtime-asset-manifest.js'

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

function validateGraphExcludeConfig(config: BuiltinOpencodeConfig, layer: ConfigLayer): void {
  if (!isRecord(config.graph) || config.graph.exclude === undefined) {
    return
  }
  if (!Array.isArray(config.graph.exclude) || !config.graph.exclude.every((item) => typeof item === 'string')) {
    throw new Error(`${layer.label} ae.jsonc graph.exclude 必须是字符串数组`)
  }
}

export function loadGraphConfig(worktree: string, builtinConfigFile = createRuntimeAssetManifest(import.meta.url).builtinConfigFile): GraphConfig {
  const paths = resolveBuiltinOpencodeConfigPaths({ ...createRuntimeAssetManifest(import.meta.url), builtinConfigFile }, worktree)
  const effectiveExclude = resolveEffectiveConfigProperty(paths, ['graph', 'exclude'], validateGraphExcludeConfig)
  if (effectiveExclude === undefined) {
    return { exclude: [] }
  }
  return { exclude: [...new Set(effectiveExclude.value as string[])] }
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
