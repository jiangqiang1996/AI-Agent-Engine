import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, parse, relative, resolve } from 'node:path'

import {
  FigmaAssetManifestSchema,
  type FigmaAssetManifest,
  type FigmaAssetManifestItem,
  type FigmaAssetToolArgs,
} from '../schemas/figma-asset-schema.js'
import { isInsideRoot, toRepoRelativePath } from '../utils/path-utils.js'

const DEFAULT_OUTPUT_DIR = '.figma'
const DEFAULT_TOKEN_ENV = 'FIGMA_TOKEN'
const ALLOWED_MANUAL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'])
const ALLOWED_DOWNLOAD_HOSTS = new Set(['figma-alpha-api.s3.us-west-2.amazonaws.com'])
const ALLOWED_DOWNLOAD_SUFFIXES = ['.figma.com', '.figma.net', '.figmausercontent.com']
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024

interface ParsedFigmaSource {
  fileKey?: string
  nodeId?: string
  redactedSource?: string
}

interface FigmaImagesResponse {
  images?: Record<string, string | null>
  err?: string | null
}

export class FigmaAssetError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'FigmaAssetError'
  }
}

export async function runFigmaAssetTool(args: FigmaAssetToolArgs, workspaceRoot: string): Promise<string> {
  const parsed = parseFigmaSource(args.source)
  const outputRoot = await resolveWorkspacePath(workspaceRoot, args.outputDir ?? DEFAULT_OUTPUT_DIR)
  await ensureSafeOutputRoot(workspaceRoot, outputRoot)

  if (args.mode === 'validate') {
    return validateLatestManifest(workspaceRoot, outputRoot)
  }

  const runId = createRunId()
  const runRoot = join(outputRoot, 'runs', runId)
  const runAssetsDir = join(runRoot, 'assets')
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, runAssetsDir)
  await mkdir(runAssetsDir, { recursive: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, runAssetsDir)

  const manifest = args.mode === 'collect'
    ? await collectManualAssets(args, parsed, workspaceRoot, outputRoot, runId, runAssetsDir)
    : await downloadApiAssets(args, parsed, workspaceRoot, outputRoot, runId, runAssetsDir)

  await writeManifests(workspaceRoot, outputRoot, runRoot, manifest)
  return formatSummary(manifest, workspaceRoot, outputRoot)
}

function parseFigmaSource(source?: string): ParsedFigmaSource {
  if (!source) {
    return {}
  }

  try {
    const url = new URL(source)
    if (!isFigmaHost(url.hostname)) {
      return {}
    }
    const fileKey = url.pathname.match(/\/file\/([^/]+)|\/design\/([^/]+)/)?.slice(1).find(Boolean)
    const nodeId = url.searchParams.get('node-id') ?? undefined
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return { fileKey, nodeId, redactedSource: url.toString() }
  } catch {
    return {}
  }
}

async function downloadApiAssets(
  args: FigmaAssetToolArgs,
  parsed: ParsedFigmaSource,
  workspaceRoot: string,
  outputRoot: string,
  runId: string,
  runAssetsDir: string,
): Promise<FigmaAssetManifest> {
  const fileKey = args.fileKey ?? parsed.fileKey
  const nodeId = normalizeNodeId(args.nodeId ?? parsed.nodeId)
  if (!fileKey) {
    throw new FigmaAssetError('API 模式需要提供 fileKey，或提供可解析 fileKey 的 Figma URL。', 'missing_file_key')
  }
  if (!nodeId) {
    throw new FigmaAssetError('API 模式需要提供 nodeId，或提供包含 node-id 参数的 Figma URL。', 'missing_node_id')
  }

  const token = await resolveToken(args, workspaceRoot)
  const format = args.format ?? 'png'
  const scale = args.scale ?? 1
  const imageUrl = await requestFigmaImageUrl(fileKey, nodeId, format, scale, token)
  const bytes = await downloadImageBytes(imageUrl)
  const safeFileName = `${sanitizeFileName(nodeId)}.${format}`
  const assetPath = join(runAssetsDir, safeFileName)
  await writeFile(assetPath, bytes)

  return {
    version: 1,
    mode: 'api',
    runId,
    createdAt: new Date().toISOString(),
    source: parsed.redactedSource,
    nodeIds: [nodeId],
    assets: [await buildManifestItem(workspaceRoot, assetPath, nodeId, format)],
  }
}

async function collectManualAssets(
  args: FigmaAssetToolArgs,
  parsed: ParsedFigmaSource,
  workspaceRoot: string,
  outputRoot: string,
  runId: string,
  runAssetsDir: string,
): Promise<FigmaAssetManifest> {
  if (!args.manualSourceDir) {
    throw new FigmaAssetError('collect 模式需要提供 manualSourceDir。', 'missing_manual_source_dir')
  }

  const sourceDir = await resolveExistingWorkspacePath(workspaceRoot, args.manualSourceDir)
  if (sourceDir === outputRoot || isInsideRoot(outputRoot, sourceDir)) {
    throw new FigmaAssetError('manualSourceDir 不能位于输出目录内部，避免重复收集。', 'invalid_manual_source_dir')
  }

  const entries = await readdir(sourceDir, { withFileTypes: true })
  const assets: FigmaAssetManifestItem[] = []
  const usedFileNames = new Set<string>()
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const ext = extname(entry.name).toLowerCase()
    if (!ALLOWED_MANUAL_EXTENSIONS.has(ext)) {
      continue
    }
    const sourcePath = join(sourceDir, entry.name)
    await ensureNoSymlink(sourcePath)
    await ensureFileWithinSizeLimit(sourcePath)
    const targetPath = join(runAssetsDir, createUniqueFileName(sanitizeFileName(entry.name), usedFileNames))
    await copyFile(sourcePath, targetPath)
    assets.push(await buildManifestItem(workspaceRoot, targetPath, basename(entry.name, ext), ext.slice(1)))
  }

  if (assets.length === 0) {
    throw new FigmaAssetError('manualSourceDir 中没有可收集的图片素材。', 'no_manual_assets')
  }

  return {
    version: 1,
    mode: 'collect',
    runId,
    createdAt: new Date().toISOString(),
    source: parsed.redactedSource,
    nodeIds: assets.map((asset) => asset.nodeId),
    assets,
  }
}

async function resolveToken(args: FigmaAssetToolArgs, workspaceRoot: string): Promise<string> {
  if (args.token) {
    return args.token
  }

  const tokenEnv = args.tokenEnv ?? DEFAULT_TOKEN_ENV
  if (!/^FIGMA_[A-Z0-9_]*$/.test(tokenEnv)) {
    throw new FigmaAssetError('tokenEnv 只允许使用 FIGMA_ 前缀的环境变量。', 'invalid_token_env')
  }
  if (process.env[tokenEnv]) {
    return process.env[tokenEnv]
  }

  if (args.envFile) {
    const envPath = await resolveExistingWorkspacePath(workspaceRoot, args.envFile)
    const envContent = await readFile(envPath, 'utf8')
    const token = parseEnvValue(envContent, tokenEnv)
    if (token) {
      return token
    }
  }

  throw new FigmaAssetError(`未找到 Figma 访问令牌。请通过 token、${tokenEnv} 或 envFile 提供。`, 'missing_token')
}

function parseEnvValue(content: string, key: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const index = trimmed.indexOf('=')
    if (index < 0) {
      continue
    }
    const name = trimmed.slice(0, index).trim()
    if (name !== key) {
      continue
    }
    return trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
  }
  return undefined
}

async function requestFigmaImageUrl(
  fileKey: string,
  nodeId: string,
  format: string,
  scale: number,
  token: string,
): Promise<string> {
  const url = new URL(`https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}`)
  url.searchParams.set('ids', nodeId)
  url.searchParams.set('format', format)
  url.searchParams.set('scale', String(scale))

  const response = await fetch(url, { headers: { 'X-Figma-Token': token } })
  if (!response.ok) {
    throw new FigmaAssetError(`Figma API 请求失败：HTTP ${response.status}。`, 'figma_api_failed')
  }
  const body = await response.json() as FigmaImagesResponse
  if (body.err) {
    throw new FigmaAssetError(`Figma API 返回错误：${body.err}`, 'figma_api_error')
  }
  const imageUrl = body.images?.[nodeId]
  if (!imageUrl) {
    throw new FigmaAssetError('Figma API 未返回该节点的图片 URL。', 'missing_image_url')
  }
  return imageUrl
}

async function downloadImageBytes(imageUrl: string): Promise<Buffer> {
  const url = new URL(imageUrl)
  if (!isAllowedDownloadUrl(url)) {
    throw new FigmaAssetError('Figma 图片下载 URL 不在允许的 HTTPS 域名范围内。', 'unsafe_download_url')
  }

  const response = await fetch(url, { redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    throw new FigmaAssetError('图片下载不允许自动跟随重定向。', 'download_redirect_not_allowed')
  }
  if (!response.ok) {
    throw new FigmaAssetError(`图片下载失败：HTTP ${response.status}。`, 'download_failed')
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_DOWNLOAD_BYTES) {
    throw new FigmaAssetError('图片超过单文件大小上限。', 'download_too_large')
  }
  return readLimitedResponse(response)
}

async function readLimitedResponse(response: Response): Promise<Buffer> {
  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new FigmaAssetError('图片超过单文件大小上限。', 'download_too_large')
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
      if (total > MAX_DOWNLOAD_BYTES) {
        await reader.cancel()
        throw new FigmaAssetError('图片超过单文件大小上限。', 'download_too_large')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

function isAllowedDownloadUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return url.protocol === 'https:' && url.port === '' && (
    ALLOWED_DOWNLOAD_HOSTS.has(host) || isFigmaHost(host)
  )
}

function isFigmaHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return ALLOWED_DOWNLOAD_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
}

async function writeManifests(
  workspaceRoot: string,
  outputRoot: string,
  runRoot: string,
  manifest: FigmaAssetManifest,
): Promise<void> {
  const validated = FigmaAssetManifestSchema.parse(manifest)
  const manifestJson = `${JSON.stringify(validated, null, 2)}\n`
  await writeFile(join(runRoot, 'manifest.json'), manifestJson)

  const latestAssetsDir = join(outputRoot, 'assets')
  await ensureSafePathBeforeDelete(workspaceRoot, latestAssetsDir)
  await rm(latestAssetsDir, { recursive: true, force: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, latestAssetsDir)
  await mkdir(latestAssetsDir, { recursive: true })
  await ensureSafeDirectoryPath(workspaceRoot, outputRoot, latestAssetsDir)
  const latestAssets: FigmaAssetManifestItem[] = []
  for (const asset of validated.assets) {
    const sourcePath = resolve(workspaceRoot, asset.relativePath)
    const targetPath = join(latestAssetsDir, asset.fileName)
    await copyFile(sourcePath, targetPath)
    latestAssets.push(await buildManifestItem(workspaceRoot, targetPath, asset.nodeId, asset.format))
  }

  await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify({ ...validated, assets: latestAssets }, null, 2)}\n`)
}

async function validateLatestManifest(workspaceRoot: string, outputRoot: string): Promise<string> {
  const manifestPath = join(outputRoot, 'manifest.json')
  const manifest = FigmaAssetManifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const mismatches: string[] = []
  for (const asset of manifest.assets) {
    const assetPath = resolve(workspaceRoot, asset.relativePath)
    if (!isInsideRoot(workspaceRoot, assetPath)) {
      mismatches.push(`${asset.relativePath}: 路径不在工作区内`)
      continue
    }
    let actual: FigmaAssetManifestItem
    try {
      await ensureNoSymlink(assetPath)
      actual = await buildManifestItem(workspaceRoot, assetPath, asset.nodeId, asset.format)
    } catch {
      mismatches.push(`${asset.relativePath}: 文件不存在或无法读取`)
      continue
    }
    if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.bytes) {
      mismatches.push(`${asset.relativePath}: checksum 或大小不匹配`)
    }
  }

  if (mismatches.length > 0) {
    return [`# Figma 素材校验失败`, '', ...mismatches.map((item) => `- ${item}`)].join('\n')
  }
  return formatSummary(manifest, workspaceRoot, outputRoot, '校验通过')
}

async function buildManifestItem(
  workspaceRoot: string,
  filePath: string,
  nodeId: string,
  format: string,
): Promise<FigmaAssetManifestItem> {
  await ensureFileWithinSizeLimit(filePath)
  const data = await readFile(filePath)
  return {
    nodeId,
    fileName: basename(filePath),
    relativePath: toRepoRelativePath(workspaceRoot, filePath),
    format,
    bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
}

async function ensureFileWithinSizeLimit(filePath: string): Promise<void> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new FigmaAssetError(`路径不是文件：${filePath}`, 'not_a_file')
  }
  if (fileStat.size > MAX_DOWNLOAD_BYTES) {
    throw new FigmaAssetError('素材超过单文件大小上限。', 'asset_too_large')
  }
}

async function resolveWorkspacePath(workspaceRoot: string, inputPath: string): Promise<string> {
  const resolved = resolve(workspaceRoot, inputPath)
  if (!isInsideRoot(workspaceRoot, resolved)) {
    throw new FigmaAssetError(`路径不在工作区内：${inputPath}`, 'path_outside_workspace')
  }
  await ensureNoSymlinkInExistingAncestors(workspaceRoot, resolved)
  return resolved
}

async function resolveExistingWorkspacePath(workspaceRoot: string, inputPath: string): Promise<string> {
  const resolved = await resolveWorkspacePath(workspaceRoot, inputPath)
  await ensureNoSymlink(resolved)
  const realWorkspace = await realpath(workspaceRoot)
  const realTarget = await realpath(resolved)
  if (!isInsideRoot(realWorkspace, realTarget)) {
    throw new FigmaAssetError(`路径真实位置不在工作区内：${inputPath}`, 'path_outside_workspace')
  }
  return resolved
}

async function ensureSafeOutputRoot(workspaceRoot: string, outputRoot: string): Promise<void> {
  if (!isInsideRoot(workspaceRoot, outputRoot)) {
    throw new FigmaAssetError('输出目录必须位于工作区内。', 'output_outside_workspace')
  }
  await mkdir(outputRoot, { recursive: true })
  await ensureNoSymlink(outputRoot)
  const realWorkspace = await realpath(workspaceRoot)
  const realOutput = await realpath(outputRoot)
  if (!isInsideRoot(realWorkspace, realOutput)) {
    throw new FigmaAssetError('输出目录真实位置必须位于工作区内。', 'output_outside_workspace')
  }
  const outputStat = await stat(outputRoot)
  if (!outputStat.isDirectory()) {
    throw new FigmaAssetError('输出路径必须是目录。', 'output_not_directory')
  }
}

async function ensureSafeDirectoryPath(workspaceRoot: string, baseRoot: string, directoryPath: string): Promise<void> {
  if (!isInsideRoot(baseRoot, directoryPath)) {
    throw new FigmaAssetError('目标目录必须位于输出目录内。', 'path_outside_output')
  }
  await ensureNoSymlinkInExistingAncestors(workspaceRoot, directoryPath)
  try {
    await ensureNoSymlink(directoryPath)
  } catch (error) {
    if (error instanceof FigmaAssetError) {
      throw error
    }
  }

  const realWorkspace = await realpath(workspaceRoot)
  const realBase = await realpath(baseRoot)
  try {
    const realDirectory = await realpath(directoryPath)
    if (!isInsideRoot(realWorkspace, realDirectory) || !isInsideRoot(realBase, realDirectory)) {
      throw new FigmaAssetError('目标目录真实位置必须位于工作区输出目录内。', 'path_outside_output')
    }
  } catch (error) {
    if (error instanceof FigmaAssetError) {
      throw error
    }
  }
}

async function ensureNoSymlink(path: string): Promise<void> {
  const stats = await lstat(path)
  if (stats.isSymbolicLink()) {
    throw new FigmaAssetError(`路径不能是符号链接或重解析点：${path}`, 'unsafe_symlink_path')
  }
}

async function ensureNoSymlinkInExistingAncestors(workspaceRoot: string, targetPath: string): Promise<void> {
  const rel = relative(resolve(workspaceRoot), resolve(targetPath))
  if (!rel || rel.startsWith('..')) {
    return
  }

  let current = resolve(workspaceRoot)
  for (const segment of rel.split(/[\\/]+/)) {
    current = join(current, segment)
    try {
      await ensureNoSymlink(current)
    } catch (error) {
      if (error instanceof FigmaAssetError) {
        throw error
      }
      break
    }
  }
}

async function ensureSafePathBeforeDelete(workspaceRoot: string, targetPath: string): Promise<void> {
  try {
    await resolveExistingWorkspacePath(workspaceRoot, targetPath)
  } catch (error) {
    if (error instanceof FigmaAssetError && error.code === 'path_outside_workspace') {
      throw error
    }
  }
}

function normalizeNodeId(nodeId?: string): string | undefined {
  return nodeId?.replace('-', ':')
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._:-]/g, '_').replace(/:/g, '-')
}

function createUniqueFileName(fileName: string, usedFileNames: Set<string>): string {
  if (!usedFileNames.has(fileName)) {
    usedFileNames.add(fileName)
    return fileName
  }

  const parsed = parse(fileName)
  let index = 2
  while (true) {
    const candidate = `${parsed.name}-${index}${parsed.ext}`
    if (!usedFileNames.has(candidate)) {
      usedFileNames.add(candidate)
      return candidate
    }
    index += 1
  }
}

function createRunId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function formatSummary(
  manifest: FigmaAssetManifest,
  workspaceRoot: string,
  outputRoot: string,
  title = '导出完成',
): string {
  return [
    `# Figma 素材${title}`,
    '',
    `- 模式：${manifest.mode}`,
    `- 运行 ID：${manifest.runId}`,
    `- 素材数量：${manifest.assets.length}`,
    `- 输出目录：${toRepoRelativePath(workspaceRoot, outputRoot)}`,
    `- Manifest：${toRepoRelativePath(workspaceRoot, join(outputRoot, 'manifest.json'))}`,
    '',
    ...manifest.assets.map((asset) => `- ${asset.relativePath} (${asset.bytes} bytes, sha256:${asset.sha256.slice(0, 12)}...)`),
  ].join('\n')
}

export function formatFigmaAssetError(error: unknown): string {
  if (error instanceof FigmaAssetError) {
    return `Figma 素材处理失败：${error.message}`
  }
  if (error instanceof Error) {
    return `Figma 素材处理失败：${error.message}`
  }
  return 'Figma 素材处理失败：未知错误。'
}
