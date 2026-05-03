import { afterEach, describe, expect, it, vi } from 'vitest'

import { downloadImageBytes, isAllowedDownloadUrl, MAX_DOWNLOAD_BYTES, requestFigmaImageUrl } from '../../src/services/figma-api-client.js'
import { FigmaAssetError } from '../../src/services/figma-result-formatter.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('figma-api-client', () => {
  describe('isAllowedDownloadUrl', () => {
    const cases: Array<{ input: string; expected: boolean }> = [
      { input: 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/image.png', expected: true },
      { input: 'https://www.figma.com/image.png', expected: true },
      { input: 'https://figma.com/image.png', expected: true },
      { input: 'https://cdn.figmausercontent.com/image.png', expected: true },
      { input: 'https://FIGMA.com/image.png', expected: true },
      { input: 'https://evil.com/image.png', expected: false },
      { input: 'http://figma.com/image.png', expected: false },
      { input: 'https://figma.com.evil.com/image.png', expected: false },
      { input: 'https://figma-alpha-api.s3.us-west-2.amazonaws.com:8443/image.png', expected: false },
      { input: 'https://notfigma.com/image.png', expected: false },
      { input: 'https://myfigma.com/image.png', expected: false },
      { input: 'https://user:pass@figma.com/image.png', expected: false },
      { input: 'https://localhost/image.png', expected: false },
      { input: 'https://127.0.0.1/image.png', expected: false },
      { input: 'https://10.0.0.1/image.png', expected: false },
      { input: 'https://172.16.0.1/image.png', expected: false },
      { input: 'https://192.168.0.1/image.png', expected: false },
      { input: 'https://169.254.1.1/image.png', expected: false },
      { input: 'https://[::1]/image.png', expected: false },
      { input: 'https://[fc00::1]/image.png', expected: false },
      { input: 'https://[fd00::1]/image.png', expected: false },
      { input: 'https://[fe80::1]/image.png', expected: false },
      { input: 'https://figma.com./image.png', expected: false },
      { input: 'https://static.figma.com/image.png', expected: false },
      { input: 'https://figmausercontent.com/image.png', expected: false },
    ]

    it.each(cases)('应该判断 $input → $expected', ({ input, expected }) => {
      expect(isAllowedDownloadUrl(new URL(input))).toBe(expected)
    })
  })

  describe('requestFigmaImageUrl', () => {
    const statusCases: Array<{ status: number; code: string; hint: string }> = [
      { status: 401, code: 'auth_expired', hint: '认证已过期' },
      { status: 403, code: 'access_denied', hint: '无权访问' },
      { status: 404, code: 'not_found', hint: '文件或节点不存在' },
      { status: 429, code: 'rate_limited', hint: '请求过于频繁' },
    ]

    it.each(statusCases)('应该把 $status 映射为 $code', async ({ status, code, hint }) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status })))

      await expect(requestFigmaImageUrl('abc', '1:2', 'png', 1, 'token', 'legacy')).rejects.toMatchObject({
        code,
        message: expect.stringContaining(hint),
      })
    })

    it('应该把空 images 映射为 empty_images', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ images: {} }), { status: 200 })))

      await expect(requestFigmaImageUrl('abc', '1:2', 'png', 1, 'token', 'legacy')).rejects.toMatchObject({
        code: 'empty_images',
      })
    })

    it('应该把空下载 URL 映射为 empty_download_url', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ images: { '1:2': null } }), { status: 200 })))

      await expect(requestFigmaImageUrl('abc', '1:2', 'png', 1, 'token', 'legacy')).rejects.toMatchObject({
        code: 'empty_download_url',
      })
    })

    it('应该把 Figma body.err 映射为脱敏错误', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ err: 'raw-secret-detail' }), { status: 200 })))

      try {
        await requestFigmaImageUrl('abc', '1:2', 'png', 1, 'token', 'legacy')
      } catch (error) {
        expect(error).toMatchObject({ code: 'figma_api_error' })
        expect(error instanceof Error ? error.message : String(error)).not.toContain('raw-secret-detail')
      }
    })

    it('应该把默认 HTTP 错误映射为 figma_api_failed', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))

      await expect(requestFigmaImageUrl('abc', '1:2', 'png', 1, 'token', 'legacy')).rejects.toMatchObject({
        code: 'figma_api_failed',
      })
    })
  })

  describe('downloadImageBytes', () => {
    it('应该在下载超时时返回 download_timeout', async () => {
      vi.useFakeTimers()
      vi.stubGlobal('fetch', vi.fn((_input: URL, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })))

      const assertion = expect(downloadImageBytes('https://figma.com/image.png'))
        .rejects.toMatchObject({ code: 'download_timeout' } satisfies Partial<FigmaAssetError>)
      await vi.advanceTimersByTimeAsync(30_000)

      await assertion
    })

    it('应该在 content-length 超限时返回 download_too_large', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
        status: 200,
        headers: { 'content-length': String(MAX_DOWNLOAD_BYTES + 1) },
      })))

      await expect(downloadImageBytes('https://figma.com/image.png')).rejects.toMatchObject({
        code: 'download_too_large',
      })
    })

    it('应该在流式读取超限时返回 download_too_large', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_DOWNLOAD_BYTES))
          controller.enqueue(new Uint8Array(1))
          controller.close()
        },
      })
      vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })))

      await expect(downloadImageBytes('https://figma.com/image.png')).rejects.toMatchObject({
        code: 'download_too_large',
      })
    })
  })
})
