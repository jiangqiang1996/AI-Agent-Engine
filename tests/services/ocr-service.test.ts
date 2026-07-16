import { describe, expect, it } from 'vitest'

import { resolveOcrBinary, parseOcrJson, opencodeBaseURLToOcrURL, type OcrFinding } from '../../src/services/ocr-service.js'

describe('ocr-service', () => {
  describe('resolveOcrBinary', () => {
    it('应该返回非 null 结果（npm 二进制或 PATH 降级）', () => {
      const result = resolveOcrBinary()
      expect(result).not.toBeNull()
    })

    it('应该包含 path 和 source 字段', () => {
      const result = resolveOcrBinary()
      expect(result).not.toBeNull()
      if (result) {
        expect(result.path).toBeTypeOf('string')
        expect(result.path.length).toBeGreaterThan(0)
        expect(result.source).toBeTypeOf('string')
      }
    })

    it('source 应为 npm 或 path', () => {
      const result = resolveOcrBinary()
      expect(result).not.toBeNull()
      if (result) {
        expect(['npm', 'path']).toContain(result.source)
      }
    })

    it('PATH 降级时 path 应为 ocr', () => {
      const result = resolveOcrBinary()
      expect(result).not.toBeNull()
      if (result && result.source === 'path') {
        expect(result.path).toBe('ocr')
      }
    })
  })

  describe('parseOcrJson', () => {
    it('应该解析标准 JSON 输出', () => {
      const input = JSON.stringify({
        comments: [
          { path: 'src/foo.ts', content: 'bug here', start_line: 10, severity: 'high', category: 'bug' },
        ],
        files_reviewed: 3,
      })
      const result = parseOcrJson(input)
      expect(result.comments).toHaveLength(1)
      expect(result.comments![0].path).toBe('src/foo.ts')
      expect(result.files_reviewed).toBe(3)
    })

    it('应该处理空输出', () => {
      const result = parseOcrJson('')
      expect(result.comments).toEqual([])
      expect(result.summary?.files_reviewed ?? 0).toBe(0)
    })

    it('应该从混合文本中提取 JSON 块', () => {
      const input = `some log line\n{"comments":[],"files_reviewed":1}\ntrailing text`
      const result = parseOcrJson(input)
      expect(result.files_reviewed).toBe(1)
    })

    it('无效 JSON 应抛出错误', () => {
      expect(() => parseOcrJson('not json at all')).toThrow()
    })

    it('应该解析带 suggestion_code 的发现', () => {
      const input = JSON.stringify({
        comments: [
          {
            path: 'src/bar.ts',
            content: 'fix needed',
            start_line: 5,
            end_line: 8,
            suggestion_code: 'const x = 1',
            severity: 'medium',
            category: 'maintainability',
          },
        ],
      })
      const result = parseOcrJson(input)
      const finding = result.comments![0] as OcrFinding
      expect(finding.suggestion_code).toBe('const x = 1')
      expect(finding.severity).toBe('medium')
    })
  })

  describe('opencodeBaseURLToOcrURL', () => {
    it('anthropic 协议：base 格式应追加 /messages', () => {
      expect(opencodeBaseURLToOcrURL('https://api.anthropic.com/v1', 'anthropic'))
        .toBe('https://api.anthropic.com/v1/messages')
    })

    it('anthropic 协议：已有 /v1/messages 应原样返回', () => {
      expect(opencodeBaseURLToOcrURL('https://api.anthropic.com/v1/messages', 'anthropic'))
        .toBe('https://api.anthropic.com/v1/messages')
    })

    it('anthropic 协议：已有 /messages 应原样返回', () => {
      expect(opencodeBaseURLToOcrURL('https://proxy.example.com/anthropic/messages', 'anthropic'))
        .toBe('https://proxy.example.com/anthropic/messages')
    })

    it('anthropic 协议：应移除尾部斜杠再拼接', () => {
      expect(opencodeBaseURLToOcrURL('https://api.anthropic.com/v1/', 'anthropic'))
        .toBe('https://api.anthropic.com/v1/messages')
    })

    it('openai 协议：base 格式应追加 /chat/completions', () => {
      expect(opencodeBaseURLToOcrURL('https://api.openai.com/v1', 'openai'))
        .toBe('https://api.openai.com/v1/chat/completions')
    })

    it('openai 协议：已有 /chat/completions 应原样返回', () => {
      expect(opencodeBaseURLToOcrURL('https://api.openai.com/v1/chat/completions', 'openai'))
        .toBe('https://api.openai.com/v1/chat/completions')
    })

    it('openai 协议：兼容 provider 的 baseURL 应正确追加', () => {
      expect(opencodeBaseURLToOcrURL('https://apihub.agnes-ai.com/v1', 'openai'))
        .toBe('https://apihub.agnes-ai.com/v1/chat/completions')
    })

    it('openai 协议：内网 baseURL 应正确追加', () => {
      expect(opencodeBaseURLToOcrURL('http://10.0.0.10:13001/v1', 'openai'))
        .toBe('http://10.0.0.10:13001/v1/chat/completions')
    })

    it('未知协议：应原样返回（移除尾部斜杠）', () => {
      expect(opencodeBaseURLToOcrURL('https://example.com/v1/', 'unknown'))
        .toBe('https://example.com/v1')
    })
  })
})
