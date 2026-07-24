import { describe, it, expect } from 'vitest'

import { createMdReadEnhancementHook } from '../../src/hooks/md-read-enhancement.hook.js'

/** 测试用 output 容器，output 字段用 unknown 以支持多种结构 */
interface TestOutput {
  output: unknown
  result: unknown
  outputPaths: unknown
  title: string
  metadata: unknown
}

describe('md-read-enhancement hook', () => {
  const hook = createMdReadEnhancementHook()

  /**
   * 构造模拟 input。
   */
  function makeInput(tool: string, args: Record<string, unknown>) {
    return { tool, args, sessionID: 'test', agent: 'test', messageID: 'test', callID: 'test' }
  }

  /**
   * 构造模拟 output。hook 内部会处理多种 output 结构，
   * 测试中需要模拟不同结构。
   */
  function makeOutput(output: unknown): TestOutput {
    return { output, result: undefined, outputPaths: undefined, title: '', metadata: undefined }
  }

  describe('触发条件', () => {
    it('非 read 工具不应触发增强', async () => {
      const input = makeInput('edit', { path: 'test.md' })
      const output = makeOutput('# 标题\n\n内容')
      await hook(input, output as never)
      expect(output.output).toBe('# 标题\n\n内容')
    })

    it('非 .md 文件不应触发增强', async () => {
      const input = makeInput('read', { path: 'test.ts' })
      const output = makeOutput('const x = 1')
      await hook(input, output as never)
      expect(output.output).toBe('const x = 1')
    })

    it('小文件（<200行无截断无offset）不应触发增强', async () => {
      const content = '# 标题\n\n短内容'
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput(content)
      await hook(input, output as never)
      expect(output.output).toBe(content)
    })

    it('截断时应触发增强', async () => {
      const lines = ['# 标题一', '', '内容一', '', '# 标题二', '']
      for (let i = 0; i < 200; i++) {
        lines.push(`行 ${i}`)
      }
      const content = lines.join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput({ content, truncated: true })
      await hook(input, output as never)
      const result = (output.output as Record<string, unknown>).content as string
      expect(result).toContain('file-structure-summary')
      expect(result).toContain('标题一')
      expect(result).toContain('标题二')
    })

    it('使用 offset/limit 时应触发增强', async () => {
      const content = [
        '# 第一章', '', '内容一', '',
        '# 第二章', '', '内容二', '',
        '# 第三章', '', '内容三',
      ].join('\n')
      const input = makeInput('read', { path: 'test.md', offset: 5, limit: 4 })
      const output = makeOutput(content.slice(0, 100))
      await hook(input, output as never)
      expect(output.output).toContain('file-structure-summary')
    })
  })

  describe('output 结构适配', () => {
    it('应该正确处理字符串 output', async () => {
      const lines = ['# 标题', '']
      for (let i = 0; i < 200; i++) {
        lines.push(`行 ${i}`)
      }
      const content = lines.join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput(content)
      await hook(input, output as never)
      expect(typeof output.output).toBe('string')
      expect(output.output).toContain('file-structure-summary')
    })

    it('应该正确处理 { content } 结构', async () => {
      const lines = ['# 标题', '']
      for (let i = 0; i < 200; i++) {
        lines.push(`行 ${i}`)
      }
      const content = lines.join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput({ content })
      await hook(input, output as never)
      const result = (output.output as Record<string, unknown>).content as string
      expect(result).toContain('file-structure-summary')
    })

    it('应该正确处理 { output: { content } } 嵌套结构', async () => {
      const lines = ['# 标题', '']
      for (let i = 0; i < 200; i++) {
        lines.push(`行 ${i}`)
      }
      const content = lines.join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput({ output: { content } })
      await hook(input, output as never)
      const outer = output.output as Record<string, unknown>
      const inner = outer.output as Record<string, unknown>
      expect(inner.content).toContain('file-structure-summary')
    })

    it('空内容不应触发增强', async () => {
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput('')
      await hook(input, output as never)
      expect(output.output).toBe('')
    })
  })

  describe('摘要内容', () => {
    it('摘要应包含标题树、已覆盖、未覆盖和恢复指令', async () => {
      // 构造包含两个标题的完整内容
      const lines: string[] = ['# 架构', '', '架构内容']
      for (let i = 0; i < 50; i++) {
        lines.push(`架构行 ${i}`)
      }
      lines.push('', '# 代码风格', '', '风格内容')
      for (let i = 0; i < 100; i++) {
        lines.push(`风格行 ${i}`)
      }
      const fullContent = lines.join('\n')
      // 模拟截断：只返回前 55 行，但标记 truncated=true
      const partialContent = fullContent.split('\n').slice(0, 55).join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput({ content: partialContent, truncated: true })
      await hook(input, output as never)
      const result = (output.output as Record<string, unknown>).content as string
      expect(result).toContain('文档结构')
      expect(result).toContain('架构')
      expect(result).toContain('已覆盖')
    })

    it('无标题的大文件不应触发增强', async () => {
      const lines: string[] = []
      for (let i = 0; i < 250; i++) {
        lines.push(`行 ${i}`)
      }
      const content = lines.join('\n')
      const input = makeInput('read', { path: 'test.md' })
      const output = makeOutput(content)
      await hook(input, output as never)
      expect(output.output).toBe(content)
    })
  })
})
