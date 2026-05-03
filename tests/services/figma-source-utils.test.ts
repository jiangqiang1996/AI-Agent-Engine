import { describe, expect, it } from 'vitest'

import { isFigmaHost, normalizeNodeId, parseFigmaSource } from '../../src/services/figma-source-utils.js'

describe('figma-source-utils', () => {
  describe('parseFigmaSource', () => {
    const cases: Array<{ input: string | undefined; expected: { fileKey?: string; nodeId?: string; redactedSource?: string } }> = [
      {
        input: 'https://www.figma.com/file/abc123/Demo?node-id=1-2',
        expected: { fileKey: 'abc123', nodeId: '1-2', redactedSource: 'https://www.figma.com/file/abc123/Demo' },
      },
      {
        input: 'https://www.figma.com/design/xyz/My-Design?node-id=3-45',
        expected: { fileKey: 'xyz', nodeId: '3-45', redactedSource: 'https://www.figma.com/design/xyz/My-Design' },
      },
      {
        input: 'https://www.figma.com/file/abc/Demo',
        expected: { fileKey: 'abc', nodeId: undefined, redactedSource: 'https://www.figma.com/file/abc/Demo' },
      },
      {
        input: 'https://user:pass@www.figma.com/file/abc/Demo?token=secret#hash',
        expected: { fileKey: 'abc', nodeId: undefined, redactedSource: 'https://www.figma.com/file/abc/Demo' },
      },
      {
        input: 'https://www.figma.com/community',
        expected: { fileKey: undefined, nodeId: undefined, redactedSource: 'https://www.figma.com/community' },
      },
      {
        input: 'https://example.com/file/abc',
        expected: {},
      },
      {
        input: 'not-a-url',
        expected: {},
      },
      {
        input: '',
        expected: {},
      },
      {
        input: undefined,
        expected: {},
      },
    ]

    it.each(cases)('应该解析 source: $input', ({ input, expected }) => {
      const result = parseFigmaSource(input)
      expect(result).toEqual(expected)
    })
  })

  describe('normalizeNodeId', () => {
    const cases: Array<{ input: string | undefined; expected: string | undefined }> = [
      { input: '1-2', expected: '1:2' },
      { input: '10-20', expected: '10:20' },
      { input: '1:2', expected: '1:2' },
      { input: undefined, expected: undefined },
    ]

    it.each(cases)('应该归一化 nodeId: $input', ({ input, expected }) => {
      expect(normalizeNodeId(input)).toBe(expected)
    })
  })

  describe('isFigmaHost', () => {
    const cases: Array<{ input: string; expected: boolean }> = [
      { input: 'www.figma.com', expected: true },
      { input: 'figma.com', expected: true },
      { input: 'www.FIGMA.com', expected: true },
      { input: 'static.figma.com', expected: true },
      { input: 'www.figmausercontent.com', expected: true },
      { input: 'figmausercontent.com', expected: true },
      { input: 'cdn.figmausercontent.com', expected: true },
      { input: 'www.figma.net', expected: true },
      { input: 'example.com', expected: false },
      { input: 'figma.com.evil.com', expected: false },
      { input: 'notfigma.com', expected: false },
      { input: 'myfigma.com', expected: false },
    ]

    it.each(cases)('应该判断 Figma 主机: $input', ({ input, expected }) => {
      expect(isFigmaHost(input)).toBe(expected)
    })
  })
})
