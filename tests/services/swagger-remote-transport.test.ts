import dns from 'node:dns/promises'
import http from 'node:http'
import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchRemoteSwagger } from '../../src/services/swagger-remote-transport.js'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('swagger-remote-transport', () => {
  it('应该在 DNS 解析超时时返回远程超时错误', async () => {
    vi.useFakeTimers()
    vi.spyOn(dns, 'lookup').mockImplementation(() => new Promise(() => undefined))

    const result = expect(fetchRemoteSwagger('https://example.com/openapi.json')).rejects.toThrow('远程 DNS 解析超时')
    await vi.advanceTimersByTimeAsync(10_000)
    await result
  })

  it('应该拒绝跨 origin 重定向', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>)
    vi.spyOn(http, 'request').mockImplementation(((_options: unknown, callback: (response: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void }
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> }
        response.statusCode = 302
        response.headers = { location: 'http://other.example/openapi.json' }
        callback(response)
        response.emit('end')
      }
      request.destroy = (error: Error) => request.emit('error', error)
      return request
    }) as typeof http.request)

    await expect(fetchRemoteSwagger('http://example.com/swagger.json')).rejects.toThrow('重定向不能跨 origin')
  })

  it('应该允许同 origin 重定向', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as unknown as Awaited<ReturnType<typeof dns.lookup>>)
    const requestMock = vi.spyOn(http, 'request').mockImplementation(((_options: unknown, callback: (response: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error: Error) => void }
      request.end = () => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; headers: Record<string, string> }
        if (requestMock.mock.calls.length === 1) {
          response.statusCode = 302
          response.headers = { location: '/openapi.json' }
        } else {
          response.statusCode = 200
          response.headers = {}
        }
        callback(response)
        if (response.statusCode === 200) {
          response.emit('data', Buffer.from('{"openapi":"3.0.0"}'))
        }
        response.emit('end')
      }
      request.destroy = (error: Error) => request.emit('error', error)
      return request
    }) as typeof http.request)

    const result = await fetchRemoteSwagger('http://example.com/swagger.json')

    expect(requestMock).toHaveBeenCalledTimes(2)
    expect(result.statusCode).toBe(200)
    expect(result.url.toString()).toBe('http://example.com/openapi.json')
    expect(result.body.toString('utf8')).toBe('{"openapi":"3.0.0"}')
  })
})
