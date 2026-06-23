import { describe, expect, it } from 'vitest'
import type { Part } from '@opencode-ai/sdk'

import {
  convertFilePartsToPathText,
  isFilePathCommand,
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
  reference?: string
  path?: string
  filename?: string
  url?: string
  noSource?: boolean
}): Extract<Part, { type: 'file' }> {
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
    mime: 'application/pdf',
    filename,
    url,
    source,
  }
}

describe('isFilePathCommand', () => {
  it('应该识别 ae-markitdown 为路径型命令', () => {
    expect(isFilePathCommand('ae-markitdown')).toBe(true)
  })

  it('应该识别 ae-markitdown 的 -po / -pa / -auto 变体', () => {
    expect(isFilePathCommand('ae-markitdown-po')).toBe(true)
    expect(isFilePathCommand('ae-markitdown-pa')).toBe(true)
    expect(isFilePathCommand('ae-markitdown-auto')).toBe(true)
  })

  it('不应该把非路径型命令识别为路径型', () => {
    expect(isFilePathCommand('ae-review')).toBe(false)
    expect(isFilePathCommand('ae-plan')).toBe(false)
    expect(isFilePathCommand('ae-work')).toBe(false)
  })

  it('不应该把与 markitdown 名称相似但非路径型的命令识别为路径型', () => {
    expect(isFilePathCommand('ae-markitdown-helper')).toBe(false)
  })
})

describe('convertFilePartsToPathText', () => {
  it('应该把文本中的 @file 引用替换为纯路径并移除 FilePart', () => {
    const parts: Part[] = [
      textPart('使用 ae:markitdown 技能处理这次请求，并沿用参数：@docs/file.pdf'),
      filePart({ reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '使用 ae:markitdown 技能处理这次请求，并沿用参数：docs/file.pdf',
    })
  })

  it('应该处理多个 FilePart 同时转换为路径文本', () => {
    const parts: Part[] = [
      textPart('参数：@a.pdf 和 @b.pdf'),
      filePart({
        reference: '@a.pdf',
        path: 'a.pdf',
        filename: 'a.pdf',
        url: 'file:///repo/a.pdf',
      }),
      filePart({
        reference: '@b.pdf',
        path: 'b.pdf',
        filename: 'b.pdf',
        url: 'file:///repo/b.pdf',
      }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '参数：a.pdf 和 b.pdf',
    })
  })

  it('当 FilePart 缺少 source 时应从 filename 构造引用并从 url 提取路径', () => {
    const parts: Part[] = [
      textPart('参数：@file.pdf'),
      filePart({ noSource: true, filename: 'file.pdf', url: 'file:///repo/docs/file.pdf' }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(1)
    // noSource 时从 filename 构造引用 @file.pdf，从 url 提取路径
    // 路径来自 fileURLToPath，跨平台结果不同，只验证 @file.pdf 被替换
    const textPartResult = parts[0] as Extract<Part, { type: 'text' }>
    expect(textPartResult.type).toBe('text')
    expect(textPartResult.text).not.toContain('@file.pdf')
    expect(textPartResult.text).toContain('file.pdf')
  })

  it('当文本中找不到引用时，应把路径追加到首个 TextPart 末尾', () => {
    const parts: Part[] = [
      textPart('使用 ae:markitdown 处理'),
      filePart({ reference: '@docs/missing.pdf', path: 'docs/missing.pdf' }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'text',
      text: '使用 ae:markitdown 处理 docs/missing.pdf',
    })
  })

  it('当没有任何 TextPart 时应保留路径但无 TextPart 可追加', () => {
    const parts: Part[] = [
      filePart({ reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(0)
  })

  it('当 parts 为空时应安全返回', () => {
    const parts: Part[] = []
    convertFilePartsToPathText(parts)
    expect(parts).toHaveLength(0)
  })

  it('当没有 FilePart 时应保持 parts 不变', () => {
    const parts: Part[] = [textPart('纯文本参数')]
    convertFilePartsToPathText(parts)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'text', text: '纯文本参数' })
  })

  it('不应该修改正文中的普通文本（仅替换独立 token）', () => {
    const parts: Part[] = [
      textPart('查看 @docs/file.pdf 和 keep@docs/file.pdf'),
      filePart({ reference: '@docs/file.pdf', path: 'docs/file.pdf' }),
    ]

    convertFilePartsToPathText(parts)

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
        reference: '@file.pdf',
        noSource: true,
        filename: 'file.pdf',
        url: 'file:///C:/repo/docs/file.pdf',
      }),
    ]

    convertFilePartsToPathText(parts)

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
        reference: '@file.pdf',
        noSource: true,
        filename: 'file.pdf',
        url: 'https://example.com/file.pdf',
      }),
    ]

    convertFilePartsToPathText(parts)

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ type: 'text', text: '参数：file.pdf' })
  })
})
