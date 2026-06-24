import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-pdf-tool-'))
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
  const { aePdfTool: tool } = await import('../../src/tools/ae-pdf.tool.js')
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

/** 1x1 红色 RGBA PNG，用于 image 元素测试 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('ae-pdf tool', () => {
  it('create should generate PDF and return outputPath', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      title: 'Test',
      pages: [{ text: 'First page', fontSize: 14 }],
    })

    expect(result.output).toContain('已创建')
    const outputPath = result.metadata!.outputPath as string
    expect(outputPath).toContain(join('ae', 'documents', 'pdf') + sep)
    expect(existsSync(outputPath)).toBe(true)
  })

  it('should auto-create ae/documents/pdf directory', async () => {
    const root = createRoot()
    await callTool(root, {
      operation: 'create',
      pages: [{ text: 'Content' }],
    })

    expect(existsSync(join(root, 'ae', 'documents', 'pdf'))).toBe(true)
  })

  it('merge should combine multiple PDF files', async () => {
    const root = createRoot()
    const pdf1 = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'Doc one' }],
    })
    const pdf2 = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'Doc two' }],
    })

    const result = await callTool(root, {
      operation: 'merge',
      files: [pdf1.metadata!.outputPath, pdf2.metadata!.outputPath],
    })

    expect(result.output).toContain('2')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('split should return multiple output paths', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'Page 1' }, { text: 'Page 2' }],
    })

    const result = await callTool(root, {
      operation: 'split',
      file: created.metadata!.outputPath,
    })

    const outputPaths = result.metadata!.outputPaths as string[]
    expect(outputPaths).toHaveLength(2)
    for (const p of outputPaths) {
      expect(existsSync(p)).toBe(true)
    }
  })

  it('extract-text should return text content', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'Extractable text' }],
    })

    const result = await callTool(root, {
      operation: 'extract-text',
      file: created.metadata!.outputPath,
    })

    expect(result.metadata!.summary).toContain('1')
  })

  it('should return recoverable Chinese error when required param is missing', async () => {
    const root = createRoot()
    const result = await callTool(root, { operation: 'create' })

    expect(result.output).toContain('PDF 处理失败')
    expect(result.output).toContain('pages')
  })
})

describe('ae-pdf tool - 元素化创建', () => {
  it('create 支持元素化页面', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      pages: [
        {
          elements: [
            { type: 'text', text: 'Title', x: 50, y: 780, fontSize: 24, font: 'HelveticaBold' },
            { type: 'rect', x: 50, y: 700, width: 200, height: 50, fillColor: { r: 0.9, g: 0.9, b: 0.9 } },
            { type: 'line', x: 50, y: 680, x2: 250, y2: 680, thickness: 2 },
          ],
        },
      ],
    })

    expect(result.output).toContain('已创建')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 支持图片元素', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      pages: [
        {
          elements: [
            {
              type: 'image',
              imageData: PNG_BASE64,
              x: 50,
              y: 700,
              imageWidth: 80,
              imageHeight: 80,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 支持元数据', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      pages: [{ elements: [{ type: 'text', text: 'meta' }] }],
      metadata: {
        title: 'Document Title',
        author: 'Author Name',
        subject: 'Subject',
        keywords: ['a', 'b'],
      },
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 支持自定义页面尺寸', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      pages: [{ size: 'Letter', elements: [{ type: 'text', text: 'x' }] }],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })
})

describe('ae-pdf tool - rotate-pages', () => {
  it('旋转页面并返回 outputPath', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }, { text: 'p2' }],
    })

    const result = await callTool(root, {
      operation: 'rotate-pages',
      file: created.metadata!.outputPath,
      rotation: 90,
    })

    expect(result.output).toContain('旋转')
    expect(result.output).toContain('90')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('指定页码旋转', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }],
    })

    const result = await callTool(root, {
      operation: 'rotate-pages',
      file: created.metadata!.outputPath,
      rotation: 180,
      pageIndices: [0, 2],
    })

    expect(result.output).toContain('2')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('缺少 file 时返回可恢复错误', async () => {
    const root = createRoot()
    const result = await callTool(root, { operation: 'rotate-pages', rotation: 90 })

    expect(result.output).toContain('PDF 处理失败')
    expect(result.output).toContain('file')
  })
})

describe('ae-pdf tool - delete-pages', () => {
  it('删除页面并返回 outputPath', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }],
    })

    const result = await callTool(root, {
      operation: 'delete-pages',
      file: created.metadata!.outputPath,
      pageIndices: [1],
    })

    expect(result.output).toContain('删除')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('缺少 pageIndices 时返回可恢复错误', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }],
    })

    const result = await callTool(root, {
      operation: 'delete-pages',
      file: created.metadata!.outputPath,
    })

    expect(result.output).toContain('PDF 处理失败')
    expect(result.output).toContain('pageIndices')
  })
})

describe('ae-pdf tool - add-watermark', () => {
  it('添加水印并返回 outputPath', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }, { text: 'p2' }],
    })

    const result = await callTool(root, {
      operation: 'add-watermark',
      file: created.metadata!.outputPath,
      watermark: {
        text: 'CONFIDENTIAL',
        fontSize: 50,
        opacity: 0.3,
        rotation: 45,
      },
    })

    expect(result.output).toContain('水印')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('使用默认水印参数', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }],
    })

    const result = await callTool(root, {
      operation: 'add-watermark',
      file: created.metadata!.outputPath,
      watermark: { text: 'DRAFT' },
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('缺少 watermark 时返回可恢复错误', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      pages: [{ text: 'p1' }],
    })

    const result = await callTool(root, {
      operation: 'add-watermark',
      file: created.metadata!.outputPath,
    })

    expect(result.output).toContain('PDF 处理失败')
    expect(result.output).toContain('watermark')
  })
})
