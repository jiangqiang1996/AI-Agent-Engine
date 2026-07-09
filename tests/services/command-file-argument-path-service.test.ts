import { describe, expect, it } from 'vitest'
import type { Part } from '@opencode-ai/sdk'

import {
  convertUnsupportedFilePartsToPath,
  shouldConvertForModel,
} from '../../src/services/command-file-argument-path-service.js'
import type { ModelMediaCapability } from '../../src/services/model-capability-cache.js'

const ALL_SUPPORTED: ModelMediaCapability = { image: true, audio: true, video: true, pdf: true }
const NONE_SUPPORTED: ModelMediaCapability = { image: false, audio: false, video: false, pdf: false }

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

describe('shouldConvertForModel', () => {
  it('模型不支持 PDF 时应转换 PDF', () => {
    const part = filePart({ mime: 'application/pdf' })
    expect(shouldConvertForModel(part, NONE_SUPPORTED)).toBe(true)
  })

  it('模型支持 PDF 时应保留 PDF', () => {
    const part = filePart({ mime: 'application/pdf' })
    expect(shouldConvertForModel(part, ALL_SUPPORTED)).toBe(false)
  })

  it('模型不支持图片时应转换 PNG', () => {
    const part = filePart({ mime: 'image/png' })
    expect(shouldConvertForModel(part, NONE_SUPPORTED)).toBe(true)
  })

  it('模型支持图片时应保留 PNG', () => {
    const part = filePart({ mime: 'image/png' })
    expect(shouldConvertForModel(part, ALL_SUPPORTED)).toBe(false)
  })

  it('模型不支持音频时应转换 WAV', () => {
    const part = filePart({ mime: 'audio/wav' })
    expect(shouldConvertForModel(part, NONE_SUPPORTED)).toBe(true)
  })

  it('模型支持音频时应保留 WAV', () => {
    const part = filePart({ mime: 'audio/wav' })
    expect(shouldConvertForModel(part, ALL_SUPPORTED)).toBe(false)
  })

  it('模型不支持视频时应转换 MP4', () => {
    const part = filePart({ mime: 'video/mp4' })
    expect(shouldConvertForModel(part, NONE_SUPPORTED)).toBe(true)
  })

  it('模型支持视频时应保留 MP4', () => {
    const part = filePart({ mime: 'video/mp4' })
    expect(shouldConvertForModel(part, ALL_SUPPORTED)).toBe(false)
  })

  it('DOCX/XLSX/PPTX/ZIP 等无 modality 的二进制始终转换', () => {
    expect(shouldConvertForModel(filePart({ mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), ALL_SUPPORTED)).toBe(true)
    expect(shouldConvertForModel(filePart({ mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), ALL_SUPPORTED)).toBe(true)
    expect(shouldConvertForModel(filePart({ mime: 'application/zip' }), ALL_SUPPORTED)).toBe(true)
  })

  it('文本类文件始终保留', () => {
    expect(shouldConvertForModel(filePart({ mime: 'text/markdown' }), NONE_SUPPORTED)).toBe(false)
    expect(shouldConvertForModel(filePart({ mime: 'text/plain' }), NONE_SUPPORTED)).toBe(false)
    expect(shouldConvertForModel(filePart({ mime: 'application/json' }), NONE_SUPPORTED)).toBe(false)
    expect(shouldConvertForModel(filePart({ mime: 'application/xml' }), NONE_SUPPORTED)).toBe(false)
    expect(shouldConvertForModel(filePart({ mime: 'application/javascript' }), NONE_SUPPORTED)).toBe(false)
  })

  it('mime 为空时始终转换', () => {
    expect(shouldConvertForModel(filePart({ mime: '' }), ALL_SUPPORTED)).toBe(true)
  })

  it('data: URL 内联图片始终保留（无磁盘路径可转换）', () => {
    expect(shouldConvertForModel(filePart({ mime: 'image/png', url: 'data:image/png;base64,iVBOR=' }), NONE_SUPPORTED)).toBe(false)
  })

  it('data: URL 内联 PDF 始终保留', () => {
    expect(shouldConvertForModel(filePart({ mime: 'application/pdf', url: 'data:application/pdf;base64,JVBERi0=' }), NONE_SUPPORTED)).toBe(false)
  })
})

describe('convertUnsupportedFilePartsToPath', () => {
  it('应该把 PDF 的 @file 引用替换为纯路径并移除 FilePart', () => {
    const parts: Part[] = [
      textPart('使用 ae:image 技能处理这次请求，并沿用参数：@docs/file.pdf'),
      filePart({ mime: 'application/pdf', reference: '@docs/file.pdf', path: 'docs/file.pdf', filename: 'file.pdf' }),
    ]

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '使用 ae:image 技能处理这次请求，并沿用参数：docs/file.pdf',
    })
  })

  it('模型不支持图片时应该转换 PNG 引用', () => {
    const parts: Part[] = [
      textPart('参数：@pic.png'),
      filePart({ mime: 'image/png', reference: '@pic.png', path: 'pic.png', filename: 'pic.png', url: 'file:///repo/pic.png' }),
    ]

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '参数：pic.png',
    })
  })

  it('模型支持图片时应该保留 PNG FilePart', () => {
    const parts: Part[] = [
      textPart('参数：@pic.png'),
      filePart({ mime: 'image/png', reference: '@pic.png', path: 'pic.png', filename: 'pic.png', url: 'file:///repo/pic.png' }),
    ]

    convertUnsupportedFilePartsToPath(parts, ALL_SUPPORTED)

    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text', text: '参数：@pic.png' })
    expect(parts[1]).toMatchObject({ type: 'file', mime: 'image/png' })
  })

  it('应该只转换模型不支持的 FilePart，保留文本和模型支持的 FilePart', () => {
    const parts: Part[] = [
      textPart('参数：@doc.md @pic.png @data.pdf'),
      filePart({ mime: 'text/markdown', reference: '@doc.md', path: 'doc.md', filename: 'doc.md', url: 'file:///repo/doc.md' }),
      filePart({ mime: 'image/png', reference: '@pic.png', path: 'pic.png', filename: 'pic.png', url: 'file:///repo/pic.png' }),
      filePart({ mime: 'application/pdf', reference: '@data.pdf', path: 'data.pdf', filename: 'data.pdf', url: 'file:///repo/data.pdf' }),
    ]

    const caps: ModelMediaCapability = { image: true, audio: false, video: false, pdf: false }
    convertUnsupportedFilePartsToPath(parts, caps)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

    expect(parts).toHaveLength(0)
  })

  it('当 parts 为空时应安全返回', () => {
    const parts: Part[] = []
    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)
    expect(parts).toHaveLength(0)
  })

  it('当没有可转换 FilePart 时应保持 parts 不变', () => {
    const parts: Part[] = [
      textPart('纯文本参数'),
      filePart({ mime: 'text/markdown' }),
    ]
    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text', text: '纯文本参数' })
    expect(parts[1]).toMatchObject({ type: 'file', mime: 'text/markdown' })
  })

  it('不应该修改正文中的普通文本（仅替换独立 token）', () => {
    const parts: Part[] = [
      textPart('查看 @docs/file.pdf 和 keep@docs/file.pdf'),
      filePart({ mime: 'application/pdf', reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

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

    convertUnsupportedFilePartsToPath(parts, NONE_SUPPORTED)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'text', text: '参数：file.pdf' })
  })
})
