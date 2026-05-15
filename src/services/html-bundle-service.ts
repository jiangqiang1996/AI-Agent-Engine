import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'

import { isInsideRoot, pathContainsSymlink, resolvePathWithBase, toPosixPath } from '../utils/path-utils.js'

export type HtmlBundleStatus = 'complete' | 'partial' | 'failed'
export type ExternalResourcePolicy = 'keep' | 'fail'

/** HTML bundle 服务的输入参数。 */
export interface HtmlBundleOptions {
  entry: string
  output: string
  worktree: string
  baseDirectory?: string
  externalPolicy?: ExternalResourcePolicy
  maxResourceBytes?: number
  maxTotalResourceBytes?: number
  maxOutputBytes?: number
}

/** HTML bundle 服务返回给工具层的结构化结果。 */
export interface HtmlBundleResult {
  status: HtmlBundleStatus
  entry: string
  output: string
  inlinedResources: number
  retainedResources: number
  outputBytes: number
  warnings: string[]
}

/** HTML bundle 服务可恢复错误。 */
export class HtmlBundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HtmlBundleError'
  }
}

const DEFAULT_MAX_RESOURCE_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_TOTAL_RESOURCE_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_OUTPUT_BYTES = 100 * 1024 * 1024

const INLINE_TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.svg'])
const CSS_URL_PATTERN = /url\((['"]?)([^)'"]+)\1\)/g
const CSS_IMPORT_PATTERN = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)'";]+))\s*\)?\s*([^;]*);?/g
const HTML_TAG_PATTERN = /<[^>]+>/g
const HTML_URL_ATTR_PATTERN = /\b(?:src|href|data|poster|action|cite|formaction|manifest)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi
const HTML_SRCSET_ATTR_PATTERN = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi
const HTML_SOURCE_MAP_LINK_PATTERN = /<link\b[^>]*\brel=["']?sourcemap["']?[^>]*>/gi
const SOURCE_MAP_COMMENT_PATTERN = /(?:\/\/[#@]\s*sourceMappingURL=[^\r\n]*|\/\*[#@]\s*sourceMappingURL=[\s\S]*?\*\/)/g
const SCRIPT_BLOCK_PATTERN = /<script\b[\s\S]*?<\/script>/gi
const STATIC_IMPORT_PATTERN = /(?:^|[\r\n;])\s*(?:import|export)\s+(?:[^'"()]+?\s+from\s+)?(['"])([^'"]+)\1/gm

interface BundleState {
  worktree: string
  warnings: string[]
  inlinedResources: number
  retainedResources: number
  totalResourceBytes: number
  maxResourceBytes: number
  maxTotalResourceBytes: number
  externalPolicy: ExternalResourcePolicy
  seen: Set<string>
  retainedUnsupportedUrls: Set<string>
}

/**
 * 将底层异常转换为工具可直接展示的中文错误。
 */
export function formatHtmlBundleError(error: unknown): string {
  if (error instanceof HtmlBundleError) {
    return error.message
  }
  if (error instanceof Error) {
    return `生成 bundle.html 失败：${error.message}`
  }
  return '生成 bundle.html 失败：未知错误'
}

/**
 * 将显式 HTML 入口及其本地静态资源收敛为单个输出 HTML。
 */
export function bundleHtml(options: HtmlBundleOptions): HtmlBundleResult {
  const worktree = resolve(options.worktree)
  const baseDirectory = resolve(options.baseDirectory ?? options.worktree)
  const entryPath = resolvePathWithBase(baseDirectory, options.entry)
  const outputPath = resolvePathWithBase(baseDirectory, options.output)
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
  const state: BundleState = {
    worktree,
    warnings: [],
    inlinedResources: 0,
    retainedResources: 0,
    totalResourceBytes: 0,
    maxResourceBytes: options.maxResourceBytes ?? DEFAULT_MAX_RESOURCE_BYTES,
    maxTotalResourceBytes: options.maxTotalResourceBytes ?? DEFAULT_MAX_TOTAL_RESOURCE_BYTES,
    externalPolicy: options.externalPolicy ?? 'keep',
    seen: new Set(),
    retainedUnsupportedUrls: new Set(),
  }

  assertSafeExistingFile(worktree, entryPath, '入口 HTML')
  if (lstatSync(entryPath).isDirectory() || extname(entryPath).toLowerCase() !== '.html') {
    throw new HtmlBundleError('入口必须是显式的 HTML 文件，不支持目录、通配符或隐式入口发现。')
  }
  assertSafeOutputPath(worktree, outputPath)

  let html = readFileSync(entryPath, 'utf8')
  html = removeSourceMaps(html, state)
  html = inlineHtmlResources(html, dirname(entryPath), state)
  assertNoUnhandledExternalReferences(html, state)
  warnUnhandledStaticReferences(html, state)
  html = warnRuntimeOnlyPatterns(html, state)

  const outputBytes = Buffer.byteLength(html, 'utf8')
  if (outputBytes > maxOutputBytes) {
    throw new HtmlBundleError(`最终 HTML 超过大小上限：${outputBytes} 字节，限制 ${maxOutputBytes} 字节。`)
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, html, 'utf8')

  return {
    status: state.warnings.length > 0 || state.retainedResources > 0 ? 'partial' : 'complete',
    entry: toPosixPath(relative(worktree, entryPath)),
    output: toPosixPath(relative(worktree, outputPath)),
    inlinedResources: state.inlinedResources,
    retainedResources: state.retainedResources,
    outputBytes,
    warnings: state.warnings,
  }
}

function assertSafeExistingFile(worktree: string, filePath: string, label: string): void {
  if (!isInsideRoot(worktree, filePath)) {
    throw new HtmlBundleError(`${label} 不在当前工作区内。`)
  }
  if (!existsSync(filePath)) {
    throw new HtmlBundleError(`${label} 不存在或无法访问。`)
  }
  if (pathContainsSymlink(worktree, filePath) || !isInsideRoot(realpathSync(worktree), realpathSync(filePath))) {
    throw new HtmlBundleError(`${label} 不能通过符号链接越过当前工作区。`)
  }
}

function assertSafeOutputPath(worktree: string, outputPath: string): void {
  if (!isInsideRoot(worktree, outputPath)) {
    throw new HtmlBundleError('输出路径不在当前工作区内。')
  }
  if (extname(outputPath).toLowerCase() !== '.html') {
    throw new HtmlBundleError('输出路径必须是 HTML 文件。')
  }
  const parent = dirname(outputPath)
  assertSafeOutputAncestors(worktree, parent)
  if (existsSync(outputPath)) {
    const outputStat = lstatSync(outputPath)
    if (outputStat.isSymbolicLink()) {
      throw new HtmlBundleError('输出路径不能是符号链接。')
    }
    if (outputStat.isDirectory()) {
      throw new HtmlBundleError('输出路径不能是目录。')
    }
  }
}

function assertSafeOutputAncestors(worktree: string, parent: string): void {
  const worktreeReal = realpathSync(worktree)
  const relativeParent = relative(worktree, parent)
  const segments = relativeParent ? relativeParent.split(/[\\/]+/).filter(Boolean) : []
  let current = worktree
  for (const segment of segments) {
    current = resolve(current, segment)
    if (!existsSync(current)) {
      break
    }
    if (pathContainsSymlink(worktree, current) || !isInsideRoot(worktreeReal, realpathSync(current))) {
      throw new HtmlBundleError('输出目录不能通过符号链接越过当前工作区。')
    }
  }
}

function removeSourceMaps(content: string, state: BundleState): string {
  let removed = false
  let next = content.replace(HTML_SOURCE_MAP_LINK_PATTERN, () => {
    removed = true
    return ''
  })
  next = next.replace(SOURCE_MAP_COMMENT_PATTERN, () => {
    removed = true
    return ''
  })
  if (removed) {
    state.warnings.push('已删除 source map 引用，避免 bundle.html 依赖或泄露本地 .map 文件。')
  }
  return next
}

function inlineHtmlResources(html: string, baseDir: string, state: BundleState): string {
  const masked = maskScriptBlocks(html)
  let next = masked.html
  next = next.replace(/<link\b([^>]*)\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))([^>]*)>/gi, (match, before, doubleQuoted, singleQuoted, unquoted, after) => {
    const raw = doubleQuoted ?? singleQuoted ?? unquoted
    const attrs = `${before} ${after}`
    const rel = /\brel\s*=\s*(?:"stylesheet"|'stylesheet'|stylesheet\b)/i.test(attrs)
      || /\brel\s*=\s*(?:"stylesheet"|'stylesheet'|stylesheet\b)/i.test(match)
    if (!rel) {
      assertExternalPolicy(raw, state)
      retainUnsupported(raw, 'link', state)
      return match
    }
    if (/\b(?:disabled|title)\b/i.test(attrs)) {
      retainUnsupported(raw, 'stylesheet link 属性', state)
      return match
    }
    const resource = readResource(baseDir, raw, state, true)
    if (!resource) {
      return match
    }
    const css = wrapCssWithMedia(inlineCssResources(removeSourceMaps(resource.text, state), dirname(resource.path), state), attrs)
    return `<style>${css}</style>`
  })
  next = next.replace(/<img\b([^>]*)\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))([^>]*)>/gi, (match, before, doubleQuoted, singleQuoted, unquoted, after) => {
    const raw = doubleQuoted ?? singleQuoted ?? unquoted
    const data = readDataUri(baseDir, raw, state)
    return data ? `<img${before}src="${data}"${after}>` : match
  })
  next = next.replace(/\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gi, (match, doubleQuoted, singleQuoted, unquoted) => {
    const raw = doubleQuoted ?? singleQuoted ?? unquoted
    const srcset = inlineSrcset(baseDir, raw, state)
    return srcset === raw ? match : `srcset="${srcset}"`
  })
  next = next.replace(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi, (_match, doubleQuoted, singleQuoted, unquoted) => {
    const css = doubleQuoted ?? singleQuoted ?? unquoted ?? ''
    return `style="${escapeHtmlAttribute(inlineCssResources(css, baseDir, state))}"`
  })
  next = next.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, css) => {
    return `<style${attrs}>${inlineCssResources(removeSourceMaps(css, state), baseDir, state)}</style>`
  })
  next = restoreScriptBlocks(next, masked)
  next = next.replace(/<script\b([^>]*)\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))([^>]*)>\s*<\/script>/gi, (match, before, doubleQuoted, singleQuoted, unquoted, after) => {
    const raw = doubleQuoted ?? singleQuoted ?? unquoted
    const resource = readResource(baseDir, raw, state, true)
    if (!resource) {
      return match
    }
    const script = escapeScriptContent(removeSourceMaps(resource.text, state))
    if (/\btype\s*=\s*(?:"module"|'module'|module\b)/i.test(`${before} ${after}`)) {
      warnStaticModuleImports(script, state)
    }
    return `<script${before.trimEnd()}${after}>${script}</script>`
  })
  return next
}

function maskScriptBlocks(html: string): { html: string, scripts: string[], token: string } {
  const scripts: string[] = []
  const token = createMaskToken(html)
  return {
    html: html.replace(SCRIPT_BLOCK_PATTERN, (script) => {
      const index = scripts.push(script) - 1
      return `${token}${index}%%`
    }),
    scripts,
    token,
  }
}

function createMaskToken(html: string): string {
  let index = 0
  let token = '%%AE_SCRIPT_BLOCK_'
  while (html.includes(token)) {
    index += 1
    token = `%%AE_SCRIPT_BLOCK_${index}_`
  }
  return token
}

function restoreScriptBlocks(html: string, masked: { scripts: string[], token: string }): string {
  const pattern = new RegExp(`${escapeRegExp(masked.token)}(\\d+)%%`, 'g')
  return html.replace(pattern, (match, index) => masked.scripts[Number(index)] ?? match)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function warnStaticModuleImports(script: string, state: BundleState): void {
  for (const match of script.matchAll(STATIC_IMPORT_PATTERN)) {
    const raw = match[2] ?? ''
    assertExternalPolicy(raw, state)
    if (raw.startsWith('.') || raw.startsWith('/') || isExternalUrl(raw) || raw.startsWith('//')) {
      retainUnsupported(raw, 'module 静态 import', state)
    }
  }
}

function escapeScriptContent(script: string): string {
  return script.replace(/<\/script/gi, '<\\/script')
}

function inlineCssResources(css: string, baseDir: string, state: BundleState): string {
  let next = css.replace(CSS_IMPORT_PATTERN, (match, doubleQuoted, singleQuoted, unquoted, media) => {
    const raw = doubleQuoted ?? singleQuoted ?? unquoted
    const mediaCondition = String(media ?? '').trim()
    if (/\b(?:layer(?:\s*\(|\b)|supports\s*\()/i.test(mediaCondition)) {
      assertExternalPolicy(raw, state)
      retainUnsupported(raw, 'CSS @import 条件', state)
      return `@import "${raw}" ${mediaCondition};`
    }
    const resource = readResource(baseDir, raw, state, true)
    if (!resource) {
      return match
    }
    const inlinedCss = inlineCssResources(removeSourceMaps(resource.text, state), dirname(resource.path), state)
    return mediaCondition ? `@media ${mediaCondition} { ${inlinedCss} }` : inlinedCss
  })
  next = next.replace(CSS_URL_PATTERN, (match, _quote, raw) => {
    const data = readDataUri(baseDir, raw, state)
    return data ? `url("${data}")` : match
  })
  return next
}

function wrapCssWithMedia(css: string, attrs: string): string {
  const media = attrs.match(/\bmedia\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i)
  const mediaCondition = media ? (media[1] ?? media[2] ?? media[3] ?? '').trim() : ''
  return mediaCondition ? `@media ${mediaCondition} { ${css} }` : css
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function inlineSrcset(baseDir: string, raw: string, state: BundleState): string {
  return raw.split(',').map((part) => {
    const trimmed = part.trim()
    const [url, ...descriptors] = trimmed.split(/\s+/)
    const data = readDataUri(baseDir, url, state)
    return [data ?? url, ...descriptors].join(' ')
  }).join(', ')
}

function assertNoUnhandledExternalReferences(html: string, state: BundleState): void {
  if (state.externalPolicy !== 'fail') {
    return
  }
  const masked = maskScriptBlocks(html)
  for (const tagMatch of masked.html.matchAll(HTML_TAG_PATTERN)) {
    const tag = tagMatch[0]
    for (const match of tag.matchAll(HTML_URL_ATTR_PATTERN)) {
      assertExternalPolicy(match[1] ?? match[2] ?? match[3] ?? '', state)
    }
    for (const match of tag.matchAll(HTML_SRCSET_ATTR_PATTERN)) {
      for (const part of (match[1] ?? match[2] ?? match[3] ?? '').split(',')) {
        assertExternalPolicy(part.trim().split(/\s+/)[0] ?? '', state)
      }
    }
  }
}

function warnUnhandledStaticReferences(html: string, state: BundleState): void {
  const masked = maskScriptBlocks(html)
  for (const tagMatch of masked.html.matchAll(HTML_TAG_PATTERN)) {
    const tag = tagMatch[0]
    for (const match of tag.matchAll(HTML_URL_ATTR_PATTERN)) {
      retainRemainingStaticReference(match[1] ?? match[2] ?? match[3] ?? '', state)
    }
    for (const match of tag.matchAll(HTML_SRCSET_ATTR_PATTERN)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? ''
      if (stripUrlSuffix(raw).startsWith('data:')) {
        continue
      }
      for (const part of raw.split(',')) {
        retainRemainingStaticReference(part.trim().split(/\s+/)[0] ?? '', state)
      }
    }
  }
}

function retainRemainingStaticReference(raw: string, state: BundleState): void {
  const clean = stripUrlSuffix(raw)
  if (!clean || clean.startsWith('data:') || clean.startsWith('#') || state.retainedUnsupportedUrls.has(clean)) {
    return
  }
  if (isExternalUrl(clean) || clean.startsWith('//')) {
    assertExternalPolicy(clean, state)
    retainUnsupported(clean, clean.startsWith('//') ? '协议相对 URL' : '外部 URL', state)
    return
  }
  retainUnsupported(clean, '未内联本地静态引用', state)
}

function readResource(baseDir: string, raw: string, state: BundleState, text: boolean): { path: string, text: string } | undefined {
  const path = resolveResourcePath(baseDir, raw, state)
  if (!path) {
    return undefined
  }
  if (!checkResourceBudget(path, raw, state, text)) {
    return undefined
  }
  state.inlinedResources += state.seen.has(path) ? 0 : 1
  state.seen.add(path)
  return { path, text: readFileSync(path, 'utf8') }
}

function readDataUri(baseDir: string, raw: string, state: BundleState): string | undefined {
  const path = resolveResourcePath(baseDir, raw, state)
  if (!path) {
    return undefined
  }
  if (!checkResourceBudget(path, raw, state, false)) {
    return undefined
  }
  state.inlinedResources += state.seen.has(path) ? 0 : 1
  state.seen.add(path)
  const mediaType = mediaTypeForPath(path)
  return `data:${mediaType};base64,${readFileSync(path).toString('base64')}`
}

function resolveResourcePath(baseDir: string, raw: string, state: BundleState): string | undefined {
  const clean = stripUrlSuffix(raw)
  if (!clean || clean.startsWith('data:') || clean.startsWith('#')) {
    return undefined
  }
  if (isExternalUrl(clean) || clean.startsWith('//')) {
    assertExternalPolicy(clean, state)
    const kind = clean.startsWith('//') ? '协议相对 URL' : '外部 URL'
    retainUnsupported(clean, kind, state)
    return undefined
  }

  const resolved = isAbsolute(clean)
    ? resolve(state.worktree, clean.replace(/^[/\\]+/, ''))
    : resolve(baseDir, clean)
  assertSafeExistingFile(state.worktree, resolved, `资源 ${raw}`)
  if (lstatSync(resolved).isDirectory()) {
    throw new HtmlBundleError(`资源不能是目录：${raw}`)
  }
  return resolved
}

function assertExternalPolicy(raw: string, state: BundleState): void {
  const clean = stripUrlSuffix(raw)
  if (!clean || clean.startsWith('data:') || clean.startsWith('#')) {
    return
  }
  if (isExternalUrl(clean) || clean.startsWith('//')) {
    if (state.externalPolicy === 'fail') {
      throw new HtmlBundleError(`发现外部资源且策略为 fail：${clean}`)
    }
  }
}

function checkResourceBudget(path: string, raw: string, state: BundleState, required: boolean): boolean {
  const size = statSync(path).size
  const nextTotal = state.seen.has(path) ? state.totalResourceBytes : state.totalResourceBytes + size
  if (size > state.maxResourceBytes || nextTotal > state.maxTotalResourceBytes) {
    const message = `资源超过内联预算，已保留原引用：${raw}`
    if (required) {
      throw new HtmlBundleError(message)
    }
    state.retainedResources += 1
    state.warnings.push(message)
    return false
  }
  if (!state.seen.has(path)) {
    state.totalResourceBytes = nextTotal
  }
  return true
}

function warnRuntimeOnlyPatterns(html: string, state: BundleState): string {
  const patterns = [
    [/\bfetch\s*\(/, '检测到运行时 fetch()，工具不会改写运行时网络加载。'],
    [/\bimport\s*\(/, '检测到动态 import()，工具不会改写运行时懒加载。'],
    [/\.wasm\b/i, '检测到 WASM 引用，首版不会专门内联 WASM 运行时加载。'],
    [/rel=(['"]?)(?:preload|prefetch)\1/i, '检测到 preload/prefetch，首版仅保留原语义并标记 partial。'],
    [/Content-Security-Policy/i, '检测到 CSP 相关内容，内联后可能需要调用方自行调整策略。'],
  ] as const
  for (const [pattern, warning] of patterns) {
    if (pattern.test(html)) {
      state.warnings.push(warning)
    }
  }
  return html
}

function retainUnsupported(raw: string, kind: string, state: BundleState): void {
  state.retainedUnsupportedUrls.add(stripUrlSuffix(raw))
  state.retainedResources += 1
  state.warnings.push(`${kind} 已保留未内联：${raw}`)
}

function stripUrlSuffix(raw: string): string {
  return raw.trim().split('#')[0]?.split('?')[0] ?? ''
}

function isExternalUrl(raw: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[a-z]:[\\/]/i.test(raw)
}

function mediaTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    case '.ttf': return 'font/ttf'
    case '.otf': return 'font/otf'
    case '.css': return 'text/css'
    case '.js':
    case '.mjs': return 'text/javascript'
    default: return INLINE_TEXT_EXTENSIONS.has(extname(path).toLowerCase()) ? 'text/plain' : 'application/octet-stream'
  }
}
