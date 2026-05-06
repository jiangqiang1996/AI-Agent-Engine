import { existsSync, readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import stripJsonComments from 'strip-json-comments'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

type McpConfig = NonNullable<Config['mcp']>
export type ModelScenariosConfig = Record<string, string>
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
  [key: string]: unknown
}

export interface BuiltinOpencodeConfigPaths {
  projectConfigFile: string
  globalConfigFile: string
  builtinConfigFile: string
}

interface ConfigLayer {
  label: BuiltinOpencodeConfigLayerName
  path: string
  required: boolean
  allowNewMcpEntries: boolean
  projectMcpOverlay: boolean
}

const PROJECT_MCP_OVERLAY_KEYS = new Set(['enabled', 'timeout'])
const MIN_MCP_TIMEOUT_MS = 1000
const MAX_MCP_TIMEOUT_MS = 120000
const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipv4ToNumber('0.0.0.0'), 8],
  [ipv4ToNumber('10.0.0.0'), 8],
  [ipv4ToNumber('127.0.0.0'), 8],
  [ipv4ToNumber('169.254.0.0'), 16],
  [ipv4ToNumber('172.16.0.0'), 12],
  [ipv4ToNumber('192.168.0.0'), 16],
  [ipv4ToNumber('100.64.0.0'), 10],
  [ipv4ToNumber('198.18.0.0'), 15],
]

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

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function isBlockedIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const value = ipv4ToNumber(hostname)
  return BLOCKED_IPV4_RANGES.some(([range, bits]) => {
    const mask = (0xffffffff << (32 - bits)) >>> 0
    return (value & mask) === (range & mask)
  })
}

function normalizeIPv4MappedIPv6(hostname: string): string | undefined {
  const dottedMatch = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(hostname)
  if (dottedMatch) {
    return dottedMatch[1]
  }

  const hexMatch = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(hostname)
  if (!hexMatch) {
    return undefined
  }

  const high = Number.parseInt(hexMatch[1] ?? '', 16)
  const low = Number.parseInt(hexMatch[2] ?? '', 16)
  if (!Number.isInteger(high) || !Number.isInteger(low) || high > 0xffff || low > 0xffff) {
    return undefined
  }

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}

function isLinkLocalIPv6(hostname: string): boolean {
  const firstGroup = hostname.split(':')[0]
  if (!firstGroup) {
    return false
  }

  const value = Number.parseInt(firstGroup, 16)
  return Number.isInteger(value) && value >= 0xfe80 && value <= 0xfebf
}

function isDangerousHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)]$/, '$1').replace(/\.+$/, '')
  if (['localhost', 'metadata.google.internal'].includes(normalized)) {
    return true
  }

  const mappedIPv4 = normalizeIPv4MappedIPv6(normalized)
  if (mappedIPv4) {
    return isBlockedIPv4(mappedIPv4)
  }

  if (isIP(normalized) === 4) {
    return isBlockedIPv4(normalized)
  }

  if (isIP(normalized) === 6) {
    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || isLinkLocalIPv6(normalized)
  }

  return normalized.endsWith('.localhost')
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

  if (isDangerousHostname(parsed.hostname)) {
    throw new Error(`builtin-opencode remote MCP "${name}" 的 url 不能指向本机、内网或元数据地址`)
  }
}

function readBuiltinOpencodeConfigLayer(layer: ConfigLayer): BuiltinOpencodeConfig | undefined {
  if (!existsSync(layer.path)) {
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

function mergeProjectMcpEntry(name: string, lowPriority: unknown, highPriority: unknown): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    throw new Error(`项目级 builtin-opencode MCP "${name}" 只能覆盖已有 MCP 的安全字段`)
  }

  for (const key of Object.keys(highPriority)) {
    if (!PROJECT_MCP_OVERLAY_KEYS.has(key)) {
      throw new Error(`项目级 builtin-opencode MCP "${name}" 不能覆盖字段 "${key}"`)
    }
  }

  if (highPriority.enabled === true) {
    throw new Error(`项目级 builtin-opencode MCP "${name}" 不能将 enabled 设置为 true`)
  }

  if ('enabled' in highPriority && highPriority.enabled !== false) {
    throw new Error(`项目级 builtin-opencode MCP "${name}" 的 enabled 只能设置为 false`)
  }

  if ('timeout' in highPriority) {
    validateMcpTimeout(name, highPriority.timeout)
  }

  return mergeConfigObject(lowPriority, highPriority, false, true, false)
}

function mergeMcpEntry(lowPriority: unknown, highPriority: unknown): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    return highPriority
  }

  if (lowPriority.type !== highPriority.type) {
    return highPriority
  }

  return mergeConfigObject(lowPriority, highPriority, false, true, false)
}

function mergeMcpConfig(
  lowPriority: unknown,
  highPriority: unknown,
  allowNewEntries: boolean,
  projectOverlay: boolean,
): unknown {
  if (!isRecord(lowPriority) || !isRecord(highPriority)) {
    return highPriority
  }

  const merged: Record<string, unknown> = { ...lowPriority }
  for (const [name, highPriorityEntry] of Object.entries(highPriority)) {
    if (name in merged) {
      merged[name] = projectOverlay
        ? mergeProjectMcpEntry(name, merged[name], highPriorityEntry)
        : mergeMcpEntry(merged[name], highPriorityEntry)
    } else if (allowNewEntries) {
      merged[name] = highPriorityEntry
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
  projectMcpOverlay: boolean,
): BuiltinOpencodeConfig {
  const merged: Record<string, unknown> = { ...lowPriority }

  for (const [key, highPriorityValue] of Object.entries(highPriority)) {
    const lowPriorityValue = merged[key]
    if (mergeTopLevelMcp && key === 'mcp') {
      merged[key] = mergeMcpConfig(lowPriorityValue, highPriorityValue, allowNewMcpEntries, projectMcpOverlay)
    } else if (mergeTopLevelMcp && key === 'modelScenarios') {
      merged[key] = mergeModelScenariosConfig(lowPriorityValue, highPriorityValue)
    } else if (isRecord(lowPriorityValue) && isRecord(highPriorityValue)) {
      merged[key] = mergeConfigObject(lowPriorityValue, highPriorityValue, false, allowNewMcpEntries, projectMcpOverlay)
    } else {
      merged[key] = highPriorityValue
    }
  }

  return merged as BuiltinOpencodeConfig
}

export function mergeBuiltinOpencodeConfig(
  lowPriority: Record<string, unknown>,
  highPriority: Record<string, unknown>,
  options: { allowNewMcpEntries?: boolean; projectMcpOverlay?: boolean } = {},
): BuiltinOpencodeConfig {
  return mergeConfigObject(
    lowPriority,
    highPriority,
    true,
    options.allowNewMcpEntries ?? true,
    options.projectMcpOverlay ?? false,
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
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new Error(`${label} modelScenarios.${scenario} 必须是非空字符串模型标识`)
    }
  }
}

export function resolveBuiltinOpencodeConfigPaths(
  manifest: RuntimeAssetManifest,
  worktree: string,
): BuiltinOpencodeConfigPaths {
  return {
    projectConfigFile: join(worktree, '.opencode', 'builtin-opencode.jsonc'),
    globalConfigFile: join(homedir(), '.config', 'opencode', 'builtin-opencode.jsonc'),
    builtinConfigFile: manifest.builtinConfigFile,
  }
}

export function loadBuiltinOpencodeConfig(paths: BuiltinOpencodeConfigPaths): BuiltinOpencodeConfig {
  const layers: ConfigLayer[] = [
    { label: '插件内置', path: paths.builtinConfigFile, required: true, allowNewMcpEntries: true, projectMcpOverlay: false },
    { label: '全局', path: paths.globalConfigFile, required: false, allowNewMcpEntries: true, projectMcpOverlay: false },
    { label: '项目级', path: paths.projectConfigFile, required: false, allowNewMcpEntries: false, projectMcpOverlay: true },
  ]

  const config = layers.reduce<BuiltinOpencodeConfig>((merged, layer) => {
    const config = readBuiltinOpencodeConfigLayer(layer)
    return config ? mergeBuiltinOpencodeConfig(merged, config, {
      allowNewMcpEntries: layer.allowNewMcpEntries,
      projectMcpOverlay: layer.projectMcpOverlay,
    }) : merged
  }, {})
  validateMcpConfig(config)
  validateModelScenariosConfig(config)
  return config
}

export function collectModelScenarioSources(paths: BuiltinOpencodeConfigPaths): Map<string, ModelScenarioSource> {
  const layers: ConfigLayer[] = [
    { label: '插件内置', path: paths.builtinConfigFile, required: true, allowNewMcpEntries: true, projectMcpOverlay: false },
    { label: '全局', path: paths.globalConfigFile, required: false, allowNewMcpEntries: true, projectMcpOverlay: false },
    { label: '项目级', path: paths.projectConfigFile, required: false, allowNewMcpEntries: false, projectMcpOverlay: true },
  ]
  const sources = new Map<string, ModelScenarioSource>()

  for (const layer of layers) {
    const config = readBuiltinOpencodeConfigLayer(layer)
    if (!config) {
      continue
    }
    validateModelScenariosConfig(config, `${layer.label} builtin-opencode 配置`)
    for (const [scenario, model] of Object.entries(config.modelScenarios ?? {})) {
      sources.set(scenario, { scenario, model, layer: layer.label, path: layer.path })
    }
  }

  return sources
}

export function loadBuiltinMcpConfigFromPaths(paths: BuiltinOpencodeConfigPaths): McpConfig {
  return loadBuiltinOpencodeConfig(paths).mcp ?? {}
}
