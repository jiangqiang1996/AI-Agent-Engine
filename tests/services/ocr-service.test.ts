import { describe, expect, it } from 'vitest'

import { resolveOcrBinary, parseOcrJson, type OcrDelegatePreview, type OcrDelegateRule } from '../../src/services/ocr-service.js'

describe('ocr-service', () => {
  describe('resolveOcrBinary', () => {
    it('应该始终返回结果（npm 二进制或 PATH 降级）', () => {
      const result = resolveOcrBinary()
      expect(result).toBeDefined()
    })

    it('应该包含 path 和 source 字段', () => {
      const result = resolveOcrBinary()
      expect(result.path).toBeTypeOf('string')
      expect(result.path.length).toBeGreaterThan(0)
      expect(result.source).toBeTypeOf('string')
    })

    it('source 应为 npm 或 path', () => {
      const result = resolveOcrBinary()
      expect(['npm', 'path']).toContain(result.source)
    })

    it('PATH 降级时 path 应为 ocr', () => {
      const result = resolveOcrBinary()
      if (result.source === 'path') {
        expect(result.path).toBe('ocr')
      }
    })
  })

  describe('parseOcrJson', () => {
    it('应该解析 delegate preview JSON 输出', () => {
      const input = JSON.stringify({
        schema_version: '1',
        mode: 'workspace',
        reviewable_count: 2,
        reviewable_files: [
          { path: 'src/foo.ts', status: 'modified', insertions: 10, deletions: 2 },
        ],
      })
      const result = parseOcrJson<OcrDelegatePreview>(input)
      expect(result.mode).toBe('workspace')
      expect(result.reviewable_count).toBe(2)
      expect(result.reviewable_files).toHaveLength(1)
      expect(result.reviewable_files![0].path).toBe('src/foo.ts')
    })

    it('应该解析 delegate rule JSON 输出', () => {
      const input = JSON.stringify({
        schema_version: '1',
        groups: [
          { group_id: 1, source: 'system', pattern: '**/*.ts', files: ['src/foo.ts'], rule: '规则文本' },
        ],
      })
      const result = parseOcrJson<OcrDelegateRule>(input)
      expect(result.groups).toHaveLength(1)
      expect(result.groups![0].pattern).toBe('**/*.ts')
      expect(result.groups![0].files).toContain('src/foo.ts')
    })

    it('应该处理带 excluded_files 的 preview 输出', () => {
      const input = JSON.stringify({
        mode: 'workspace',
        reviewable_count: 1,
        excluded_count: 1,
        reviewable_files: [{ path: 'src/foo.ts', status: 'modified', insertions: 1, deletions: 0 }],
        excluded_files: [{ path: 'docs/README.md', status: 'modified', insertions: 5, deletions: 5, exclude_reason: 'unsupported_ext' }],
      })
      const result = parseOcrJson<OcrDelegatePreview>(input)
      expect(result.excluded_files).toHaveLength(1)
      expect(result.excluded_files![0].exclude_reason).toBe('unsupported_ext')
    })

    it('应该从混合文本中提取 JSON 块', () => {
      const input = `some log line\n{"mode":"workspace","reviewable_count":1}\ntrailing text`
      const result = parseOcrJson<OcrDelegatePreview>(input)
      expect(result.mode).toBe('workspace')
    })

    it('空字符串应抛出错误', () => {
      expect(() => parseOcrJson('')).toThrow()
    })

    it('无效 JSON 应抛出错误', () => {
      expect(() => parseOcrJson('not json at all')).toThrow()
    })

    it('含花括号但 JSON 无效应抛出错误', () => {
      expect(() => parseOcrJson('prefix { not valid json } suffix')).toThrow()
    })
  })
})
