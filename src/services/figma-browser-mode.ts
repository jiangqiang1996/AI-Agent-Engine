import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { FigmaAssetManifest, FigmaAssetToolArgs } from '../schemas/figma-asset-schema.js'
import type { ParsedFigmaSource } from './figma-source-utils.js'
import { normalizeNodeId } from './figma-source-utils.js'
import { buildFigmaSource, buildManifestItem, createRunSalt, hashSourceId } from './figma-manifest-repo.js'
import { createUniqueFileName, FigmaAssetError } from './figma-result-formatter.js'
import { FIGMA_EXPORT_URLS_SCRIPT_ID } from './figma-browser-eval-scripts.js'
import {
  classifyFigmaPageState,
  defaultFigmaAgentBrowserRunner,
  hashPrefix,
  type BrowserDiscoveryResult,
  type FigmaAgentBrowserRunner,
} from './figma-agent-browser-runner.js'
import {
  MAX_BROWSER_DOWNLOAD_BYTES,
  MAX_BROWSER_TOTAL_DOWNLOAD_BYTES,
  validateBrowserContentType,
  validateBrowserResourceUrl,
} from './figma-browser-resource-policy.js'
import { isSetupCompleted } from './setup-proof-service.js'

export interface BrowserModeOptions {
  runner?: FigmaAgentBrowserRunner
  sessionId?: string
}

export interface BrowserModeResult {
  manifest: FigmaAssetManifest
  error?: FigmaAssetError
}

export async function runBrowserMode(
  args: FigmaAssetToolArgs,
  parsed: ParsedFigmaSource,
  workspaceRoot: string,
  runId: string,
  runAssetsDir: string,
  options: BrowserModeOptions = {},
): Promise<BrowserModeResult> {
  const runner = options.runner ?? defaultFigmaAgentBrowserRunner
  const fileKey = args.fileKey ?? parsed.fileKey
  const nodeId = normalizeNodeId(args.nodeId ?? parsed.nodeId)
  const pageUrl = validateFigmaBrowserPageUrl(args.source)
  const runSalt = createRunSalt()
  const startedAt = new Date().toISOString()
  const browserSessionId = `figma-assets-${runId}`
  const evidenceBase = {
    agentBrowserUsed: true,
    saved: false as const,
    types: [],
    paths: [],
    savedLocalEvidence: false,
    evidenceTypes: [],
    experimental: true,
    browserSessionIdHash: hashPrefix(browserSessionId),
    pageUrlHash: pageUrl ? hashPrefix(pageUrl) : undefined,
  }
  let manifestResult: BrowserModeResult | undefined
  let mainError: FigmaAssetError | undefined

  if (!options.sessionId || !isSetupCompleted(workspaceRoot, options.sessionId)) {
    throw new FigmaAssetError('请先执行 /ae-setup，完成当前会话的浏览器能力环境检查。', 'setup_not_completed')
  }
  if (!nodeId) {
    throw new FigmaAssetError('browser 模式需要 node-id。请在已打开的 Figma 页面中右键目标节点 → 复制链接。', 'missing_node_id')
  }

  try {
    await runner.open(browserSessionId, pageUrl)
    const snapshot = await runner.snapshotInteractive(browserSessionId)
    const pageState = classifyFigmaPageState(snapshot)
    if (pageState !== 'node_exportable') {
      throw new FigmaAssetError(messageForPageState(pageState), pageState)
    }

    const discovery = await runner.discoverResources(browserSessionId, pageUrl, nodeId, FIGMA_EXPORT_URLS_SCRIPT_ID)
    validateDiscovery(discovery, browserSessionId, pageUrl, nodeId)
    if (discovery.resourceUrls.length === 0) {
      throw new FigmaAssetError('未发现可下载的浏览器资源 URL，请重新执行或尝试 mode: collect 手动导出。', 'browser_resource_discovery_failed')
    }
    if (discovery.resourceUrls.length > 1) {
      throw new FigmaAssetError('发现多个候选浏览器资源，无法证明目标节点归属，请尝试 mode: collect 手动导出。', 'browser_resource_ambiguous')
    }

    const warnings: FigmaAssetManifest['warnings'] = []
    const assets: FigmaAssetManifest['assets'] = []
    const usedFileNames = new Set<string>()
    let totalBytes = 0
    let sourceType: 'cdn_direct' | 's3_presigned' | 'unknown' = 'unknown'

    for (const resourceUrl of discovery.resourceUrls) {
      const validation = validateBrowserResourceUrl(resourceUrl)
      sourceType = validation.sourceType
      const download = await browserDownloadResource(validation.url, totalBytes)
      totalBytes += download.bytes.byteLength
      const content = validateBrowserContentType(validation.url, download.contentType)
      warnings.push(...content.warnings)
      const sourceIdHash = hashSourceId(`${nodeId}:${assets.length}`, runSalt)
      const fileName = createUniqueFileName(`${sourceIdHash}.${content.format}`, usedFileNames)
      const assetPath = join(runAssetsDir, fileName)
      await writeFile(assetPath, download.bytes)
      assets.push(await buildManifestItem(workspaceRoot, assetPath, sourceIdHash, content.format))
    }

    const completedAt = new Date().toISOString()
    manifestResult = {
      manifest: {
        schemaVersion: 2,
        mode: 'browser',
        runId,
        startedAt,
        completedAt,
        status: 'success',
        source: buildBrowserSource(parsed.redactedSource, fileKey, [nodeId], runSalt),
        evidence: {
          ...evidenceBase,
          browserAuthStatus: 'node_exportable',
          downloadSourceType: sourceType,
          discoveryScriptId: discovery.scriptId,
          discoveryCapturedAt: discovery.capturedAt,
          discoveryEventType: discovery.eventType,
        },
        warnings,
        failures: [],
        assets,
      },
    }
    return manifestResult
  } catch (error) {
    const figmaError = error instanceof FigmaAssetError
      ? error
      : new FigmaAssetError('browser 模式执行失败，请尝试 mode: collect 手动导出。', 'browser_mode_failed')
    mainError = figmaError
    manifestResult = {
      manifest: {
        schemaVersion: 2,
        mode: 'browser',
        runId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'failed',
        source: buildBrowserSource(parsed.redactedSource, fileKey, nodeId ? [nodeId] : [], runSalt),
        evidence: { ...evidenceBase, failureCode: figmaError.code },
        warnings: [],
        failures: [{ code: figmaError.code, message: figmaError.message }],
        assets: [],
      },
      error: figmaError,
    }
    return manifestResult
  } finally {
    try {
      await runner.close(browserSessionId)
    } catch (error) {
      const cleanupError = error instanceof FigmaAssetError
        ? error
        : new FigmaAssetError('agent-browser session 关闭失败，请检查是否存在遗留浏览器会话。', 'browser_session_close_failed')
      if (manifestResult) {
        manifestResult.manifest.warnings.push({ code: cleanupError.code, message: cleanupError.message })
        if (!mainError && manifestResult.manifest.status === 'success') {
          manifestResult.manifest.status = 'failed'
          manifestResult.manifest.failures.push({ code: cleanupError.code, message: cleanupError.message })
          manifestResult.error = cleanupError
        }
      }
    }
  }
}

async function browserDownloadResource(url: URL, currentTotalBytes: number): Promise<{ bytes: Buffer; contentType: string | null }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal })
    if (response.status >= 300 && response.status < 400) {
      throw new FigmaAssetError('浏览器资源下载不允许自动跟随重定向。', 'download_redirect_not_allowed')
    }
    if (response.status === 403 && response.headers.has('set-cookie')) {
      throw new FigmaAssetError('资源需要浏览器认证，请尝试 mode: collect 手动导出。', 'browser_resource_requires_auth')
    }
    if (response.status === 403 || response.status === 404) {
      throw new FigmaAssetError('资源 URL 已过期，请重新执行 browser 模式。', 'expired_browser_resource_url')
    }
    if (!response.ok) {
      throw new FigmaAssetError('浏览器资源下载失败，请尝试 mode: collect 手动导出。', 'download_failed')
    }
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BROWSER_DOWNLOAD_BYTES) {
      throw new FigmaAssetError('浏览器资源超过单文件大小上限。', 'download_too_large')
    }
    const bytes = await readLimitedResponseBody(response, currentTotalBytes)
    return { bytes, contentType: response.headers.get('content-type') }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new FigmaAssetError('浏览器资源下载超时，请尝试 mode: collect 手动导出。', 'download_timeout')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function validateDiscovery(discovery: BrowserDiscoveryResult, sessionId: string, pageUrl: string, nodeId: string): void {
  if (discovery.sessionIdHash !== hashPrefix(sessionId)
    || discovery.pageUrlHash !== hashPrefix(pageUrl)
    || discovery.targetNodeId !== nodeId
    || discovery.targetBinding !== 'target_export'
    || normalizeNodeId(new URL(pageUrl).searchParams.get('node-id') ?? undefined) !== nodeId) {
    throw new FigmaAssetError('浏览器资源发现结果与本轮页面或节点不匹配，请重新执行。', 'browser_resource_discovery_failed')
  }
}

async function readLimitedResponseBody(response: Response, currentTotalBytes: number): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BROWSER_DOWNLOAD_BYTES) {
      throw new FigmaAssetError('浏览器资源超过单文件大小上限。', 'download_too_large')
    }
    if (currentTotalBytes + arrayBuffer.byteLength > MAX_BROWSER_TOTAL_DOWNLOAD_BYTES) {
      throw new FigmaAssetError('本次 browser 下载总量超过上限。', 'total_download_limit_exceeded')
    }
    return Buffer.from(arrayBuffer)
  }

  const chunks: Buffer[] = []
  let total = 0
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      total += value.byteLength
      if (total > MAX_BROWSER_DOWNLOAD_BYTES) {
        await reader.cancel()
        throw new FigmaAssetError('浏览器资源超过单文件大小上限。', 'download_too_large')
      }
      if (currentTotalBytes + total > MAX_BROWSER_TOTAL_DOWNLOAD_BYTES) {
        await reader.cancel()
        throw new FigmaAssetError('本次 browser 下载总量超过上限。', 'total_download_limit_exceeded')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

function validateFigmaBrowserPageUrl(source: string | undefined): string {
  if (!source) {
    throw new FigmaAssetError('browser 模式需要提供 Figma 页面 URL。', 'missing_source')
  }

  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new FigmaAssetError('browser 模式仅支持 Figma 页面 URL。', 'invalid_figma_browser_url')
  }

  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || (host !== 'figma.com' && host !== 'www.figma.com')
    || !/^\/(design|file)\/[^/]+\//.test(url.pathname)) {
    throw new FigmaAssetError('browser 模式仅支持 https://www.figma.com/design 或 /file 页面 URL。', 'invalid_figma_browser_url')
  }

  return url.toString()
}

function buildBrowserSource(redactedSource: string | undefined, fileKey: string | undefined, nodeIds: string[], runSalt: string) {
  const source = buildFigmaSource(redactedSource, fileKey, nodeIds, runSalt)
  return source ? { ...source, type: 'browser_page' as const } : undefined
}

function messageForPageState(pageState: string): string {
  switch (pageState) {
    case 'login_required': return 'Figma 页面仍需登录，请在浏览器中完成登录后重试。'
    case 'access_denied': return '当前账号无权访问该 Figma 文件，请申请权限或尝试 mode: collect 手动导出。'
    case 'file_not_found': return 'Figma 文件不存在，请确认 URL 是否正确。'
    case 'page_load_failed': return 'Figma 页面加载失败，请检查网络后重试。'
    default: return '无法识别 Figma 页面状态，请尝试 mode: collect 手动导出。'
  }
}
