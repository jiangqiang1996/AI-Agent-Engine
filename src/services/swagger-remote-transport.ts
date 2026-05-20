import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'

import { SwaggerError } from './swagger-errors.js'
import { assertPublicRemoteAddress, validateRemoteUrl } from './swagger-remote-policy.js'

export interface RemoteTransportResponse {
  url: URL
  statusCode: number
  headers: http.IncomingHttpHeaders
  body: Buffer
}

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 10_000
const DNS_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

async function selectAddress(hostname: string): Promise<string> {
  let timeout: NodeJS.Timeout | undefined
  const records = await Promise.race([
    dns.lookup(hostname, { all: true }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        reject(new SwaggerError('remote_timeout', '远程 DNS 解析超时：请稍后重试或使用本地 JSON 文件。'))
      }, DNS_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout)
    }
  })
  const record = records.find((item) => {
    try {
      assertPublicRemoteAddress(item.address)
      return true
    } catch {
      return false
    }
  })
  if (!record) {
    throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：DNS 解析结果不允许访问。')
  }
  return record.address
}

function requestOnce(url: URL, address: string): Promise<RemoteTransportResponse> {
  const client = url.protocol === 'https:' ? https : http
  const headers = { Host: url.host, Accept: 'application/json' }

  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: unknown) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }
    const done = (response: RemoteTransportResponse) => {
      if (!settled) {
        settled = true
        resolve(response)
      }
    }

    const req = client.request({
      protocol: url.protocol,
      host: address,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers,
      servername: url.hostname,
      timeout: TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = []
      let received = 0
      const contentLength = Number(res.headers['content-length'])
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
        req.destroy(new SwaggerError('remote_response_too_large', '远程响应过大：请提供更小的 Swagger/OpenAPI JSON。'))
        return
      }
      res.on('data', (chunk: Buffer) => {
        received += chunk.byteLength
        if (received > MAX_RESPONSE_BYTES) {
          req.destroy(new SwaggerError('remote_response_too_large', '远程响应过大：请提供更小的 Swagger/OpenAPI JSON。'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => done({ url, statusCode: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', fail)
      res.on('aborted', () => fail(new SwaggerError('remote_connection_aborted', '远程连接中断：请稍后重试或使用本地 JSON 文件。')))
    })

    req.on('timeout', () => {
      req.destroy(new SwaggerError('remote_timeout', '远程请求超时：请稍后重试或使用本地 JSON 文件。'))
    })
    req.on('error', fail)
    req.end()
  })
}

export async function fetchRemoteSwagger(source: string, redirectCount = 0): Promise<RemoteTransportResponse> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new SwaggerError('remote_redirect_limit', '远程重定向超限：请提供最终 Swagger/OpenAPI JSON 地址。')
  }

  const { url } = validateRemoteUrl(source)
  const address = await selectAddress(url.hostname)
  const response = await requestOnce(url, address)

  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    const location = response.headers.location
    if (!location) {
      throw new SwaggerError('remote_non_2xx', '远程非 2xx 响应：重定向缺少 Location。')
    }
    const next = new URL(Array.isArray(location) ? location[0] : location, url)
    if (next.origin !== url.origin) {
      throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：重定向不能跨 origin。')
    }
    return fetchRemoteSwagger(next.toString(), redirectCount + 1)
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new SwaggerError('remote_non_2xx', `远程非 2xx 响应：HTTP ${response.statusCode}。`)
  }

  return response
}
