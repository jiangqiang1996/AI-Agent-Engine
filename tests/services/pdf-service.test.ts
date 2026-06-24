import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'

import { processPdf } from '../../src/services/pdf-service.js'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-pdf-service-'))
  roots.push(root)
  return root
}

/** 1x1 红色 RGBA PNG，用于 image 元素测试 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('pdf-service', () => {
  it('create should generate PDF from pages array', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      title: 'Test PDF',
      pages: [
        { text: 'Page one content', fontSize: 14 },
        { text: 'Page two content' },
      ],
    })

    expect(result.outputPath).toBeTruthy()
    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('2')
  })

  it('create should throw when pages is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'create', worktree: root }),
    ).rejects.toThrow('pages')
  })

  it('merge should combine multiple PDF files', async () => {
    const root = createRoot()
    const pdf1 = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'Document one' }],
    })
    const pdf2 = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'Document two' }],
    })

    const result = await processPdf({
      operation: 'merge',
      worktree: root,
      files: [pdf1.outputPath!, pdf2.outputPath!],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('2')
  })

  it('merge should throw when files is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'merge', worktree: root }),
    ).rejects.toThrow('files')
  })

  it('split should produce single-page files', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'Page 1' }, { text: 'Page 2' }, { text: 'Page 3' }],
    })

    const result = await processPdf({
      operation: 'split',
      worktree: root,
      file: created.outputPath!,
    })

    expect(result.outputPaths).toHaveLength(3)
    for (const p of result.outputPaths!) {
      expect(existsSync(p)).toBe(true)
    }
    expect(result.summary).toContain('3')
  })

  it('split should throw when file is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'split', worktree: root }),
    ).rejects.toThrow('file')
  })

  it('extract-text should extract PDF text content', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'Extractable text' }],
    })

    const result = await processPdf({
      operation: 'extract-text',
      worktree: root,
      file: created.outputPath!,
    })

    expect(result.summary).toContain('1')
  })

  it('extract-text should throw when file is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'extract-text', worktree: root }),
    ).rejects.toThrow('file')
  })
})

describe('pdf-service - rich page creation', () => {
  it('create supports element-based text', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            { type: 'text', text: 'Hello World', x: 50, y: 700, fontSize: 20 },
            { type: 'text', text: 'Second line', x: 50, y: 670, fontSize: 14 },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1')
  })

  it('create supports rect element', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'rect',
              x: 50,
              y: 700,
              width: 200,
              height: 100,
              borderColor: { r: 1, g: 0, b: 0 },
              borderWidth: 2,
              fillColor: { r: 0.9, g: 0.9, b: 0.9 },
              opacity: 0.8,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports ellipse element', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'ellipse',
              x: 100,
              y: 700,
              width: 150,
              height: 80,
              fillColor: { r: 0, g: 0.5, b: 1 },
              opacity: 0.7,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports line element', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'line',
              x: 50,
              y: 700,
              x2: 300,
              y2: 600,
              thickness: 3,
              color: { r: 0, g: 0, b: 1 },
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports image element (base64 PNG)', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'image',
              imageData: PNG_BASE64,
              x: 50,
              y: 700,
              imageWidth: 100,
              imageHeight: 100,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports image element (data URI prefix)', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'image',
              imageData: `data:image/png;base64,${PNG_BASE64}`,
              x: 50,
              y: 700,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create skips image element without data', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            { type: 'image', x: 50, y: 700 },
            { type: 'text', text: 'fallback', x: 50, y: 650 },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports multiple fonts', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            { type: 'text', text: 'Helvetica', font: 'Helvetica', x: 50, y: 780 },
            { type: 'text', text: 'Bold', font: 'HelveticaBold', x: 50, y: 750 },
            { type: 'text', text: 'Times', font: 'TimesRoman', x: 50, y: 720 },
            { type: 'text', text: 'Courier', font: 'CourierBold', x: 50, y: 690 },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports colored text', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'text',
              text: 'Red text',
              x: 50,
              y: 750,
              color: { r: 1, g: 0, b: 0 },
              fontSize: 16,
            },
            {
              type: 'text',
              text: 'Blue text',
              x: 50,
              y: 720,
              color: { r: 0, g: 0, b: 1 },
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports multiline text', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          elements: [
            {
              type: 'text',
              text: 'Line 1\nLine 2\nLine 3',
              x: 50,
              y: 780,
              fontSize: 12,
              lineHeight: 20,
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create supports A4 page size', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ size: 'A4', elements: [{ type: 'text', text: 'A4' }] }],
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    const page = doc.getPage(0)
    expect(page.getWidth()).toBeCloseTo(595.28, 1)
    expect(page.getHeight()).toBeCloseTo(841.89, 1)
  })

  it('create supports Letter page size', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ size: 'Letter', elements: [{ type: 'text', text: 'Letter' }] }],
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    const page = doc.getPage(0)
    expect(page.getWidth()).toBe(612)
    expect(page.getHeight()).toBe(792)
  })

  it('create supports Legal page size', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ size: 'Legal', elements: [{ type: 'text', text: 'Legal' }] }],
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    const page = doc.getPage(0)
    expect(page.getWidth()).toBe(612)
    expect(page.getHeight()).toBe(1008)
  })

  it('create supports custom page size', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ size: [300, 400], elements: [{ type: 'text', text: 'Custom' }] }],
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    const page = doc.getPage(0)
    expect(page.getWidth()).toBe(300)
    expect(page.getHeight()).toBe(400)
  })

  it('create supports metadata', async () => {
    const root = createRoot()
    const creationDate = '2025-01-15T10:30:00Z'
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ elements: [{ type: 'text', text: 'meta' }] }],
      metadata: {
        title: 'My Title',
        author: 'Test Author',
        subject: 'Test Subject',
        keywords: ['test', 'pdf'],
        creator: 'AE PDF Tool',
        producer: 'ae:pdf',
        creationDate,
      },
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getTitle()).toBe('My Title')
    expect(doc.getAuthor()).toBe('Test Author')
    expect(doc.getSubject()).toBe('Test Subject')
    // pdf-lib 将 keywords 数组拼接为空格分隔字符串存储
    expect(doc.getKeywords()).toBe('test pdf')
    expect(doc.getCreator()).toBe('AE PDF Tool')
    // Producer 由 pdf-lib 在 save 时自动覆盖，不验证用户设置值
  })

  it('create title param writes to metadata', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      title: 'Title Param',
      pages: [{ elements: [{ type: 'text', text: 'x' }] }],
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getTitle()).toBe('Title Param')
  })

  it('create remains compatible with legacy text/fontSize', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'Legacy mode', fontSize: 14 }],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1')
  })

  it('create prefers elements when both text and elements exist', async () => {
    const root = createRoot()
    const result = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [
        {
          text: 'should be ignored',
          fontSize: 20,
          elements: [{ type: 'text', text: 'element mode' }],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })
})

describe('pdf-service - rotate-pages', () => {
  it('rotates all pages 90 degrees', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }, { text: 'p2' }],
    })

    const result = await processPdf({
      operation: 'rotate-pages',
      worktree: root,
      file: created.outputPath!,
      rotation: 90,
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('2')
    expect(result.summary).toContain('90')

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPage(0).getRotation().angle).toBe(90)
    expect(doc.getPage(1).getRotation().angle).toBe(90)
  })

  it('rotates specified pages 180 degrees', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }],
    })

    const result = await processPdf({
      operation: 'rotate-pages',
      worktree: root,
      file: created.outputPath!,
      rotation: 180,
      pageIndices: [0, 2],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('2')

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPage(0).getRotation().angle).toBe(180)
    expect(doc.getPage(1).getRotation().angle).toBe(0)
    expect(doc.getPage(2).getRotation().angle).toBe(180)
  })

  it('defaults to 90 degrees rotation', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }],
    })

    const result = await processPdf({
      operation: 'rotate-pages',
      worktree: root,
      file: created.outputPath!,
    })

    expect(result.summary).toContain('90')
    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPage(0).getRotation().angle).toBe(90)
  })

  it('throws when file is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'rotate-pages', worktree: root }),
    ).rejects.toThrow('file')
  })

  it('accumulates rotation and wraps modulo 360', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }],
    })

    // 先旋转 180
    const rotated = await processPdf({
      operation: 'rotate-pages',
      worktree: root,
      file: created.outputPath!,
      rotation: 180,
    })
    // 再旋转 270，应为 (180+270)%360 = 90
    const result = await processPdf({
      operation: 'rotate-pages',
      worktree: root,
      file: rotated.outputPath!,
      rotation: 270,
    })

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPage(0).getRotation().angle).toBe(90)
  })
})

describe('pdf-service - delete-pages', () => {
  it('deletes specified pages', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }],
    })

    const result = await processPdf({
      operation: 'delete-pages',
      worktree: root,
      file: created.outputPath!,
      pageIndices: [1],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1')
    expect(result.summary).toContain('2/3')

    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPageCount()).toBe(2)
  })

  it('deletes multiple pages', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }, { text: 'p2' }, { text: 'p3' }, { text: 'p4' }],
    })

    const result = await processPdf({
      operation: 'delete-pages',
      worktree: root,
      file: created.outputPath!,
      pageIndices: [0, 2],
    })

    expect(result.summary).toContain('2/4')
    const doc = await PDFDocument.load(readFileSync(result.outputPath!))
    expect(doc.getPageCount()).toBe(2)
  })

  it('throws when file is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({ operation: 'delete-pages', worktree: root }),
    ).rejects.toThrow('file')
  })

  it('throws when pageIndices is missing', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }],
    })

    await expect(
      processPdf({
        operation: 'delete-pages',
        worktree: root,
        file: created.outputPath!,
      }),
    ).rejects.toThrow('pageIndices')
  })
})

describe('pdf-service - add-watermark', () => {
  it('adds watermark to all pages', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }, { text: 'p2' }],
    })

    const result = await processPdf({
      operation: 'add-watermark',
      worktree: root,
      file: created.outputPath!,
      watermark: {
        text: 'CONFIDENTIAL',
        fontSize: 60,
        color: { r: 1, g: 0, b: 0 },
        opacity: 0.3,
        rotation: 45,
      },
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('2')
  })

  it('uses default watermark parameters', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }],
    })

    const result = await processPdf({
      operation: 'add-watermark',
      worktree: root,
      file: created.outputPath!,
      watermark: { text: 'DRAFT' },
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1')
  })

  it('throws when file is missing', async () => {
    const root = createRoot()
    await expect(
      processPdf({
        operation: 'add-watermark',
        worktree: root,
        watermark: { text: 'x' },
      }),
    ).rejects.toThrow('file')
  })

  it('throws when watermark is missing', async () => {
    const root = createRoot()
    const created = await processPdf({
      operation: 'create',
      worktree: root,
      pages: [{ text: 'p1' }],
    })

    await expect(
      processPdf({
        operation: 'add-watermark',
        worktree: root,
        file: created.outputPath!,
      }),
    ).rejects.toThrow('watermark')
  })
})
