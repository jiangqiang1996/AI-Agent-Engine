import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib'

import { SwaggerError } from './swagger-errors.js'

const DEFAULT_LIMIT = 5 * 1024 * 1024

export function decodeRemoteResponse(body: Buffer, encoding: string | undefined, limit = DEFAULT_LIMIT): string {
  if (body.byteLength > limit) {
    throw new SwaggerError('remote_response_too_large', '远程响应过大：请提供更小的 Swagger/OpenAPI JSON。')
  }

  let decoded = body
  const normalized = encoding?.toLowerCase()
  if (normalized === 'gzip') decoded = gunzipSync(body, { maxOutputLength: limit })
  if (normalized === 'deflate') decoded = inflateSync(body, { maxOutputLength: limit })
  if (normalized === 'br') decoded = brotliDecompressSync(body, { maxOutputLength: limit })

  if (decoded.byteLength > limit) {
    throw new SwaggerError('remote_response_too_large', '远程响应过大：请提供更小的 Swagger/OpenAPI JSON。')
  }
  if (decoded.byteLength === 0) {
    throw new SwaggerError('remote_empty_response', '远程响应为空：请确认 URL 返回 Swagger/OpenAPI JSON。')
  }
  return decoded.toString('utf8')
}
