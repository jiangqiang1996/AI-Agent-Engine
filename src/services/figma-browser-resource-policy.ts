import { extname } from 'node:path'

import { FigmaAssetError } from './figma-result-formatter.js'

export const MAX_BROWSER_DOWNLOAD_BYTES = 25 * 1024 * 1024
export const MAX_BROWSER_TOTAL_DOWNLOAD_BYTES = 100 * 1024 * 1024

const ALLOWED_BROWSER_RESOURCE_HOSTS = new Set([
  'cdn.figmausercontent.com',
  'figma-alpha-api.s3.us-west-2.amazonaws.com',
  's3-alpha-sig.figma.com',
])

const CONTENT_TYPE_TO_EXTENSION = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['application/pdf', 'pdf'],
])

export interface BrowserResourceValidation {
  url: URL
  sourceType: 'cdn_direct' | 's3_presigned'
}

export interface ContentTypeValidation {
  format: string
  warnings: Array<{ code: string; message: string }>
}

export function validateBrowserResourceUrl(rawUrl: string): BrowserResourceValidation {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new FigmaAssetError('浏览器发现的资源 URL 无效，请尝试 mode: collect 手动导出。', 'unsafe_browser_resource_url')
  }

  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.port !== ''
    || host.endsWith('.')
    || isLocalOrPrivateHost(host)
    || !ALLOWED_BROWSER_RESOURCE_HOSTS.has(host)) {
    throw new FigmaAssetError('浏览器发现的资源 URL 不在安全 allowlist 中，请尝试 mode: collect 手动导出。', 'unsafe_browser_resource_url')
  }

  return {
    url,
    sourceType: host.includes('s3') ? 's3_presigned' : 'cdn_direct',
  }
}

export function validateBrowserContentType(url: URL, contentTypeHeader: string | null): ContentTypeValidation {
  const contentType = normalizeContentType(contentTypeHeader)
  const format = CONTENT_TYPE_TO_EXTENSION.get(contentType)
  if (!format) {
    throw new FigmaAssetError('浏览器资源 Content-Type 不在允许范围内，请尝试 mode: collect 手动导出。', 'invalid_content_type')
  }

  const extension = extname(url.pathname).slice(1).toLowerCase()
  if (extension && !isCompatibleExtension(extension, format)) {
    throw new FigmaAssetError('浏览器资源 Content-Type 与扩展名不匹配，请尝试 mode: collect 手动导出。', 'content_type_extension_mismatch')
  }

  return {
    format,
    warnings: contentType === 'application/pdf'
      ? [{ code: 'pdf_active_content_risk', message: 'PDF 可能包含主动内容，请仅打开可信来源文件。' }]
      : [],
  }
}

function normalizeContentType(value: string | null): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? ''
}

function isCompatibleExtension(extension: string, format: string): boolean {
  return extension === format || (format === 'jpg' && extension === 'jpeg')
}

function isLocalOrPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '::1' || host === '[::1]') {
    return true
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
