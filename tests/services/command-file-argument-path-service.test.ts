import { describe, expect, it } from 'vitest'
import type { Part } from '@opencode-ai/sdk'

import {
  convertNonTextImageFilePartsToPath,
  isConvertibleFilePart,
} from '../../src/services/command-file-argument-path-service.js'

function textPart(text: string): Extract<Part, { type: 'text' }> {
  return {
    id: 'text-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'text',
    text,
  }
}

function filePart(options: {
  mime?: string
  reference?: string
  path?: string
  filename?: string
  url?: string
  noSource?: boolean
}): Extract<Part, { type: 'file' }> {
  const mime = options.mime ?? 'application/pdf'
  const filename = options.filename ?? 'file.pdf'
  const url = options.url ?? 'file:///repo/docs/file.pdf'
  const reference = options.reference ?? '@docs/file.pdf'
  const sourcePath = options.path ?? 'docs/file.pdf'
  const source =
    options.noSource
      ? undefined
      : {
          type: 'file' as const,
          path: sourcePath,
          text: {
            value: reference,
            start: 0,
            end: reference.length,
          },
        }

  return {
    id: 'file-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'file',
    mime,
    filename,
    url,
    source,
  }
}

describe('isConvertibleFilePart', () => {
  it('应该把 PDF 标记为可转换', () => {
    const part = filePart({ mime: 'application/pdf' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })

  it('应该把 DOCX 标记为可转换', () => {
    const part = filePart({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })

  it('应该把 PPTX 标记为可转换', () => {
    const part = filePart({ mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })

  it('应该把 XLSX 标记为可转换', () => {
    const part = filePart({ mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })

  it('应该把 ZIP 标记为可转换', () => {
    const part = filePart({ mime: 'application/zip' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })

  it('不应该把 text/markdown 标记为可转换', () => {
    const part = filePart({ mime: 'text/markdown' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 text/plain 标记为可转换', () => {
    const part = filePart({ mime: 'text/plain' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 application/json 标记为可转换', () => {
    const part = filePart({ mime: 'application/json' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 image/png 标记为可转换', () => {
    const part = filePart({ mime: 'image/png' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 image/jpeg 标记为可转换', () => {
    const part = filePart({ mime: 'image/jpeg' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 image/webp 标记为可转换', () => {
    const part = filePart({ mime: 'image/webp' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 application/xml 标记为可转换', () => {
    const part = filePart({ mime: 'application/xml' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('不应该把 application/javascript 标记为可转换', () => {
    const part = filePart({ mime: 'application/javascript' })
    expect(isConvertibleFilePart(part)).toBe(false)
  })

  it('mime 为空时应该标记为可转换', () => {
    const part = filePart({ mime: '' })
    expect(isConvertibleFilePart(part)).toBe(true)
  })
})

describe('convertNonTextImageFilePartsToPath', () => {
  it('应该把 PDF 的 @file 引用替换为纯路径并移除 FilePart', () => {
    const parts: Part[] = [
      textPart('使用 ae:image 技能处理这次请求，并沿用参数：@docs/file.pdf'),
      filePart({ mime: 'application/pdf', reference: '@docs/file.pdf', path: 'docs/file.pdf', filename: 'file.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '使用 ae:image 技能处理这次请求，并沿用参数：docs/file.pdf',
    })
  })

  it('应该只转换非文本/非图片的 FilePart，保留文本和图片 FilePart', () => {
    const parts: Part[] = [
      textPart('参数：@doc.md @pic.png @data.pdf'),
      filePart({ mime: 'text/markdown', reference: '@doc.md', path: 'doc.md', filename: 'doc.md', url: 'file:///repo/doc.md' }),
      filePart({ mime: 'image/png', reference: '@pic.png', path: 'pic.png', filename: 'pic.png', url: 'file:///repo/pic.png' }),
      filePart({ mime: 'application/pdf', reference: '@data.pdf', path: 'data.pdf', filename: 'data.pdf', url: 'file:///repo/data.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatchObject({ type: 'text', text: '参数：@doc.md @pic.png data.pdf' })
    expect(parts[1]).toMatchObject({ type: 'file', mime: 'text/markdown' })
    expect(parts[2]).toMatchObject({ type: 'file', mime: 'image/png' })
  })

  it('应该处理多个可转换 FilePart 同时转换为路径文本', () => {
    const parts: Part[] = [
      textPart('参数：@a.pdf 和 @b.pdf'),
      filePart({
        mime: 'application/pdf',
        reference: '@a.pdf',
        path: 'a.pdf',
        filename: 'a.pdf',
        url: 'file:///repo/a.pdf',
      }),
      filePart({
        mime: 'application/pdf',
        reference: '@b.pdf',
        path: 'b.pdf',
        filename: 'b.pdf',
        url: 'file:///repo/b.pdf',
      }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '参数：a.pdf 和 b.pdf',
    })
  })

  it('当 FilePart 缺少 source 时应从 filename 构造引用并从 url 提取路径', () => {
    const parts: Part[] = [
      textPart('参数：@file.pdf'),
      filePart({ mime: 'application/pdf', noSource: true, filename: 'file.pdf', url: 'file:///repo/docs/file.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    const textPartResult = parts[0] as Extract<Part, { type: 'text' }>
    expect(textPartResult.type).toBe('text')
    expect(textPartResult.text).not.toContain('@file.pdf')
    expect(textPartResult.text).toContain('file.pdf')
  })

  it('当文本中找不到引用时，应把路径追加到首个 TextPart 末尾', () => {
    const parts: Part[] = [
      textPart('使用 ae:image 处理'),
      filePart({ mime: 'application/pdf', reference: '@docs/missing.pdf', path: 'docs/missing.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '使用 ae:image 处理 docs/missing.pdf',
    })
  })

  it('当没有任何 TextPart 时应移除可转换 FilePart 但无法追加路径', () => {
    const parts: Part[] = [
      filePart({ mime: 'application/pdf', reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(0)
  })

  it('当 parts 为空时应安全返回', () => {
    const parts: Part[] = []
    convertNonTextImageFilePartsToPath(parts)
    expect(parts).toHaveLength(0)
  })

  it('当没有可转换 FilePart 时应保持 parts 不变', () => {
    const parts: Part[] = [
      textPart('纯文本参数'),
      filePart({ mime: 'text/markdown' }),
    ]
    convertNonTextImageFilePartsToPath(parts)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text', text: '纯文本参数' })
    expect(parts[1]).toMatchObject({ type: 'file', mime: 'text/markdown' })
  })

  it('不应该修改正文中的普通文本（仅替换独立 token）', () => {
    const parts: Part[] = [
      textPart('查看 @docs/file.pdf 和 keep@docs/file.pdf'),
      filePart({ mime: 'application/pdf', reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '查看 docs/file.pdf 和 keep@docs/file.pdf',
    })
  })

  it('应该处理 source.path 缺失但 url 为 file:// 的情况', () => {
    const parts: Part[] = [
      textPart('参数：@file.pdf'),
      filePart({
        mime: 'application/pdf',
        reference: '@file.pdf',
        noSource: true,
        filename: 'file.pdf',
        url: 'file:///C:/repo/docs/file.pdf',
      }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    const textPartResult = parts[0] as Extract<Part, { type: 'text' }>
    expect(textPartResult.type).toBe('text')
    expect(textPartResult.text).not.toContain('@file.pdf')
    expect(textPartResult.text).toMatch(/file\.pdf$/)
  })

  it('当 url 非 file:// 协议时应回退到 filename', () => {
    const parts: Part[] = [
      textPart('参数：@file.pdf'),
      filePart({
        mime: 'application/pdf',
        reference: '@file.pdf',
        noSource: true,
        filename: 'file.pdf',
        url: 'https://example.com/file.pdf',
      }),
    ]

    convertNonTextImageFilePartsToPath(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'text', text: '参数：file.pdf' })
  })
})
