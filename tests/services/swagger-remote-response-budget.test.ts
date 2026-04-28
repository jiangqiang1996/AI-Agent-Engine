import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { decodeRemoteResponse } from '../../src/services/swagger-remote-response-budget.js'

describe('swagger-remote-response-budget', () => {
  it('应该解码普通响应', () => {
    expect(decodeRemoteResponse(Buffer.from('{"ok":true}'), undefined)).toBe('{"ok":true}')
  })

  it('应该解码 gzip 响应', () => {
    expect(decodeRemoteResponse(gzipSync('{"ok":true}'), 'gzip')).toBe('{"ok":true}')
  })

  it('应该拒绝解压后超预算响应', () => {
    expect(() => decodeRemoteResponse(gzipSync('x'.repeat(20)), 'gzip', 10)).toThrow('远程响应过大')
  })

  it('应该拒绝原始响应超预算', () => {
    expect(() => decodeRemoteResponse(Buffer.from('x'.repeat(20)), undefined, 10)).toThrow('远程响应过大')
  })
})
