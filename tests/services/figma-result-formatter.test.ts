import { describe, expect, it } from 'vitest'

import {
  createRunId,
  createUniqueFileName,
  FigmaAssetError,
  formatFigmaAssetError,
  formatSummary,
  sanitizeFileName,
} from '../../src/services/figma-result-formatter.js'
import type { FigmaAssetManifest } from '../../src/schemas/figma-asset-schema.js'

function createManifest(overrides: Partial<FigmaAssetManifest> = {}): FigmaAssetManifest {
  return {
    schemaVersion: 2,
    mode: 'api',
    runId: '20260503120000',
    startedAt: '2026-05-03T12:00:00.000Z',
    completedAt: '2026-05-03T12:00:00.000Z',
    status: 'success',
    source: {
      type: 'figma_url',
      host: 'www.figma.com',
      fileKeyHash: 'file123456789abc',
      nodeIdHashes: ['node123456789abc'],
    },
    evidence: {
      agentBrowserUsed: false,
      saved: false,
      types: [],
      paths: [],
      savedLocalEvidence: false,
      evidenceTypes: [],
      experimental: false,
    },
    warnings: [],
    failures: [],
    assets: [],
    ...overrides,
  }
}

describe('figma-result-formatter', () => {
  describe('sanitizeFileName', () => {
    const cases: Array<{ input: string; expected: string }> = [
      { input: 'simple.png', expected: 'simple.png' },
      { input: 'node-1-2.png', expected: 'node-1-2.png' },
      { input: '1:2.png', expected: '1-2.png' },
      { input: 'a b c.png', expected: 'a_b_c.png' },
      { input: 'foo@bar.png', expected: 'foo_bar.png' },
      { input: '中文.png', expected: '__.png' },
      { input: 'node.1:2.svg', expected: 'node.1-2.svg' },
      { input: '1:2:3.png', expected: '1-2-3.png' },
    ]

    it.each(cases)('应该归一化 $input → $expected', ({ input, expected }) => {
      expect(sanitizeFileName(input)).toBe(expected)
    })
  })

  describe('createUniqueFileName', () => {
    it('应该返回原始文件名当未使用时', () => {
      const used = new Set<string>()
      expect(createUniqueFileName('icon.png', used)).toBe('icon.png')
      expect(used.has('icon.png')).toBe(true)
    })

    it('应该添加 -2 后缀当文件名已使用', () => {
      const used = new Set<string>(['icon.png'])
      expect(createUniqueFileName('icon.png', used)).toBe('icon-2.png')
      expect(used.has('icon-2.png')).toBe(true)
    })

    it('应该递增后缀直到找到唯一名', () => {
      const used = new Set<string>(['icon.png', 'icon-2.png', 'icon-3.png'])
      expect(createUniqueFileName('icon.png', used)).toBe('icon-4.png')
    })

    it('应该处理无扩展名文件', () => {
      const used = new Set<string>(['README'])
      expect(createUniqueFileName('README', used)).toBe('README-2')
    })

    it('应该处理多扩展名文件', () => {
      const used = new Set<string>(['icon.dark.png'])
      expect(createUniqueFileName('icon.dark.png', used)).toBe('icon.dark-2.png')
    })
  })

  describe('createRunId', () => {
    it('应该返回带随机后缀的时间戳字符串', () => {
      const runId = createRunId()
      expect(runId).toMatch(/^\d{17}-[a-z0-9]{6}$/)
    })

    it('应该避免同一毫秒内 ID 冲突', () => {
      const id1 = createRunId()
      const id2 = createRunId()
      expect(id2).not.toBe(id1)
    })
  })

  describe('formatSummary', () => {
    it('应该格式化包含素材信息的摘要', () => {
      const manifest = createManifest({
        assets: [
          {
            sourceIdHash: 'node123456789abc',
            fileName: '1-2.png',
            relativePath: '.figma/assets/1-2.png',
            format: 'png',
            bytes: 1024,
            sha256: 'abc123def456789000000000000000000000000000000000000000000000000',
          },
        ],
      })
      const result = formatSummary(manifest, '/workspace', '/workspace/.figma')
      expect(result).toContain('# Figma 素材导出完成')
      expect(result).toContain('- 模式：api')
      expect(result).toContain('- 状态：success')
      expect(result).toContain('- 运行 ID：20260503120000')
      expect(result).toContain('- 素材数量：1')
      expect(result).toContain('- Evidence：saved=false')
      expect(result).toContain('.figma/ 可能包含私有设计资产')
      expect(result).toContain('1024 bytes')
      expect(result).toContain('sha256:abc123def456')
    })

    it('应该支持自定义标题', () => {
      const manifest = createManifest({
        mode: 'validate',
        assets: [],
      })
      const result = formatSummary(manifest, '/workspace', '/workspace/.figma', '校验通过')
      expect(result).toContain('# Figma 素材校验通过')
    })

    it('应该列出多个素材', () => {
      const manifest = createManifest({
        mode: 'collect',
        source: { type: 'manual', nodeIdHashes: ['a123456789abcdef', 'b123456789abcdef'] },
        assets: [
          {
            sourceIdHash: 'a123456789abcdef',
            fileName: 'a.png',
            relativePath: '.figma/assets/a.png',
            format: 'png',
            bytes: 100,
            sha256: 'a'.repeat(64),
          },
          {
            sourceIdHash: 'b123456789abcdef',
            fileName: 'b.svg',
            relativePath: '.figma/assets/b.svg',
            format: 'svg',
            bytes: 200,
            sha256: 'b'.repeat(64),
          },
        ],
      })
      const result = formatSummary(manifest, '/workspace', '/workspace/.figma')
      expect(result).toContain('.figma/assets/a.png')
      expect(result).toContain('.figma/assets/b.svg')
    })

    it('应该列出 warnings 和 failures', () => {
      const manifest = createManifest({
        warnings: [{ code: 'git_risk', message: '.figma 未被忽略' }],
        failures: [{ code: 'rate_limited', message: '稍后重试' }],
      })

      const result = formatSummary(manifest, '/workspace', '/workspace/.figma')

      expect(result).toContain('## Warnings')
      expect(result).toContain('- git_risk: .figma 未被忽略')
      expect(result).toContain('## Failures')
      expect(result).toContain('- rate_limited: 稍后重试')
    })
  })

  describe('formatFigmaAssetError', () => {
    it('应该格式化 FigmaAssetError', () => {
      const error = new FigmaAssetError('测试错误', 'test_code')
      expect(formatFigmaAssetError(error)).toBe('Figma 素材处理失败：测试错误')
    })

    it('应该脱敏普通 Error', () => {
      const error = new Error('C:/secret/.figma-env 普通错误')
      expect(formatFigmaAssetError(error)).toBe('Figma 素材处理失败：执行过程中发生未预期错误，请检查输入后重试。')
    })

    it('应该处理非 Error 对象', () => {
      expect(formatFigmaAssetError('字符串')).toBe('Figma 素材处理失败：未知错误。')
    })

    it('应该处理 null/undefined', () => {
      expect(formatFigmaAssetError(null)).toBe('Figma 素材处理失败：未知错误。')
      expect(formatFigmaAssetError(undefined)).toBe('Figma 素材处理失败：未知错误。')
    })
  })

  describe('FigmaAssetError', () => {
    it('应该正确设置 name 和 code', () => {
      const error = new FigmaAssetError('消息', 'code_x')
      expect(error.name).toBe('FigmaAssetError')
      expect(error.code).toBe('code_x')
      expect(error.message).toBe('消息')
      expect(error).toBeInstanceOf(Error)
    })
  })
})
