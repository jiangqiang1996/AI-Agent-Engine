import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import stripJsonComments from 'strip-json-comments'

import {
  resolveBuiltinOpencodeConfigPaths,
  type BuiltinOpencodeConfig,
  type BuiltinOpencodeConfigPaths,
  type ConfigLayer,
} from './builtin-opencode-config-service.js'
import { createRuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

export interface GraphConfig {
  exclude: string[]
}

interface GraphExcludeRule {
  pattern: string
  negated: boolean
  directoryOnly: boolean
  anchored: boolean
  hasSlash: boolean
  regex: RegExp
}

export interface GraphExcludeMatchResult {
  excluded: boolean
  matchedRule?: string
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

function readGraphConfigLayer(path: string, label: ConfigLayer['label'], required: boolean): BuiltinOpencodeConfig | undefined {
  if (!existsSync(path)) {
    if (required) {
      throw new Error(`${label} ae.jsonc 不存在：${path}`)
    }
    return undefined
  }

  const raw = readFileSync(path, 'utf8')
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(raw))
    if (!isRecord(parsed)) {
      throw new Error('配置必须是 JSON 对象')
    }
    return parsed as BuiltinOpencodeConfig
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} ae.jsonc 解析失败：${message}`)
  }
}

function graphConfigLayers(paths: BuiltinOpencodeConfigPaths): ConfigLayer[] {
  return [
    { label: '插件内置', path: paths.builtinConfigFile, required: true, allowNewMcpEntries: true },
    { label: '全局', path: paths.globalConfigFile, required: false, allowNewMcpEntries: true },
    { label: '项目级', path: paths.projectConfigFile, required: false, allowNewMcpEntries: true },
  ]
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
  const exclude: string[] = []
  for (const layer of graphConfigLayers(paths)) {
    const config = readGraphConfigLayer(layer.path, layer.label, layer.required)
    if (!config) {
      continue
    }
    validateGraphExcludeConfig(config, layer)
    if (isRecord(config.graph) && Array.isArray(config.graph.exclude)) {
      exclude.push(...config.graph.exclude)
    }
  }
  return { exclude: [...new Set(exclude)] }
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

function globSegmentToRegex(pattern: string): string {
  let regex = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        regex += '.*'
        index += 1
      } else {
        regex += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      regex += '[^/]'
      continue
    }
    regex += escapeRegex(char)
  }
  return regex
}

function parseGraphExcludeRule(rawRule: string): GraphExcludeRule | undefined {
  let rule = toPosixPath(rawRule.trim())
  if (!rule || rule === '!') {
    return undefined
  }

  const negated = rule.startsWith('!')
  if (negated) {
    rule = rule.slice(1).trim()
  }
  if (!rule) {
    return undefined
  }

  const directoryOnly = rule.endsWith('/')
  rule = rule.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rule) {
    return undefined
  }

  const anchored = rawRule.trim().replace(/^!/, '').startsWith('/')
  const hasSlash = rule.includes('/')
  const pattern = rule.startsWith('**/') ? `(?:.*/)?${globSegmentToRegex(rule.slice(3))}` : globSegmentToRegex(rule)
  const body = anchored || hasSlash ? pattern : `(?:^|.*/)${pattern}`
  const regex = new RegExp(`^${body}(?:/.*)?$`)

  return { pattern: rawRule, negated, directoryOnly, anchored, hasSlash, regex }
}

export function matchGraphExcludePath(relativePath: string, rules: string[], isDirectory = false): GraphExcludeMatchResult {
  const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '').replace(/\/+$/, '')
  let result: GraphExcludeMatchResult = { excluded: false }

  for (const rawRule of rules) {
    const rule = parseGraphExcludeRule(rawRule)
    if (!rule || (rule.directoryOnly && !isDirectory && !normalizedPath.includes('/'))) {
      continue
    }
    if (!rule.regex.test(normalizedPath)) {
      continue
    }
    result = rule.negated ? { excluded: false, matchedRule: rawRule } : { excluded: true, matchedRule: rawRule }
  }

  return result
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
