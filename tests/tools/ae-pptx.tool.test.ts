import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-pptx-tool-'))
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
  const { aePptxTool: tool } = await import('../../src/tools/ae-pptx.tool.js')
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

describe('ae-pptx 工具', () => {
  describe('create 操作', () => {
    it('应生成 PPTX 并返回 outputPath', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        title: '工具测试',
        slides: [
          { title: '页一', body: '内容', layout: 'content' },
          { title: '页二', layout: 'title' },
        ],
      })

      expect(result.output).toContain('2 张幻灯片')
      expect(result.metadata?.outputPath).toBeTruthy()
      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
      expect(result.metadata?.operation).toBe('create')
    })

    it('应支持元素化绘制', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        slides: [
          {
            elements: [
              { type: 'text', text: '标题', x: 0.5, y: 0.3, w: 12, h: 1, fontSize: 28, bold: true },
              { type: 'shape', shape: 'rect', x: 1, y: 2, w: 4, h: 2, fill: { color: '4472C4' } },
              {
                type: 'table',
                x: 0.5, y: 4.5, w: 12,
                rows: [
                  [{ text: 'A', bold: true }, { text: 'B', bold: true }],
                  [{ text: '1' }, { text: '2' }],
                ],
              },
            ],
          },
        ],
      })

      expect(result.output).toContain('1 张幻灯片')
      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持母版和章节', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        masters: [
          {
            title: 'CUSTOM_MASTER',
            slideNumber: true,
            objects: [
              { text: { text: '页脚', options: { x: 0, y: 7, w: 5, h: 0.5, fontSize: 8, color: '999999' } } },
            ],
          },
        ],
        sections: [{ title: '引言' }],
        slides: [
          { masterName: 'CUSTOM_MASTER', sectionTitle: '引言', title: '引言页', layout: 'content' },
        ],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持演示文稿元数据', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        title: '元数据',
        presentationMeta: {
          author: '测试作者',
          company: '测试公司',
          subject: '测试主题',
        },
        slides: [{ title: '元数据页', layout: 'content' }],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持自定义布局', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        layouts: [{ name: 'CUSTOM', width: 10, height: 7.5 }],
        layout: 'CUSTOM',
        slides: [{ title: '自定义布局', layout: 'content' }],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持图片元素（Base64）', async () => {
      const root = createRoot()
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const result = await callTool(root, {
        operation: 'create',
        slides: [
          {
            elements: [
              { type: 'image', imageData: pngBase64, x: 1, y: 1, w: 4, h: 3, altText: '图片' },
            ],
          },
        ],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持图表元素', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        slides: [
          {
            elements: [
              {
                type: 'chart',
                chartType: 'pie',
                x: 1, y: 1, w: 10, h: 5,
                chartData: [{ name: '占比', labels: ['A', 'B', 'C'], values: [30, 40, 30] }],
              },
            ],
          },
        ],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持自定义 outputPath', async () => {
      const root = createRoot()
      const customPath = join(root, 'custom.pptx')
      const result = await callTool(root, {
        operation: 'create',
        slides: [{ title: '自定义路径', layout: 'content' }],
        outputPath: customPath,
      })

      expect(result.metadata?.outputPath).toBe(customPath)
      expect(existsSync(customPath)).toBe(true)
    })

    it('应支持幻灯片背景和备注', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        slides: [
          {
            background: { color: '1F4E79' },
            notes: '这是备注内容',
            slideNumber: true,
            elements: [
              { type: 'text', text: '深色背景', x: 0.5, y: 3, w: 12, h: 1, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center' },
            ],
          },
        ],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('应支持富文本运行', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        slides: [
          {
            elements: [
              {
                type: 'text',
                textRuns: [
                  { text: '粗体', bold: true, color: 'FF0000' },
                  { text: '斜体', italic: true, breakLine: true },
                  { text: '下划线', underline: { style: 'sng', color: '0000FF' } },
                ],
                x: 0.5, y: 0.5, w: 12, h: 3,
              },
            ],
          },
        ],
      })

      expect(existsSync(result.metadata?.outputPath as string)).toBe(true)
    })

    it('缺少 slides 应返回错误提示', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
      })

      expect(result.output).toContain('PPTX')
      expect(result.output).toContain('失败')
    })
  })

  describe('edit 操作', () => {
    it('应执行文本替换', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        slides: [{ title: '原标题', body: '原内容', layout: 'content' }],
      })

      const editResult = await callTool(root, {
        operation: 'edit',
        file: createResult.metadata?.outputPath as string,
        replacements: [
          { find: '原标题', replace: '新标题' },
          { find: '原内容', replace: '新内容' },
        ],
      })

      expect(editResult.output).toContain('替换')
      expect(existsSync(editResult.metadata?.outputPath as string)).toBe(true)
      expect(editResult.metadata?.operation).toBe('edit')
    })

    it('缺少 file 应返回错误提示', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'edit',
        replacements: [{ find: 'a', replace: 'b' }],
      })

      expect(result.output).toContain('PPTX')
      expect(result.output).toContain('失败')
    })
  })

  describe('analyze 操作', () => {
    it('应返回幻灯片文本内容', async () => {
      const root = createRoot()
      const createResult = await callTool(root, {
        operation: 'create',
        slides: [
          { title: '分析A', body: '内容A', layout: 'content' },
          { title: '分析B', body: '内容B', layout: 'content' },
        ],
      })

      const result = await callTool(root, {
        operation: 'analyze',
        file: createResult.metadata?.outputPath as string,
      })

      expect(result.output).toContain('2 张幻灯片')
      expect(result.output).toContain('分析A')
      expect(result.output).toContain('分析B')
      expect(result.metadata?.operation).toBe('analyze')
    })

    it('缺少 file 应返回错误提示', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'analyze',
      })

      expect(result.output).toContain('PPTX')
      expect(result.output).toContain('失败')
    })
  })

  describe('元数据', () => {
    it('应返回正确的 tool 名称', async () => {
      const root = createRoot()
      const result = await callTool(root, {
        operation: 'create',
        slides: [{ title: '元数据测试', layout: 'content' }],
      })

      expect(result.metadata?.tool).toBe('ae-pptx')
    })
  })
})
