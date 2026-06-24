import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-docx-tool-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function callTool(
  root: string,
  args: Record<string, unknown>,
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const { aeDocxTool: tool } = await import('../../src/tools/ae-docx.tool.js')
  const definition = tool as unknown as {
    execute: (
      args: Record<string, unknown>,
      ctx: Record<string, unknown>,
    ) => Promise<string | { output: string; metadata?: Record<string, unknown> }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? { output: result } : result
}

describe('ae-docx 工具', () => {
  describe('create 操作', () => {
    it('应生成 DOCX 并返回 outputPath', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        title: '工具测试',
        blocks: [
          { type: 'heading', level: 1, text: '标题' },
          { type: 'paragraph', text: '段落内容' },
        ],
      })

      expect(result.output).toContain('DOCX')
      expect(result.metadata?.outputPath).toBeTruthy()
      expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
      expect(result.metadata?.operation).toBe('create')
    })

    it('应支持所有 11 种内容块类型', async () => {
      const root = createRoot()
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const result = await callTool(root, {
        operation: 'create',
        title: '全部块类型',
        blocks: [
          { type: 'heading', level: 1, text: '标题' },
          { type: 'paragraph', text: '段落' },
          { type: 'bullet', text: '项目符号' },
          { type: 'numbered', text: '编号项' },
          { type: 'table', rows: [[{ text: 'A' }, { text: 'B' }]] },
          { type: 'image', imageData: pngBase64, imageWidth: 50, imageHeight: 50 },
          { type: 'page-break' },
          { type: 'code', text: 'x = 1', codeLanguage: 'python' },
          { type: 'quote', text: '引用', quoteStyle: 'block' },
          { type: 'hr' },
          { type: 'hyperlink', hyperlink: { text: '链接', url: 'https://example.com' } },
        ],
      })

      expect(result.metadata?.outputPath).toBeTruthy()
      expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
    })

    it('应支持富文本 runs', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        blocks: [
          {
            type: 'paragraph',
            runs: [
              { text: '正常' },
              { text: '粗体', bold: true },
              { text: '红色', color: 'FF0000' },
            ],
          },
        ],
      })

      expect(result.metadata?.outputPath).toBeTruthy()
    })

    it('应支持节属性和元数据', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: '内容' }],
        sections: [{
          pageSize: { orientation: 'landscape' },
          margins: { top: 1, bottom: 1 },
          headers: { default: '页眉' },
          footers: { default: '页脚' },
        }],
        documentMeta: {
          title: '元数据标题',
          creator: '作者',
        },
      })

      expect(result.metadata?.outputPath).toBeTruthy()
    })

    it('应支持自定义输出路径', async () => {
      const root = createRoot()
      const customPath = join(root, 'custom.docx')
      const result = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: 'test' }],
        outputPath: customPath,
      })

      expect(result.metadata?.outputPath).toBe(customPath)
      expect(existsSync(customPath)).toBe(true)
    })

    it('缺少 blocks 应返回错误信息', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
      })

      expect(result.output).toContain('失败')
    })
  })

  describe('analyze 操作', () => {
    it('应返回分析结果', async () => {
      const root = createRoot()
      // 先创建
      const createResult = await callTool(root, {
        operation: 'create',
        blocks: [
          { type: 'heading', level: 1, text: '分析标题' },
          { type: 'paragraph', text: '分析内容' },
        ],
      })

      const result = await callTool(root, {
        operation: 'analyze',
        file: createResult.metadata!.outputPath as string,
      })

      expect(result.output).toContain('段落')
      expect(result.output).toContain('分析标题')
      expect(result.metadata?.operation).toBe('analyze')
    })

    it('文件不存在应返回错误信息', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'analyze',
        file: join(root, 'nonexistent.docx'),
      })

      expect(result.output).toContain('失败')
    })
  })

  describe('edit 操作', () => {
    it('应执行文本替换', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: '旧文本内容' }],
      })

      const result = await callTool(root, {
        operation: 'edit',
        file: createResult.metadata!.outputPath as string,
        replacements: [{ find: '旧文本', replace: '新文本' }],
      })

      expect(result.metadata?.outputPath).toBeTruthy()
      expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
    })

    it('缺少 replacements 应返回错误信息', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: 'test' }],
      })

      const result = await callTool(root, {
        operation: 'edit',
        file: createResult.metadata!.outputPath as string,
      })

      expect(result.output).toContain('失败')
    })
  })

  describe('track-changes 操作', () => {
    it('应添加修订标记', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: '原始文本' }],
      })

      const result = await callTool(root, {
        operation: 'track-changes',
        file: createResult.metadata!.outputPath as string,
        changes: [{ find: '原始', replace: '修改后' }],
      })

      expect(result.metadata?.outputPath).toBeTruthy()
      expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
    })

    it('缺少 changes 应返回错误信息', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: 'test' }],
      })

      const result = await callTool(root, {
        operation: 'track-changes',
        file: createResult.metadata!.outputPath as string,
      })

      expect(result.output).toContain('失败')
    })
  })

  describe('metadata 反馈', () => {
    it('应包含 tool 和 operation 字段', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        blocks: [{ type: 'paragraph', text: 'test' }],
      })

      expect(result.metadata?.tool).toBe('ae-docx')
      expect(result.metadata?.operation).toBe('create')
      expect(result.metadata?.summary).toBeTruthy()
    })
  })
})
