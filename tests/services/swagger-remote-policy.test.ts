import { describe, expect, it } from 'vitest'

import { assertPublicRemoteAddress, validateRemoteUrl } from '../../src/services/swagger-remote-policy.js'

describe('swagger-remote-policy', () => {
  it('应该接受公网 HTTP(S) URL', () => {
    expect(validateRemoteUrl('https://example.com/openapi.json').url.hostname).toBe('example.com')
  })

  it('应该拒绝非 HTTP 协议和 credentials', () => {
    expect(() => validateRemoteUrl('file:///tmp/openapi.json')).toThrow('远程协议不支持')
    expect(() => validateRemoteUrl('https://user:pass@example.com/openapi.json')).toThrow('远程地址被安全策略阻止')
  })

  it('应该拒绝私网和 metadata 地址', () => {
    expect(() => assertPublicRemoteAddress('127.0.0.1')).toThrow('远程地址被安全策略阻止')
    expect(() => assertPublicRemoteAddress('10.0.0.1')).toThrow('远程地址被安全策略阻止')
    expect(() => assertPublicRemoteAddress('169.254.169.254')).toThrow('远程地址被安全策略阻止')
  })

  it('应该拒绝 IPv4-mapped IPv6 私网地址', () => {
    expect(() => assertPublicRemoteAddress('::ffff:172.16.0.1')).toThrow('远程地址被安全策略阻止')
    expect(() => assertPublicRemoteAddress('::ffff:100.64.0.1')).toThrow('远程地址被安全策略阻止')
    expect(() => assertPublicRemoteAddress('::ffff:198.18.0.1')).toThrow('远程地址被安全策略阻止')
  })
})
