import { describe, expect, it } from 'vitest'
import type { Part } from '@opencode-ai/sdk'

import { dedupeCommandFileArgumentParts } from '../../src/services/command-file-argument-dedupe-service.js'

function textPart(text: string): Extract<Part, { type: 'text' }> {
  return {
    id: 'text-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'text',
    text,
  }
}

function filePart(value: string, url?: string): Extract<Part, { type: 'file' }> {
  const fileUrl = url ?? 'file:///repo/example.md'
  const source = value
    ? {
        type: 'file' as const,
        path: 'example.md',
        text: { value, start: 0, end: value.length },
      }
    : undefined

  return {
    id: 'file-1',
    sessionID: 'session-1',
    messageID: 'message-1',
    type: 'file',
    mime: 'text/markdown',
    filename: 'example.md',
    url: fileUrl,
    source,
  }
}

describe('command-file-argument-dedupe-service', () => {
  it('应该从文本参数中移除已存在 file part 的 @file 引用', () => {
    const parts: Part[] = [
      textPart('@docs/plan.md'),
      filePart('@docs/plan.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts[0]).toMatchObject({ type: 'text', text: '' })
    expect(parts[1]).toMatchObject({ type: 'file', filename: 'example.md' })
  })

  it('应该保留没有对应 file part 的普通路径文本', () => {
    const parts: Part[] = [
      textPart('docs/plan.md'),
      filePart('@docs/other.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts[0]).toMatchObject({ type: 'text', text: 'docs/plan.md' })
  })

  it('应该只移除独立 token，不修改正文中的普通文本', () => {
    const parts: Part[] = [
      textPart('查看 @docs/plan.md 和 keep@docs/plan.md'),
      filePart('@docs/plan.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts[0]).toMatchObject({ type: 'text', text: '查看 和 keep@docs/plan.md' })
  })

  it('应该去重同一 URL 的重复 file part，保留第一个', () => {
    const parts: Part[] = [
      filePart('', 'file:///repo/README.md'),
      filePart('@README.md', 'file:///repo/README.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts.length).toBe(1)
    expect(parts[0]).toMatchObject({ type: 'file', url: 'file:///repo/README.md' })
  })

  it('应该同时去重重复 file part 和文本引用', () => {
    const parts: Part[] = [
      textPart('@README.md'),
      filePart('', 'file:///repo/README.md'),
      filePart('@README.md', 'file:///repo/README.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts.length).toBe(2)
    expect(parts[0]).toMatchObject({ type: 'text', text: '' })
    expect(parts[1]).toMatchObject({ type: 'file', url: 'file:///repo/README.md' })
  })

  it('应该保留不同 URL 的 file part', () => {
    const parts: Part[] = [
      filePart('@a.md', 'file:///repo/a.md'),
      filePart('@b.md', 'file:///repo/b.md'),
    ]

    dedupeCommandFileArgumentParts(parts)

    expect(parts.length).toBe(2)
  })
})