import net from 'node:net'

import { SwaggerError } from './swagger-errors.js'

export interface RemoteUrlPolicyResult {
  url: URL
}

const PRIVATE_V4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipToNumber('0.0.0.0'), 8],
  [ipToNumber('10.0.0.0'), 8],
  [ipToNumber('127.0.0.0'), 8],
  [ipToNumber('169.254.0.0'), 16],
  [ipToNumber('172.16.0.0'), 12],
  [ipToNumber('192.168.0.0'), 16],
  [ipToNumber('100.64.0.0'), 10],
  [ipToNumber('198.18.0.0'), 15],
]

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function isPrivateV4(ip: string): boolean {
  const value = ipToNumber(ip)
  return PRIVATE_V4_RANGES.some(([range, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    return (value & mask) === (range & mask)
  })
}

function isBlockedV6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  const mappedV4 = normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : undefined
  if (mappedV4 && net.isIP(mappedV4) === 4) {
    return isPrivateV4(mappedV4)
  }

  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
}

export function assertPublicRemoteAddress(address: string): void {
  const ipVersion = net.isIP(address)
  if (ipVersion === 4 && isPrivateV4(address)) {
    throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：不允许访问本机、私网、链路本地或云 metadata 地址。')
  }
  if (ipVersion === 6 && isBlockedV6(address)) {
    throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：不允许访问本机、私网、链路本地或云 metadata 地址。')
  }
}

export function validateRemoteUrl(source: string): RemoteUrlPolicyResult {
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new SwaggerError('remote_protocol_unsupported', '远程协议不支持：请输入合法的 HTTP(S) URL。')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SwaggerError('remote_protocol_unsupported', '远程协议不支持：首版仅允许 http 或 https。')
  }
  if (url.username || url.password) {
    throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：URL 中不得包含用户名或密码。')
  }
  if (url.hostname === 'localhost') {
    throw new SwaggerError('remote_address_blocked', '远程地址被安全策略阻止：不允许访问 localhost。')
  }
  if (net.isIP(url.hostname)) {
    assertPublicRemoteAddress(url.hostname)
  }

  return { url }
}
