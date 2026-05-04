import { describe, expect, it } from 'vitest'

import {
  validateBrowserContentType,
  validateBrowserResourceUrl,
} from '../../src/services/figma-browser-resource-policy.js'

describe('Figma 浏览器资源安全策略', () => {
  it.each([
    ['https://cdn.figmausercontent.com/export/icon.png', 'cdn_direct'],
    ['https://s3-alpha-sig.figma.com/img/icon.png', 's3_presigned'],
    ['https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/icon.png', 's3_presigned'],
  ])('应该允许 Figma 官方资源域名：%s', (url, sourceType) => {
    expect(validateBrowserResourceUrl(url)).toMatchObject({ sourceType })
  })

  it.each([
    'http://cdn.figmausercontent.com/export/icon.png',
    'https://figma.com.evil.com/icon.png',
    'https://localhost/icon.png',
    'https://127.0.0.1/icon.png',
    'https://192.168.1.1/icon.png',
    'https://user:pass@cdn.figmausercontent.com/icon.png',
    'https://cdn.figmausercontent.com:444/icon.png',
    'file:///tmp/icon.png',
    'data:image/png;base64,abc',
    'javascript:alert(1)',
  ])('应该拒绝不安全资源 URL：%s', (url) => {
    expect(() => validateBrowserResourceUrl(url)).toThrow('allowlist')
  })

  it.each([
    ['https://cdn.figmausercontent.com/icon.png', 'image/png', 'png'],
    ['https://cdn.figmausercontent.com/icon.jpeg', 'image/jpeg; charset=utf-8', 'jpg'],
    ['https://cdn.figmausercontent.com/icon.pdf', 'application/pdf', 'pdf'],
  ])('应该允许安全 Content-Type：%s', (url, contentType, format) => {
    expect(validateBrowserContentType(new URL(url), contentType)).toMatchObject({ format })
  })

  it('应该为 PDF 生成主动内容风险警告', () => {
    const result = validateBrowserContentType(new URL('https://cdn.figmausercontent.com/icon.pdf'), 'application/pdf')

    expect(result.warnings).toEqual([{ code: 'pdf_active_content_risk', message: 'PDF 可能包含主动内容，请仅打开可信来源文件。' }])
  })

  it.each([
    ['https://cdn.figmausercontent.com/icon.svg', 'image/svg+xml'],
    ['https://cdn.figmausercontent.com/icon.html', 'text/html'],
    ['https://cdn.figmausercontent.com/icon.bin', 'application/octet-stream'],
  ])('应该拒绝不支持 Content-Type：%s', (url, contentType) => {
    expect(() => validateBrowserContentType(new URL(url), contentType)).toThrow('Content-Type')
  })

  it('应该拒绝 Content-Type 与扩展名不匹配', () => {
    expect(() => validateBrowserContentType(new URL('https://cdn.figmausercontent.com/icon.png'), 'application/pdf'))
      .toThrow('扩展名不匹配')
  })
})
