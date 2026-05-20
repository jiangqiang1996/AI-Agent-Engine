import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parseDocument } from 'yaml'

import { filterSwaggerOperations, type SwaggerFilterInput } from './swagger-filter-service.js'
import { SwaggerError } from './swagger-errors.js'
import { parseSwaggerDocument } from './swagger-parser-service.js'
import { redactSwaggerOutput } from './swagger-redaction-service.js'
import { formatSwaggerSummary } from './swagger-summary-service.js'
import { loadSwaggerSource, type SwaggerSourceResult } from './swagger-source-loader.js'

type SwaggerDocumentFormat = 'json' | 'yaml' | 'html'

const MAX_DOCUMENT_DEPTH = 80
const MAX_DOCUMENT_NODES = 5000
const YAML_ALIAS_LIMIT = 20
const MAX_RELATIVE_REF_FILES = 20
const MAX_RELATIVE_REF_BYTES = 10 * 1024 * 1024
const MAX_SINGLE_RELATIVE_REF_BYTES = 2 * 1024 * 1024

interface RelativeRefBudget {
  files: number
  bytes: number
}

interface RelativeRefContext {
  loaded: SwaggerSourceResult
  baseDir: string
  currentDir: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function detectSwaggerDocumentFormat(content: string): SwaggerDocumentFormat {
  const trimmed = content.trimStart()
  if (/^<!doctype\s+html\b/i.test(trimmed) || /^<html\b/i.test(trimmed)) {
    return 'html'
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json'
  }
  return 'yaml'
}

function assertSafeParsedDocument(value: unknown, depth = 0, seen = new Set<unknown>()): number {
  if (depth > MAX_DOCUMENT_DEPTH) {
    throw new SwaggerError('document_structure_invalid', '文档结构过深：请简化 Swagger/OpenAPI 文档后重试。')
  }
  if (typeof value !== 'object' || value === null) {
    return 1
  }
  if (seen.has(value)) {
    throw new SwaggerError('document_structure_invalid', '文档结构无效：检测到循环引用。')
  }
  seen.add(value)

  let nodes = 1
  if (Array.isArray(value)) {
    for (const item of value) {
      nodes += assertSafeParsedDocument(item, depth + 1, seen)
      if (nodes > MAX_DOCUMENT_NODES) {
        throw new SwaggerError('document_structure_invalid', '文档结构过大：请使用更小的 Swagger/OpenAPI 文档。')
      }
    }
    seen.delete(value)
    return nodes
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new SwaggerError('document_structure_invalid', '文档结构无效：包含不安全的对象键。')
    }
    nodes += assertSafeParsedDocument(item, depth + 1, seen)
    if (nodes > MAX_DOCUMENT_NODES) {
      throw new SwaggerError('document_structure_invalid', '文档结构过大：请使用更小的 Swagger/OpenAPI 文档。')
    }
  }
  seen.delete(value)
  return nodes
}

function parseYamlSwaggerDocument(content: string): unknown {
  const document = parseDocument(content, {
    prettyErrors: false,
    schema: 'core',
    uniqueKeys: true,
  })

  if (document.errors.length > 0) {
    throw new SwaggerError('yaml_parse_failed', 'YAML 解析失败：请确认输入是合法的单文档 Swagger/OpenAPI YAML。')
  }
  if (document.directives.docStart && content.match(/^---/gm)?.length && (content.match(/^---/gm)?.length ?? 0) > 1) {
    throw new SwaggerError('yaml_parse_failed', 'YAML 解析失败：当前仅支持单文档 Swagger/OpenAPI YAML。')
  }

  const value = document.toJS({ maxAliasCount: YAML_ALIAS_LIMIT }) as unknown
  assertSafeParsedDocument(value)
  return value
}

function parseLoadedDocument(content: string): unknown {
  const format = detectSwaggerDocumentFormat(content)
  if (format === 'html') {
    throw new SwaggerError(
      'html_document_received',
      '输入看起来是 Swagger UI HTML 页面，不是 OpenAPI JSON/YAML 规格。请提供实际的 /openapi.json、/swagger.json 或 YAML 地址。',
    )
  }

  const document = format === 'json' ? JSON.parse(content) as unknown : parseYamlSwaggerDocument(content)
  if (!isRecord(document)) {
    throw new SwaggerError('document_structure_invalid', '文档结构无效：Swagger/OpenAPI 根节点必须是对象。')
  }
  assertSafeParsedDocument(document)
  return document
}

function isSensitiveRefPath(filePath: string): boolean {
  const parts = filePath.split(/[\\/]+/)
  return parts.some((part) => part.startsWith('.') || /(^|\.)(env|key|pem|pfx|crt|cert|secret|token|credential)s?($|\.)/i.test(part))
}

function splitRef(ref: string): { fileRef: string; pointer: string } {
  const index = ref.indexOf('#')
  return index === -1
    ? { fileRef: ref, pointer: '' }
    : { fileRef: ref.slice(0, index), pointer: ref.slice(index) }
}

async function readRelativeRefDocument(context: RelativeRefContext, ref: string, budget: RelativeRefBudget): Promise<unknown> {
  if (context.loaded.sourceType !== 'local' || !context.loaded.documentDir) {
    return { $ref: ref, description: '远程或未知来源的外部引用默认不展开。' }
  }

  const { fileRef, pointer } = splitRef(ref)
  if (!fileRef || /^https?:\/\//i.test(fileRef) || path.isAbsolute(fileRef)) {
    return { $ref: ref, description: '外部引用默认不展开。' }
  }

  const target = path.resolve(context.currentDir, fileRef)
  const realTarget = await fs.realpath(target).catch(() => undefined)
  if (!realTarget) {
    return { $ref: ref, description: '引用文件不存在，无法展开。' }
  }

  const relative = path.relative(context.baseDir, realTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative) || isSensitiveRefPath(relative) || !/\.ya?ml$|\.json$/i.test(realTarget)) {
    return { $ref: ref, description: '引用文件超出安全边界，已停止展开。' }
  }

  const stat = await fs.stat(realTarget)
  if (!stat.isFile() || stat.size > MAX_SINGLE_RELATIVE_REF_BYTES) {
    return { $ref: ref, description: '引用文件不可读取或超过大小限制，已停止展开。' }
  }
  if (budget.files >= MAX_RELATIVE_REF_FILES || budget.bytes + stat.size > MAX_RELATIVE_REF_BYTES) {
    return { $ref: ref, description: '引用文件预算已耗尽，已停止展开。' }
  }

  budget.files += 1
  budget.bytes += stat.size
  const content = await fs.readFile(realTarget, 'utf8')
  const document = parseLoadedDocument(content)
  const selected = pointer ? resolveRelativePointer(document, pointer, ref) : document
  const resolvedSelected = resolveInternalRefs(selected, document)
  return resolveRelativeRefs(resolvedSelected, { ...context, currentDir: path.dirname(realTarget) }, budget)
}

function resolveInternalRefs(value: unknown, root: unknown, depth = 0, visited = new Set<string>()): unknown {
  if (depth > 8 || typeof value !== 'object' || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveInternalRefs(item, root, depth + 1, visited))
  }

  const record = value as Record<string, unknown>
  if (typeof record.$ref === 'string' && record.$ref.startsWith('#/')) {
    if (visited.has(record.$ref)) {
      return { $ref: record.$ref, description: '引用过深或存在循环，已停止展开。' }
    }
    const nextVisited = new Set(visited)
    nextVisited.add(record.$ref)
    return resolveInternalRefs(resolveRelativePointer(root, record.$ref, record.$ref), root, depth + 1, nextVisited)
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, resolveInternalRefs(item, root, depth + 1, visited)]),
  )
}

function resolveRelativePointer(document: unknown, pointer: string, originalRef: string): unknown {
  if (!pointer.startsWith('#/')) {
    return document
  }

  const parts = pointer.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  let current = document
  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return { $ref: originalRef, description: '引用路径不存在，无法展开。' }
    }
    current = current[part]
  }
  return current
}

async function resolveRelativeRefs(value: unknown, context: RelativeRefContext, budget: RelativeRefBudget, depth = 0): Promise<unknown> {
  if (depth > MAX_DOCUMENT_DEPTH || typeof value !== 'object' || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveRelativeRefs(item, context, budget, depth + 1)))
  }

  const record = value as Record<string, unknown>
  if (typeof record.$ref === 'string' && !record.$ref.startsWith('#/')) {
    return readRelativeRefDocument(context, record.$ref, budget)
  }

  const entries = await Promise.all(
    Object.entries(record).map(async ([key, item]) => [key, await resolveRelativeRefs(item, context, budget, depth + 1)] as const),
  )
  return Object.fromEntries(entries)
}

export async function parseSwaggerSource(source: string, worktree: string, filter: SwaggerFilterInput): Promise<string> {
  const loaded = await loadSwaggerSource(source, worktree)
  const baseDir = loaded.documentDir ?? worktree
  const document = await resolveRelativeRefs(parseLoadedDocument(loaded.content), { loaded, baseDir, currentDir: baseDir }, { files: 0, bytes: 0 })
  assertSafeParsedDocument(document)
  const parsed = parseSwaggerDocument(document)
  const filtered = filterSwaggerOperations(parsed, filter)
  return formatSwaggerSummary(filtered, redactSwaggerOutput)
}
