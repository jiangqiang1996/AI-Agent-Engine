import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import stripJsonComments from 'strip-json-comments'

import { isRegularFile } from '../utils/path-utils.js'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getOpencodeGlobalConfigDir } from './opencode-path-service.js'

type McpConfig = NonNullable<Config['mcp']>
export type ModelScenariosConfig = Record<string, string>
export type BrainstormConfig = string[]
export type BuiltinOpencodeConfigLayerName = '插件内置' | '全局' | '项目级'

export interface ModelScenarioSource {
  scenario: string
  model: string
  layer: BuiltinOpencodeConfigLayerName
  path: string
}

export interface BuiltinOpencodeConfig {
  $schema?: string
  mcp?: McpConfig
  modelScenarios?: ModelScenariosConfig
  brainstorm?: BrainstormConfig
  [key: string]: unknown
}

export interface BuiltinOpencodeConfigPaths {
  projectConfigFile: string
  globalConfigFile: string
  builtinConfigFile: string
}

export interface ConfigLayer {
  label: BuiltinOpencodeConfigLayerName
  path: string
  required: boolean
  allowNewMcpEntries: boolean
}

interface LoadedConfigLayer extends ConfigLayer {
  config: BuiltinOpencodeConfig
}

export interface EffectiveConfigValue {
  key: string
  value: unknown
  layer: BuiltinOpencodeConfigLayerName
  path: string
}

export interface EffectiveConfigPropertyValue {
  value: unknown
  layer: BuiltinOpencodeConfigLayerName
  path: string
}

const MIN_MCP_TIMEOUT_MS = 1000
const MAX_MCP_TIMEOUT_MS = 120000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateMcpTimeout(name: string, timeout: unknown): void {
  if (
    typeof timeout !== 'number'
      || !Number.isInteger(timeout)
      || timeout < MIN_MCP_TIMEOUT_MS
      || timeout > MAX_MCP_TIMEOUT_MS
  ) {
    throw new Error(
      `builtin-opencode MCP "${name}" 的 timeout 必须是 ${MIN_MCP_TIMEOUT_MS}-${MAX_MCP_TIMEOUT_MS} 之间的整数毫秒`,
    )
  }
}

function validateRemoteMcpUrl(name: string, url: unknown): void {
  if (typeof url !== 'string' || url.trim().length === 0) {
    throw new Error(`builtin-opencode remote MCP "${name}" 必须声明 url`)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`builtin-opencode remote MCP "${name}" 的 url 必须是有效 URL`)
  }

  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error(`builtin-opencode remote MCP "${name}" 的 url 只允许 http 或 https 协议`)
  }

  if (parsed.username || parsed.password) {
    throw new Error(`builtin-opencode remote MCP "${name}" 的 url 不能包含内嵌凭证`)
  }

}

function readBuiltinOpencodeConfigLayer(layer: ConfigLayer): BuiltinOpencodeConfig | undefined {
  if (!isRegularFile(layer.path)) {
    if (layer.required) {
      throw new Error(`${layer.label} builtin-opencode 配置文件不存在: ${layer.path}`)
    }
    return undefined
  }

  const raw = readFileSync(layer.path, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(raw))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${layer.label} builtin-opencode 配置解析失败: ${layer.path} (${message})`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`${layer.label} builtin-opencode 配置必须是 JSON 对象: ${layer.path}`)
  }

  return parsed as BuiltinOpencodeConfig
}

function getBuiltinOpencodeConfigLayers(paths: BuiltinOpencodeConfigPaths): ConfigLayer[] {
  return [
    { label: '插件内置', path: paths.builtinConfigFile, required: true, allowNewMcpEntries: true },
    { label: '全局', path: paths.globalConfigFile, required: false, allowNewMcpEntries: true },
    { label: '项目级', path: paths.projectConfigFile, required: false, allowNewMcpEntries: true },
  ]
}

function readBuiltinOpencodeConfigLayers(paths: BuiltinOpencodeConfigPaths): LoadedConfigLayer[] {
  return getBuiltinOpencodeConfigLayers(paths).flatMap((layer) => {
    const config = readBuiltinOpencodeConfigLayer(layer)
    return config ? [{ ...layer, config }] : []
  })
}

function getConfigValueAtPath(config: BuiltinOpencodeConfig, propertyPath: string[]): unknown {
  let value: unknown = config
  for (const propertyName of propertyPath) {
    if (!isRecord(value)) {
      return undefined
    }
    value = value[propertyName]
  }
  return value
}

function mergeMcpEntry(lowPriority: unknown, highPriority: unknown): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    return highPriority
  }

  if ('type' in highPriority && lowPriority.type !== highPriority.type) {
    return highPriority
  }

  return mergeConfigObject(lowPriority, highPriority, false, true)
}

function normalizeNewMcpEntry(entry: unknown): unknown {
  if (!isRecord(entry) || 'type' in entry) {
    return entry
  }

  if ('url' in entry && !('command' in entry)) {
    return { type: 'remote', ...entry }
  }

  if ('command' in entry && !('url' in entry)) {
    return { type: 'local', ...entry }
  }

  return entry
}

function mergeMcpConfig(
  lowPriority: unknown,
  highPriority: unknown,
  allowNewEntries: boolean,
): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    return highPriority
  }

  const merged: Record<string, unknown> = { ...lowPriority }
  for (const [name, highPriorityEntry] of Object.entries(highPriority)) {
    if (name in merged) {
      merged[name] = mergeMcpEntry(merged[name], highPriorityEntry)
    } else if (allowNewEntries) {
      merged[name] = normalizeNewMcpEntry(highPriorityEntry)
    } else {
      throw new Error(`项目级 builtin-opencode 配置不能新增 MCP "${name}"，只能覆盖已有内置或全局 MCP`)
    }
  }
  return merged
}

function mergeModelScenariosConfig(lowPriority: unknown, highPriority: unknown): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    return highPriority
  }

  return { ...lowPriority, ...highPriority }
}

function mergeConfigObject(
  lowPriority: Record<string, unknown>,
  highPriority: Record<string, unknown>,
  mergeTopLevelMcp: boolean,
  allowNewMcpEntries: boolean,
): BuiltinOpencodeConfig {
  const merged: Record<string, unknown> = { ...lowPriority }

  for (const [key, highPriorityValue] of Object.entries(highPriority)) {
    const lowPriorityValue = merged[key]
    if (mergeTopLevelMcp && key === 'mcp') {
      merged[key] = mergeMcpConfig(lowPriorityValue, highPriorityValue, allowNewMcpEntries)
    } else if (mergeTopLevelMcp && key === 'modelScenarios') {
      merged[key] = mergeModelScenariosConfig(lowPriorityValue, highPriorityValue)
    } else if (mergeTopLevelMcp && key === 'brainstorm') {
      merged[key] = highPriorityValue
    } else if (isRecord(lowPriorityValue) && isRecord(highPriorityValue)) {
      merged[key] = mergeConfigObject(lowPriorityValue, highPriorityValue, false, allowNewMcpEntries)
    } else {
      merged[key] = highPriorityValue
    }
  }

  return merged as BuiltinOpencodeConfig
}

export function mergeBuiltinOpencodeConfig(
  lowPriority: Record<string, unknown>,
  highPriority: Record<string, unknown>,
  options: { allowNewMcpEntries?: boolean } = {},
): BuiltinOpencodeConfig {
  return mergeConfigObject(
    lowPriority,
    highPriority,
    true,
    options.allowNewMcpEntries ?? true,
  )
}

function validateMcpConfig(config: BuiltinOpencodeConfig): void {
  if (!isRecord(config.mcp)) {
    return
  }

  for (const [name, entry] of Object.entries(config.mcp)) {
    if (!isRecord(entry)) {
      throw new Error(`builtin-opencode MCP "${name}" 必须是 JSON 对象`)
    }

    if ('enabled' in entry && typeof entry.enabled !== 'boolean') {
      throw new Error(`builtin-opencode MCP "${name}" 的 enabled 必须是 boolean`)
    }

    if ('timeout' in entry) {
      validateMcpTimeout(name, entry.timeout)
    }

    if (entry.type === 'remote') {
      validateRemoteMcpUrl(name, entry.url)
      continue
    }

    if (entry.type === 'local') {
      if (!Array.isArray(entry.command) || !entry.command.every((item) => typeof item === 'string') || entry.command.length === 0) {
        throw new Error(`builtin-opencode local MCP "${name}" 必须声明 command`)
      }
      continue
    }

    throw new Error(`builtin-opencode MCP "${name}" 必须声明有效 type`)
  }
}

function validateModelScenariosConfig(config: BuiltinOpencodeConfig, label = 'builtin-opencode'): void {
  if (!('modelScenarios' in config)) {
    return
  }

  if (!isRecord(config.modelScenarios)) {
    throw new Error(`${label} modelScenarios 必须是 JSON 对象`)
  }

  for (const [scenario, model] of Object.entries(config.modelScenarios)) {
    if (typeof model !== 'string' || model.trim().length === 0 || model !== model.trim()) {
      throw new Error(`${label} modelScenarios.${scenario} 必须是非空字符串模型标识`)
    }
  }
}

function validateBrainstormConfig(config: BuiltinOpencodeConfig, label = 'builtin-opencode'): void {
  if (!('brainstorm' in config)) return

  const brainstorm = config.brainstorm
  if (!Array.isArray(brainstorm)) {
    throw new Error(`${label} brainstorm 必须是字符串数组`)
  }

  if (brainstorm.length < 1 || brainstorm.length > 3) {
    throw new Error(`${label} brainstorm 必须包含 1-3 个模型`)
  }

  for (const model of brainstorm) {
    if (typeof model !== 'string' || model !== model.trim() || !/^[^/]+\/[^/]+$/.test(model)) {
      throw new Error(`${label} brainstorm 每项必须是 "provider/model" 格式，且 provider 和 model 均非空`)
    }
  }
}

export function resolveBuiltinOpencodeConfigPaths(
  manifest: RuntimeAssetManifest,
  worktree: string,
): BuiltinOpencodeConfigPaths {
  return {
    projectConfigFile: join(worktree, '.opencode', 'ae.jsonc'),
    globalConfigFile: join(getOpencodeGlobalConfigDir(), 'ae.jsonc'),
    builtinConfigFile: manifest.builtinConfigFile,
  }
}

export function loadBuiltinOpencodeConfig(paths: BuiltinOpencodeConfigPaths): BuiltinOpencodeConfig {
  const config = readBuiltinOpencodeConfigLayers(paths).reduce<BuiltinOpencodeConfig>((merged, layer) => {
    return mergeBuiltinOpencodeConfig(merged, layer.config, {
      allowNewMcpEntries: layer.allowNewMcpEntries,
    })
  }, {})
  validateMcpConfig(config)
  validateModelScenariosConfig(config)
  validateBrainstormConfig(config)
  return config
}

export function collectEffectiveConfigObjectEntries(
  paths: BuiltinOpencodeConfigPaths,
  propertyName: string,
  validateLayerConfig?: (config: BuiltinOpencodeConfig, layer: ConfigLayer) => void,
): Map<string, EffectiveConfigValue> {
  const entries = new Map<string, EffectiveConfigValue>()

  for (const layer of readBuiltinOpencodeConfigLayers(paths)) {
    validateLayerConfig?.(layer.config, layer)
    const propertyValue = layer.config[propertyName]
    if (!isRecord(propertyValue)) {
      continue
    }

    for (const [key, value] of Object.entries(propertyValue)) {
      entries.set(key, { key, value, layer: layer.label, path: layer.path })
    }
  }

  return entries
}

export function resolveEffectiveConfigProperty(
  paths: BuiltinOpencodeConfigPaths,
  propertyPath: string[],
  validateLayerConfig?: (config: BuiltinOpencodeConfig, layer: ConfigLayer) => void,
): EffectiveConfigPropertyValue | undefined {
  let effective: EffectiveConfigPropertyValue | undefined

  for (const layer of readBuiltinOpencodeConfigLayers(paths)) {
    validateLayerConfig?.(layer.config, layer)
    const value = getConfigValueAtPath(layer.config, propertyPath)
    if (value !== undefined) {
      effective = { value, layer: layer.label, path: layer.path }
    }
  }

  return effective
}

export function collectModelScenarioSources(paths: BuiltinOpencodeConfigPaths): Map<string, ModelScenarioSource> {
  const sources = new Map<string, ModelScenarioSource>()

  for (const [scenario, entry] of collectEffectiveConfigObjectEntries(
    paths,
    'modelScenarios',
    (config, layer) => validateModelScenariosConfig(config, `${layer.label} builtin-opencode 配置`),
  )) {
    sources.set(scenario, { scenario, model: entry.value as string, layer: entry.layer, path: entry.path })
  }

  return sources
}

export function collectBrainstormSources(
  paths: BuiltinOpencodeConfigPaths,
): BrainstormConfig | undefined {
  const effective = resolveEffectiveConfigProperty(
    paths,
    ['brainstorm'],
    (config, layer) => validateBrainstormConfig(config, `${layer.label} builtin-opencode 配置`),
  )
  if (!effective) return undefined
  return effective.value as BrainstormConfig
}

export function loadBuiltinMcpConfigFromPaths(paths: BuiltinOpencodeConfigPaths): McpConfig {
  return loadBuiltinOpencodeConfig(paths).mcp ?? {}
}
