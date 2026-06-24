import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'

import { processPptx } from '../../src/services/pptx-service.js'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-pptx-service-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('pptx-service', () => {
  describe('create 操作', () => {
    it('应根据幻灯片数组生成 PPTX 文件', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        title: '测试演示文稿',
        slides: [
          { title: '第一页', body: '内容 A', layout: 'title' },
          { title: '第二页', body: '内容 B', layout: 'content' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('2 张幻灯片')
    })

    it('缺少 slides 应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processPptx({ operation: 'create', worktree: root }),
      ).rejects.toThrow('slides')
    })

    it('应支持元素化绘制 - text 元素', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'text',
                text: '标题文本',
                x: 0.5, y: 0.3, w: 12, h: 1,
                fontSize: 28, bold: true, color: '333333',
              },
              {
                type: 'text',
                textRuns: [
                  { text: '第一行', bold: true, color: 'FF0000' },
                  { text: '第二行', breakLine: true, italic: true },
                ],
                x: 0.5, y: 1.5, w: 12, h: 3,
                fontSize: 18, lineSpacingMultiple: 1.5,
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('1 张幻灯片')
    })

    it('应支持元素化绘制 - shape 元素', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'shape',
                shape: 'roundRect',
                x: 1, y: 1, w: 4, h: 2,
                fill: { color: '4472C4' },
                line: { color: '2F528F', width: 1 },
                rectRadius: 0.2,
                shadow: { type: 'outer', opacity: 0.5, blur: 4, offset: 2, angle: 90, color: '000000' },
              },
              {
                type: 'shape',
                shape: 'ellipse',
                x: 6, y: 1, w: 3, h: 3,
                fill: { color: 'ED7D31', transparency: 30 },
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持元素化绘制 - table 元素', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'table',
                x: 0.5, y: 1, w: 12,
                rows: [
                  [
                    { text: '姓名', bold: true, fill: { color: '4472C4' }, color: 'FFFFFF' },
                    { text: '年龄', bold: true, fill: { color: '4472C4' }, color: 'FFFFFF' },
                  ],
                  [
                    { text: '张三' },
                    { text: '25' },
                  ],
                  [
                    { text: '李四' },
                    { text: '30' },
                  ],
                ],
                colW: 6,
                autoPage: true,
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持元素化绘制 - chart 元素', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'chart',
                chartType: 'bar',
                x: 0.5, y: 1, w: 12, h: 5,
                chartData: [
                  { name: '系列1', labels: ['Q1', 'Q2', 'Q3'], values: [10, 20, 15] },
                ],
                chartOptions: { title: '季度销售', showLegend: true },
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持幻灯片级属性 - 背景、备注、隐藏、页码', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            background: { color: 'F2F2F2' },
            notes: '这是演讲者备注',
            slideNumber: true,
            elements: [
              { type: 'text', text: '带背景的幻灯片', x: 0.5, y: 3, w: 12, h: 1, fontSize: 28, bold: true, align: 'center' },
            ],
          },
          {
            hidden: true,
            elements: [
              { type: 'text', text: '隐藏幻灯片', x: 0.5, y: 3, w: 12, h: 1 },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('2 张幻灯片')
    })

    it('应支持母版定义', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        masters: [
          {
            title: 'MY_MASTER',
            background: { color: 'FFFFFF' },
            slideNumber: true,
            objects: [
              { text: { text: '母版标题', options: { x: 0, y: 0, w: 10, h: 1, fontSize: 10, color: '999999' } } },
              { placeholder: { options: { name: 'body', type: 'body', x: 0.5, y: 1.5, w: 12, h: 5 } } },
            ],
          },
        ],
        slides: [
          {
            masterName: 'MY_MASTER',
            elements: [
              { type: 'text', text: '使用母版', x: 0.5, y: 1.5, w: 12, h: 5 },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持章节定义', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        sections: [
          { title: '第一章' },
          { title: '第二章', order: 2 },
        ],
        slides: [
          { sectionTitle: '第一章', title: '章节1标题', layout: 'content' },
          { sectionTitle: '第二章', title: '章节2标题', layout: 'content' },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持自定义布局', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        layouts: [{ name: 'CUSTOM_A4', width: 11.69, height: 8.27 }],
        layout: 'CUSTOM_A4',
        slides: [
          { title: '自定义布局', layout: 'content' },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持演示文稿元数据', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        title: '元数据测试',
        presentationMeta: {
          author: 'AE 测试',
          company: 'AE 公司',
          subject: '测试主题',
          revision: '1.0',
          headFontFace: 'Arial',
          bodyFontFace: 'Calibri',
        },
        slides: [{ title: '元数据', layout: 'content' }],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 RTL 模式', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        presentationMeta: { rtlMode: true },
        slides: [{ title: 'RTL', layout: 'content' }],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 image 元素（Base64）', async () => {
      const root = createRoot()
      // 1x1 红色 PNG
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'image',
                imageData: pngBase64,
                x: 1, y: 1, w: 4, h: 3,
                altText: '测试图片',
                rounding: true,
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持自定义 outputPath', async () => {
      const root = createRoot()
      const customPath = join(root, 'custom', 'output.pptx')
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ title: '自定义路径', layout: 'content' }],
        outputPath: customPath,
      })

      expect(result.outputPath).toBe(customPath)
      expect(existsSync(customPath)).toBe(true)
    })

    it('应支持兼容模式（title/body/layout）', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          { title: '标题页', body: '副标题', layout: 'title' },
          { title: '章节页', layout: 'section' },
          { title: '内容页', body: '内容文本', layout: 'content' },
          { layout: 'blank' },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('4 张幻灯片')
    })

    it('应支持富文本运行的完整样式', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'text',
                textRuns: [
                  {
                    text: '带下划线和删除线',
                    underline: { style: 'sng', color: 'FF0000' },
                    strike: true,
                    bold: true,
                  },
                  {
                    text: '上标文本',
                    superscript: true,
                    breakLine: true,
                  },
                  {
                    text: '高亮文本',
                    highlight: 'FFFF00',
                    charSpacing: 2,
                  },
                ],
                x: 0.5, y: 0.5, w: 12, h: 5,
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持项目符号配置', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'text',
                text: '编号列表项',
                x: 0.5, y: 0.5, w: 12, h: 1,
                bullet: { type: 'number', numberStartAt: 1 },
              },
              {
                type: 'text',
                text: '符号列表项',
                x: 0.5, y: 1.5, w: 12, h: 1,
                bullet: { type: 'bullet', characterCode: '2022', indent: 1 },
              },
            ],
          },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持超链接', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          {
            elements: [
              {
                type: 'text',
                text: '点击访问',
                x: 0.5, y: 0.5, w: 5, h: 1,
                hyperlink: { url: 'https://example.com', tooltip: '示例链接' },
              },
              {
                type: 'text',
                text: '跳转到第二页',
                x: 0.5, y: 1.5, w: 5, h: 1,
                hyperlink: { slide: 2 },
              },
            ],
          },
          { title: '第二页', layout: 'content' },
        ],
      })

      expect(existsSync(result.outputPath!)).toBe(true)
    })
  })

  describe('edit 操作', () => {
    it('应执行文本替换并输出新文件', async () => {
      const root = createRoot()
      const createResult = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ title: '原始标题', body: '原始内容', layout: 'content' }],
      })

      const editResult = await processPptx({
        operation: 'edit',
        worktree: root,
        file: createResult.outputPath!,
        replacements: [
          { find: '原始标题', replace: '新标题' },
          { find: '原始内容', replace: '新内容' },
        ],
      })

      expect(existsSync(editResult.outputPath!)).toBe(true)
      expect(editResult.summary).toContain('替换')

      // 验证替换生效
      const zip = new AdmZip(editResult.outputPath!)
      const slideEntries = zip.getEntries().filter((e) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
      const allText = slideEntries.map((e) => e.getData().toString('utf8')).join('')
      expect(allText).toContain('新标题')
      expect(allText).toContain('新内容')
      expect(allText).not.toContain('原始标题')
    })

    it('缺少 file 应抛出错误', async () => {
      await expect(
        processPptx({ operation: 'edit', worktree: '/tmp', replacements: [] }),
      ).rejects.toThrow('file')
    })

    it('缺少 replacements 应抛出错误', async () => {
      const root = createRoot()
      const createResult = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ title: '测试', layout: 'content' }],
      })

      await expect(
        processPptx({ operation: 'edit', worktree: root, file: createResult.outputPath! }),
      ).rejects.toThrow('replacements')
    })
  })

  describe('analyze 操作', () => {
    it('应返回幻灯片数量和文本内容', async () => {
      const root = createRoot()
      const createResult = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [
          { title: '分析页一', body: '内容 A', layout: 'content' },
          { title: '分析页二', body: '内容 B', layout: 'content' },
        ],
      })

      const result = await processPptx({
        operation: 'analyze',
        worktree: root,
        file: createResult.outputPath!,
      })

      expect(result.summary).toContain('2 张幻灯片')
      expect(result.content).toContain('分析页一')
      expect(result.content).toContain('分析页二')
    })

    it('缺少 file 应抛出错误', async () => {
      await expect(
        processPptx({ operation: 'analyze', worktree: '/tmp' }),
      ).rejects.toThrow('file')
    })

    it('应处理空演示文稿', async () => {
      const root = createRoot()
      const createResult = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ layout: 'blank' }],
      })

      const result = await processPptx({
        operation: 'analyze',
        worktree: root,
        file: createResult.outputPath!,
      })

      expect(result.summary).toContain('1 张幻灯片')
    })
  })

  describe('生成的文件可读性', () => {
    it('生成的 PPTX 应为有效的 ZIP 文件', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ title: 'ZIP 验证', layout: 'content' }],
      })

      const buffer = readFileSync(result.outputPath!)
      expect(buffer[0]).toBe(0x50) // P
      expect(buffer[1]).toBe(0x4B) // K
    })

    it('生成的 PPTX 应包含 content-type 和 slide XML', async () => {
      const root = createRoot()
      const result = await processPptx({
        operation: 'create',
        worktree: root,
        slides: [{ title: '内容验证', layout: 'content' }],
      })

      const zip = new AdmZip(result.outputPath!)
      const entries = zip.getEntries().map((e) => e.entryName)
      expect(entries.some((e) => e === '[Content_Types].xml')).toBe(true)
      expect(entries.some((e) => e.match(/^ppt\/slides\/slide\d+\.xml$/))).toBe(true)
    })
  })
})
