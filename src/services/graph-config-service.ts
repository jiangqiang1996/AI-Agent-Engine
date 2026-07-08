import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import stripJsonComments from 'strip-json-comments'

import { isRegularFile } from '../utils/path-utils.js'

import {
  mergeBuiltinOpencodeConfig,
  resolveBuiltinOpencodeConfigPaths,
  type BuiltinOpencodeConfig,
  type BuiltinOpencodeConfigPaths,
  type ConfigLayer,
} from './builtin-opencode-config-service.js'
import { createRuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

export interface GraphConfig {
  include?: string[]
  exclude: string[]
}

interface GraphPathRule {
  directoryOnly: boolean
  regex: RegExp
}

export interface GraphPathMatchResult {
  included: boolean
  excluded: boolean
  covered: boolean
  matchedInclude?: string
  matchedExclude?: string
}

export interface GraphExcludeMatchResult {
  excluded: boolean
  matchedRule?: string
}

export interface GraphRuleChanges {
  appendInclude?: string[]
  appendExclude?: string[]
  removeInclude?: string[]
  removeExclude?: string[]
}

interface AeProjectConfig {
  graph?: {
    include?: unknown
    exclude?: unknown
  }
  [key: string]: unknown
}

interface JsonPropertySpan {
  key: string
  keyStart: number
  valueStart: number
  valueEnd: number
  commaEnd?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 解析当前工作区的项目级 AE 配置文件路径。 */
export function resolveGraphConfigPath(worktree: string): string {
  return join(worktree, '.opencode', 'ae.jsonc')
}

function readProjectConfig(configPath: string): AeProjectConfig {
  if (!isRegularFile(configPath)) {
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
  if (!isRegularFile(path)) {
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

function validateGraphConfig(config: BuiltinOpencodeConfig, layer: ConfigLayer): void {
  if (!isRecord(config.graph)) {
    return
  }
  for (const key of ['include', 'exclude'] as const) {
    const value = config.graph[key]
    if (value === undefined) {
      continue
    }
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`${layer.label} ae.jsonc graph.${key} 必须是字符串数组`)
    }
  }
}

/** 按 builtin-opencode 配置优先级加载图谱过滤配置。graph.include/exclude 采用跨层合并去重而非替换。 */
export function loadGraphConfig(worktree: string, builtinConfigFile = createRuntimeAssetManifest(import.meta.url).builtinConfigFile): GraphConfig {
  const paths = resolveBuiltinOpencodeConfigPaths({ ...createRuntimeAssetManifest(import.meta.url), builtinConfigFile }, worktree)
  const includeAccumulator: string[] = []
  const excludeAccumulator: string[] = []
  for (const layer of graphConfigLayers(paths)) {
    const config = readGraphConfigLayer(layer.path, layer.label, layer.required)
    if (!config) {
      continue
    }
    validateGraphConfig(config, layer)
    const graph = isRecord(config.graph) ? config.graph : {}
    if (Array.isArray(graph.include)) {
      for (const item of graph.include) {
        if (typeof item === 'string') {
          includeAccumulator.push(item)
        }
      }
    }
    if (Array.isArray(graph.exclude)) {
      for (const item of graph.exclude) {
        if (typeof item === 'string') {
          excludeAccumulator.push(item)
        }
      }
    }
  }
  return { include: [...new Set(includeAccumulator)], exclude: [...new Set(excludeAccumulator)] }
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

function parseGraphPathRule(rawRule: string): GraphPathRule | undefined {
  let rule = toPosixPath(rawRule.trim())
  if (!rule) {
    return undefined
  }

  const directoryOnly = rule.endsWith('/')
  rule = rule.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!rule) {
    return undefined
  }

  const anchored = rawRule.trim().startsWith('/')
  const hasSlash = rule.includes('/')
  const pattern = rule.startsWith('**/') ? `(?:.*/)?${globSegmentToRegex(rule.slice(3))}` : globSegmentToRegex(rule)
  const body = anchored || hasSlash ? pattern : `(?:^|.*/)${pattern}`
  const regex = new RegExp(`^${body}(?:/.*)?$`)

  return { directoryOnly, regex }
}

function matchGraphRules(relativePath: string, rules: string[], isDirectory: boolean): string | undefined {
  const normalizedPath = toPosixPath(relativePath).replace(/^\/+/, '').replace(/\/+$/, '')
  let matchedRule: string | undefined

  for (const rawRule of rules) {
    const rule = parseGraphPathRule(rawRule)
    if (!rule || (rule.directoryOnly && !isDirectory && !normalizedPath.includes('/'))) {
      continue
    }
    if (rule.regex.test(normalizedPath)) {
      matchedRule = rawRule
    }
  }

  return matchedRule
}

/** 判断路径是否被图谱 include/exclude 规则覆盖，并返回最后匹配规则。 */
export function matchGraphPath(relativePath: string, config: GraphConfig, isDirectory = false): GraphPathMatchResult {
  const matchedInclude = matchGraphRules(relativePath, config.include ?? [], isDirectory)
  if (matchedInclude) {
    return { included: true, excluded: false, covered: true, matchedInclude }
  }

  const matchedExclude = matchGraphRules(relativePath, config.exclude, isDirectory)
  return {
    included: false,
    excluded: Boolean(matchedExclude),
    covered: Boolean(matchedExclude),
    matchedExclude,
  }
}

/** 判断路径是否被一组图谱排除规则匹配。 */
export function matchGraphExcludePath(relativePath: string, rules: string[], isDirectory = false): GraphExcludeMatchResult {
  const matchedRule = matchGraphRules(relativePath, rules, isDirectory)
  return matchedRule ? { excluded: true, matchedRule } : { excluded: false }
}

function skipWhitespaceAndComments(raw: string, index: number): number {
  let cursor = index
  while (cursor < raw.length) {
    if (/\s/.test(raw[cursor] ?? '')) {
      cursor += 1
      continue
    }
    if (raw.startsWith('//', cursor)) {
      const lineEnd = raw.indexOf('\n', cursor + 2)
      cursor = lineEnd < 0 ? raw.length : lineEnd + 1
      continue
    }
    if (raw.startsWith('/*', cursor)) {
      const blockEnd = raw.indexOf('*/', cursor + 2)
      cursor = blockEnd < 0 ? raw.length : blockEnd + 2
      continue
    }
    break
  }
  return cursor
}

function skipString(raw: string, index: number): number {
  let cursor = index + 1
  while (cursor < raw.length) {
    if (raw[cursor] === '\\') {
      cursor += 2
      continue
    }
    if (raw[cursor] === '"') {
      return cursor + 1
    }
    cursor += 1
  }
  throw new Error('JSONC 字符串未闭合，无法安全编辑 graph 配置')
}

function findMatching(raw: string, openIndex: number, openChar: '{' | '['): number {
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  let cursor = openIndex
  while (cursor < raw.length) {
    if (raw[cursor] === '"') {
      cursor = skipString(raw, cursor)
      continue
    }
    if (raw.startsWith('//', cursor)) {
      const lineEnd = raw.indexOf('\n', cursor + 2)
      cursor = lineEnd < 0 ? raw.length : lineEnd + 1
      continue
    }
    if (raw.startsWith('/*', cursor)) {
      const blockEnd = raw.indexOf('*/', cursor + 2)
      cursor = blockEnd < 0 ? raw.length : blockEnd + 2
      continue
    }
    if (raw[cursor] === openChar) {
      depth += 1
    } else if (raw[cursor] === closeChar) {
      depth -= 1
      if (depth === 0) {
        return cursor
      }
    }
    cursor += 1
  }
  throw new Error('JSONC 对象或数组未闭合，无法安全编辑 graph 配置')
}

function readJsonString(raw: string, start: number, end: number): string {
  return JSON.parse(raw.slice(start, end)) as string
}

function findJsonProperty(raw: string, objectStart: number, objectEnd: number, key: string): JsonPropertySpan | undefined {
  let cursor = objectStart + 1
  while (cursor < objectEnd) {
    cursor = skipWhitespaceAndComments(raw, cursor)
    if (cursor >= objectEnd || raw[cursor] === '}') {
      break
    }
    if (raw[cursor] === ',') {
      cursor += 1
      continue
    }
    if (raw[cursor] !== '"') {
      throw new Error('JSONC 对象属性必须使用双引号，无法安全编辑 graph 配置')
    }
    const keyStart = cursor
    const keyEnd = skipString(raw, cursor)
    const propertyKey = readJsonString(raw, keyStart, keyEnd)
    cursor = skipWhitespaceAndComments(raw, keyEnd)
    if (raw[cursor] !== ':') {
      throw new Error('JSONC 对象属性缺少冒号，无法安全编辑 graph 配置')
    }
    const valueStart = skipWhitespaceAndComments(raw, cursor + 1)
    let valueEnd = valueStart
    if (raw[valueStart] === '{' || raw[valueStart] === '[') {
      valueEnd = findMatching(raw, valueStart, raw[valueStart] as '{' | '[') + 1
    } else if (raw[valueStart] === '"') {
      valueEnd = skipString(raw, valueStart)
    } else {
      while (valueEnd < objectEnd && raw[valueEnd] !== ',' && raw[valueEnd] !== '}') {
        valueEnd += 1
      }
    }
    const afterValue = skipWhitespaceAndComments(raw, valueEnd)
    const commaEnd = raw[afterValue] === ',' ? afterValue + 1 : undefined
    if (propertyKey === key) {
      return { key: propertyKey, keyStart, valueStart, valueEnd, commaEnd }
    }
    cursor = commaEnd ?? valueEnd
  }
  return undefined
}

function lineIndentBefore(raw: string, index: number): string {
  const lineStart = raw.lastIndexOf('\n', index - 1) + 1
  const linePrefix = raw.slice(lineStart, index).match(/^\s*/)?.[0]
  return linePrefix ?? ''
}

function objectHasProperties(raw: string, objectStart: number, objectEnd: number): boolean {
  const cursor = skipWhitespaceAndComments(raw, objectStart + 1)
  return cursor < objectEnd && raw[cursor] !== '}'
}

function arrayHasItems(raw: string, arrayStart: number, arrayEnd: number): boolean {
  const cursor = skipWhitespaceAndComments(raw, arrayStart + 1)
  return cursor < arrayEnd && raw[cursor] !== ']'
}

function insertObjectProperty(raw: string, objectStart: number, objectEnd: number, key: string, value: string): string {
  const closingIndent = lineIndentBefore(raw, objectEnd)
  const itemIndent = `${closingIndent}  `
  const property = `${JSON.stringify(key)}: ${value}`
  const prefix = objectHasProperties(raw, objectStart, objectEnd) ? ',' : ''
  const insertion = `${prefix}\n${itemIndent}${property}\n${closingIndent}`
  return `${raw.slice(0, objectEnd)}${insertion}${raw.slice(objectEnd)}`
}

function appendArrayValues(raw: string, arrayStart: number, arrayEnd: number, values: string[]): string {
  if (values.length === 0) {
    return raw
  }
  const closingIndent = lineIndentBefore(raw, arrayEnd)
  const itemIndent = `${closingIndent}  `
  const encodedValues = values.map((value) => JSON.stringify(value)).join(`,\n${itemIndent}`)
  const insertion = arrayHasItems(raw, arrayStart, arrayEnd)
    ? `,\n${itemIndent}${encodedValues}`
    : `\n${itemIndent}${encodedValues}\n${closingIndent}`
  return `${raw.slice(0, arrayEnd)}${insertion}${raw.slice(arrayEnd)}`
}

function removeArrayValues(raw: string, arrayStart: number, arrayEnd: number, values: Set<string>): string {
  if (values.size === 0) {
    return raw
  }
  const items: Array<{ start: number; end: number; value: string }> = []
  let cursor = arrayStart + 1
  while (cursor < arrayEnd) {
    cursor = skipWhitespaceAndComments(raw, cursor)
    if (cursor >= arrayEnd || raw[cursor] === ']') {
      break
    }
    if (raw[cursor] === ',') {
      cursor += 1
      continue
    }
    if (raw[cursor] !== '"') {
      throw new Error('graph.include / graph.exclude 只能包含字符串，无法安全编辑')
    }
    const itemStart = cursor
    const itemEnd = skipString(raw, cursor)
    items.push({ start: itemStart, end: itemEnd, value: readJsonString(raw, itemStart, itemEnd) })
    cursor = itemEnd
  }

  let nextRaw = raw
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item || !values.has(item.value)) {
      continue
    }
    const nextItem = items[index + 1]
    const previousItem = items[index - 1]
    let removeStart = item.start
    let removeEnd = item.end
    if (nextItem) {
      removeEnd = nextItem.start
    } else if (previousItem) {
      removeStart = previousItem.end
    }
    nextRaw = `${nextRaw.slice(0, removeStart)}${nextRaw.slice(removeEnd)}`
  }
  return nextRaw
}

function buildArrayLiteral(values: string[]): string {
  return values.length === 0 ? '[]' : `[\n    ${values.map((value) => JSON.stringify(value)).join(',\n    ')}\n  ]`
}

function ensureGraphObject(raw: string): { raw: string; graphStart: number; graphEnd: number } {
  const rootStart = skipWhitespaceAndComments(raw, 0)
  if (raw[rootStart] !== '{') {
    throw new Error('项目级 ae.jsonc 根节点必须是 JSON 对象，无法安全编辑 graph 配置')
  }
  const rootEnd = findMatching(raw, rootStart, '{')
  const graphProperty = findJsonProperty(raw, rootStart, rootEnd, 'graph')
  if (!graphProperty) {
    const nextRaw = insertObjectProperty(raw, rootStart, rootEnd, 'graph', '{}')
    const nextRootEnd = findMatching(nextRaw, rootStart, '{')
    const nextGraphProperty = findJsonProperty(nextRaw, rootStart, nextRootEnd, 'graph')
    if (!nextGraphProperty || nextRaw[nextGraphProperty.valueStart] !== '{') {
      throw new Error('无法创建 graph 配置节点')
    }
    return { raw: nextRaw, graphStart: nextGraphProperty.valueStart, graphEnd: nextGraphProperty.valueEnd - 1 }
  }
  if (raw[graphProperty.valueStart] !== '{') {
    throw new Error('项目级 ae.jsonc graph 必须是对象，无法安全编辑 graph 配置')
  }
  return { raw, graphStart: graphProperty.valueStart, graphEnd: graphProperty.valueEnd - 1 }
}

function updateArrayProperty(raw: string, graphStart: number, graphEnd: number, key: 'include' | 'exclude', append: string[], remove: string[]): string {
  let nextRaw = raw
  let nextGraphEnd = graphEnd
  let property = findJsonProperty(nextRaw, graphStart, nextGraphEnd, key)
  if (!property && append.length > 0) {
    nextRaw = insertObjectProperty(nextRaw, graphStart, nextGraphEnd, key, buildArrayLiteral(append))
    nextGraphEnd = findMatching(nextRaw, graphStart, '{')
    property = findJsonProperty(nextRaw, graphStart, nextGraphEnd, key)
    return nextRaw
  }
  if (!property) {
    return nextRaw
  }
  if (nextRaw[property.valueStart] !== '[') {
    throw new Error(`项目级 ae.jsonc graph.${key} 必须是数组，无法安全编辑`)
  }
  const arrayStart = property.valueStart
  let arrayEnd = property.valueEnd - 1
  nextRaw = removeArrayValues(nextRaw, arrayStart, arrayEnd, new Set(remove))
  nextGraphEnd = findMatching(nextRaw, graphStart, '{')
  property = findJsonProperty(nextRaw, graphStart, nextGraphEnd, key)
  if (!property || nextRaw[property.valueStart] !== '[') {
    throw new Error(`无法定位 graph.${key} 数组，无法安全编辑`)
  }
  arrayEnd = property.valueEnd - 1
  nextRaw = appendArrayValues(nextRaw, property.valueStart, arrayEnd, append)
  return nextRaw
}

function normalizeChanges(changes: GraphRuleChanges, current: GraphConfig): Required<GraphRuleChanges> {
  const currentInclude = new Set(current.include ?? [])
  const currentExclude = new Set(current.exclude)
  const appendInclude = [...new Set(changes.appendInclude ?? [])].filter((rule) => !currentInclude.has(rule))
  const appendExclude = [...new Set(changes.appendExclude ?? [])].filter((rule) => !currentExclude.has(rule))
  const removeInclude = [...new Set(changes.removeInclude ?? [])]
  const removeExclude = [...new Set(changes.removeExclude ?? [])]
  return { appendInclude, appendExclude, removeInclude, removeExclude }
}

/** 最小编辑项目级 ae.jsonc 中的 graph.include / graph.exclude 规则。 */
export function updateGraphRulesInProjectConfig(
  worktree: string,
  changes: GraphRuleChanges,
  builtinConfigFile = createRuntimeAssetManifest(import.meta.url).builtinConfigFile,
): GraphConfig {
  const configPath = resolveGraphConfigPath(worktree)
  const current = readProjectConfig(configPath)
  const currentGraph = isRecord(current.graph) ? current.graph : {}
  const effectiveConfig = loadGraphConfig(worktree, builtinConfigFile)
  const normalized = normalizeChanges(changes, effectiveConfig)
  const projectOnlyNormalized = normalizeChanges({
    removeInclude: normalized.removeInclude,
    removeExclude: normalized.removeExclude,
  }, {
    include: Array.isArray(currentGraph.include) ? currentGraph.include.filter((item): item is string => typeof item === 'string') : [],
    exclude: Array.isArray(currentGraph.exclude) ? currentGraph.exclude.filter((item): item is string => typeof item === 'string') : [],
  })

  if (
    normalized.appendInclude.length === 0
    && normalized.appendExclude.length === 0
    && projectOnlyNormalized.removeInclude.length === 0
    && projectOnlyNormalized.removeExclude.length === 0
  ) {
    return effectiveConfig
  }

  mkdirSync(dirname(configPath), { recursive: true })
  if (!isRegularFile(configPath)) {
    const graph: { include?: string[]; exclude?: string[] } = {}
    if (normalized.appendInclude.length > 0) {
      graph.include = normalized.appendInclude
    }
    if (normalized.appendExclude.length > 0) {
      graph.exclude = normalized.appendExclude
    }
    writeFileSync(configPath, `${JSON.stringify({ graph }, null, 2)}\n`)
    return loadGraphConfig(worktree, builtinConfigFile)
  }

  const raw = readFileSync(configPath, 'utf8')
  let editable = ensureGraphObject(raw)
  let nextRaw = updateArrayProperty(
    editable.raw,
    editable.graphStart,
    editable.graphEnd,
    'include',
    normalized.appendInclude,
    projectOnlyNormalized.removeInclude,
  )
  editable = ensureGraphObject(nextRaw)
  nextRaw = updateArrayProperty(
    editable.raw,
    editable.graphStart,
    editable.graphEnd,
    'exclude',
    normalized.appendExclude,
    projectOnlyNormalized.removeExclude,
  )
  writeFileSync(configPath, nextRaw.endsWith('\n') ? nextRaw : `${nextRaw}\n`)
  return loadGraphConfig(worktree, builtinConfigFile)
}

/** 保存单条 graph.include 规则到项目级 ae.jsonc。 */
export function saveGraphIncludeRule(
  worktree: string,
  rule: string,
  builtinConfigFile = createRuntimeAssetManifest(import.meta.url).builtinConfigFile,
): GraphConfig {
  return updateGraphRulesInProjectConfig(worktree, { appendInclude: [rule] }, builtinConfigFile)
}

/** 保存单条 graph.exclude 规则到项目级 ae.jsonc。 */
export function saveGraphExcludeRule(
  worktree: string,
  rule: string,
  builtinConfigFile = createRuntimeAssetManifest(import.meta.url).builtinConfigFile,
): GraphConfig {
  return updateGraphRulesInProjectConfig(worktree, { appendExclude: [rule] }, builtinConfigFile)
}
