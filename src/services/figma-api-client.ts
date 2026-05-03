import { readFile } from 'node:fs/promises'

import { FigmaAssetError } from './figma-result-formatter.js'
import { resolveExistingWorkspacePath } from './figma-path-safety.js'
import type { FigmaAssetToolArgs, AuthMode } from '../schemas/figma-asset-schema.js'

export type { AuthMode }

const ENV_ALLOWLIST = ['FIGMA_OAUTH_TOKEN', 'FIGMA_API_KEY', 'FIGMA_TOKEN'] as const

const DEFAULT_TOKEN_PRIORITY = [
  'FIGMA_OAUTH_TOKEN',
  'FIGMA_API_KEY',
  'FIGMA_TOKEN',
] as const

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'figma-alpha-api.s3.us-west-2.amazonaws.com',
  'figma.com',
  'www.figma.com',
  'cdn.figmausercontent.com',
])
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 30_000

export { MAX_DOWNLOAD_BYTES }

interface FigmaImagesResponse {
  images?: Record<string, string | null>
  err?: string | null
}

interface ResolvedAuth {
  token: string
  mode: AuthMode
  source: string
}

export async function resolveAuth(args: FigmaAssetToolArgs, workspaceRoot: string): Promise<ResolvedAuth> {
  if (args.token) {
    throw new FigmaAssetError(
      '直接传入 token 参数已弃用。请通过 tokenEnv 或 envFile 提供令牌：例如设置 FIGMA_OAUTH_TOKEN 环境变量或在 envFile 中写入 FIGMA_API_KEY=xxx。',
      'token_param_deprecated',
    )
  }

  const tokenEnv = args.tokenEnv
  if (tokenEnv && !isAllowedTokenEnv(tokenEnv)) {
    throw new FigmaAssetError('tokenEnv 只允许使用 FIGMA_OAUTH_TOKEN、FIGMA_API_KEY 或 FIGMA_TOKEN。', 'invalid_token_env')
  }

  let envFileEntries: Map<string, string> | undefined
  if (args.envFile) {
    envFileEntries = await parseEnvFileAllowlisted(workspaceRoot, args.envFile)
  }

  if (tokenEnv) {
    const fromProcess = process.env[tokenEnv]
    if (fromProcess) {
      return { token: fromProcess, mode: classifyAuthMode(tokenEnv), source: `env:${tokenEnv}` }
    }
    if (envFileEntries) {
      const fromFile = envFileEntries.get(tokenEnv)
      if (fromFile) {
        return { token: fromFile, mode: classifyAuthMode(tokenEnv), source: 'envFile' }
      }
    }
    throw new FigmaAssetError(`未在 ${tokenEnv} 环境变量或 envFile 中找到 Figma 访问令牌。`, 'missing_token')
  }

  for (const key of DEFAULT_TOKEN_PRIORITY) {
    const fromProcess = process.env[key]
    if (fromProcess) {
      return { token: fromProcess, mode: classifyAuthMode(key), source: `env:${key}` }
    }
    if (envFileEntries) {
      const fromFile = envFileEntries.get(key)
      if (fromFile) {
        return { token: fromFile, mode: classifyAuthMode(key), source: 'envFile' }
      }
    }
  }

  throw new FigmaAssetError(
    '未找到 Figma 访问令牌。请通过环境变量 FIGMA_OAUTH_TOKEN、FIGMA_API_KEY 或 FIGMA_TOKEN 提供，或使用 envFile 参数指定 dotenv 文件。',
    'missing_token',
  )
}

function classifyAuthMode(key: string): AuthMode {
  if (key === 'FIGMA_OAUTH_TOKEN') return 'oauth'
  if (key === 'FIGMA_API_KEY') return 'api_key'
  return 'legacy'
}

function isAllowedTokenEnv(key: string): key is typeof ENV_ALLOWLIST[number] {
  return (ENV_ALLOWLIST as readonly string[]).includes(key)
}

async function parseEnvFileAllowlisted(workspaceRoot: string, envFilePath: string): Promise<Map<string, string>> {
  const resolvedPath = await resolveExistingWorkspacePath(workspaceRoot, envFilePath)
  const content = await readFile(resolvedPath, 'utf8')
  const result = new Map<string, string>()
  const allowSet = new Set<string>(ENV_ALLOWLIST)
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
    if (!allowSet.has(name)) {
      continue
    }
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (value) {
      result.set(name, value)
    }
  }
  return result
}

export function buildAuthHeaders(token: string, mode: AuthMode): Record<string, string> {
  if (mode === 'oauth') {
    return { Authorization: `Bearer ${token}` }
  }
  return { 'X-Figma-Token': token }
}

export async function requestFigmaImageUrl(
  fileKey: string,
  nodeId: string,
  format: string,
  scale: number,
  token: string,
  mode: AuthMode,
): Promise<string> {
  const url = new URL(`https://api.figma.com/v1/images/${encodeURIComponent(fileKey)}`)
  url.searchParams.set('ids', nodeId)
  url.searchParams.set('format', format)
  url.searchParams.set('scale', String(scale))

  const headers = buildAuthHeaders(token, mode)
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const code = classifyApiError(response.status)
    const hint = userHintForApiError(code)
    throw new FigmaAssetError(`Figma API 请求失败：${hint}`, code)
  }
  const body = await response.json() as FigmaImagesResponse
  if (body.err) {
    throw new FigmaAssetError('Figma API 返回错误，请检查 fileKey 和节点 ID。', 'figma_api_error')
  }
  if (!body.images || Object.keys(body.images).length === 0) {
    throw new FigmaAssetError('Figma API 未返回图片映射。请确认节点 ID 是否可导出，或改用 collect 模式手动导出。', 'empty_images')
  }
  const imageUrl = body.images[nodeId]
  if (!imageUrl) {
    throw new FigmaAssetError('Figma API 未返回该节点的图片 URL。请确认节点 ID 是否正确，或使用 collect 模式手动导出。', 'empty_download_url')
  }
  return imageUrl
}

function classifyApiError(status: number): string {
  switch (status) {
    case 401: return 'auth_expired'
    case 403: return 'access_denied'
    case 404: return 'not_found'
    case 429: return 'rate_limited'
    default: return 'figma_api_failed'
  }
}

function userHintForApiError(code: string): string {
  switch (code) {
    case 'auth_expired': return '认证已过期或无效，请更换 Figma 令牌后重试。'
    case 'access_denied': return '无权访问该文件，请确认令牌权限或申请文件访问。'
    case 'not_found': return '文件或节点不存在，请确认 fileKey 和 nodeId 是否正确。'
    case 'rate_limited': return '请求过于频繁，请稍后重试。'
    default: return `HTTP 错误，请检查参数后重试。`
  }
}

export async function downloadImageBytes(imageUrl: string): Promise<Buffer> {
  const url = new URL(imageUrl)
  if (!isAllowedDownloadUrl(url)) {
    throw new FigmaAssetError('Figma 图片下载 URL 不在允许的 HTTPS 域名范围内。', 'unsafe_download_url')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { redirect: 'manual', signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new FigmaAssetError('图片下载超时，请稍后重试或改用 collect 模式。', 'download_timeout')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
  if (response.status >= 300 && response.status < 400) {
    throw new FigmaAssetError('图片下载不允许自动跟随重定向。', 'download_redirect_not_allowed')
  }
  if (!response.ok) {
    throw new FigmaAssetError('图片下载失败，请稍后重试。', 'download_failed')
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

export function isAllowedDownloadUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.port === ''
    && !host.endsWith('.')
    && !isLocalOrPrivateHost(host)
    && ALLOWED_DOWNLOAD_HOSTS.has(host)
}

function isLocalOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '::1' || host === '[::1]') {
    return true
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const normalized = host.slice(1, -1).toLowerCase()
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
  }
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [first, second] = parts
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
}
