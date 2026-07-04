import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import AdmZip from 'adm-zip'
import { afterEach, describe, expect, it } from 'vitest'

import { processDocx } from '../../src/services/docx-service.js'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-docx-service-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('docx-service', () => {
  describe('create 操作', () => {
    it('应根据内容块数组生成 DOCX 文件', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        title: '测试文档',
        blocks: [
          { type: 'heading', level: 1, text: '标题一' },
          { type: 'paragraph', text: '这是一段正文。' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('2')
    })

    it('缺少 blocks 应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({ operation: 'create', worktree: root }),
      ).rejects.toThrow('blocks')
    })

    it('应支持 heading 1-6 级别', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: 'H1' },
          { type: 'heading', level: 2, text: 'H2' },
          { type: 'heading', level: 3, text: 'H3' },
          { type: 'heading', level: 4, text: 'H4' },
          { type: 'heading', level: 5, text: 'H5' },
          { type: 'heading', level: 6, text: 'H6' },
        ],
      })

      expect(result.summary).toContain('6')
    })

    it('应支持 bullet 和 numbered 列表', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '列表测试' },
          { type: 'bullet', text: '项目一' },
          { type: 'bullet', text: '项目二' },
          { type: 'numbered', text: '编号一' },
          { type: 'numbered', text: '编号二' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持富文本 runs', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'paragraph',
            runs: [
              { text: '正常', bold: false },
              { text: '粗体', bold: true },
              { text: '斜体', italics: true },
              { text: '红色', color: 'FF0000' },
              { text: '大字', fontSize: 24 },
            ],
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持段落样式（align, spacing, indent）', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'paragraph',
            text: '居中对齐段落',
            align: 'center',
            spacing: { before: 200, after: 200, line: 360 },
            indent: { firstLine: 480 },
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持文本样式（underline, strike, highlight）', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'paragraph',
            text: '带样式的文本',
            underline: 'single',
            strike: true,
            highlight: 'yellow',
            color: '0000FF',
            fontFace: 'Arial',
            fontSize: 14,
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 table 基础表格', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '表格测试' },
          {
            type: 'table',
            rows: [
              [
                { text: '姓名' },
                { text: '年龄' },
              ],
              [
                { text: '张三' },
                { text: '25' },
              ],
            ],
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 table 单元格样式', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'table',
            rows: [
              [
                { text: '表头1', style: { bold: true, shading: { fill: '4472C4' }, color: 'FFFFFF', align: 'center' } },
                { text: '表头2', style: { bold: true, shading: { fill: '4472C4' }, color: 'FFFFFF', align: 'center' } },
              ],
              [
                { text: '数据1', style: { align: 'left' } },
                { text: '数据2', style: { align: 'right' } },
              ],
            ],
            tableWidth: 100,
            tableLayout: 'fixed',
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 table 合并单元格（colspan/rowspan）', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'table',
            rows: [
              [
                { text: '合并两列', style: { colspan: 2 } },
                { text: '普通' },
              ],
              [
                { text: 'A', style: { rowspan: 2 } },
                { text: 'B' },
                { text: 'C' },
              ],
              [
                { text: 'D' },
                { text: 'E' },
              ],
            ],
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 table 单元格边框和边距', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'table',
            rows: [
              [
                {
                  text: '带边框',
                  style: {
                    borders: {
                      top: { style: 'single', size: 4, color: '000000' },
                      bottom: { style: 'single', size: 4, color: '000000' },
                      left: { style: 'single', size: 4, color: '000000' },
                      right: { style: 'single', size: 4, color: '000000' },
                    },
                    margin: { top: 100, bottom: 100, left: 100, right: 100 },
                  },
                },
              ],
            ],
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 page-break', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'paragraph', text: '第一页内容' },
          { type: 'page-break' },
          { type: 'paragraph', text: '第二页内容' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 hr 水平线', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'paragraph', text: '上方内容' },
          { type: 'hr' },
          { type: 'paragraph', text: '下方内容' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 code 代码块', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'code', text: 'const x = 42;', codeLanguage: 'typescript' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 quote 引用（indent 和 block 样式）', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'quote', text: '缩进引用', quoteStyle: 'indent' },
          { type: 'quote', text: '块引用', quoteStyle: 'block' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 hyperlink 超链接', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          {
            type: 'hyperlink',
            hyperlink: {
              text: '点击访问',
              url: 'https://example.com',
              bold: true,
              color: '0563C1',
            },
          },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 image（base64 数据）', async () => {
      const root = createRoot()
      // 1x1 红色 PNG 的 base64
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'image', imageData: pngBase64, imageWidth: 100, imageHeight: 100, imageAlt: '测试图片' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持 image（文件路径）', async () => {
      const root = createRoot()
      // 创建测试 PNG 文件
      const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      const imagePath = join(root, 'test.png')
      writeFileSync(imagePath, Buffer.from(pngBase64, 'base64'))

      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'image', imagePath, imageWidth: 80, imageHeight: 80 },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持节属性 sections', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '第一节' },
          { type: 'paragraph', text: '内容' },
        ],
        sections: [{
          pageSize: { width: 8.5, height: 11, orientation: 'portrait' },
          margins: { top: 1, bottom: 1, left: 1, right: 1 },
          headers: { default: '页眉文本' },
          footers: { default: '页脚文本' },
          columnCount: 2,
          columnSpacing: 0.5,
        }],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持横向页面', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '横向页面' },
        ],
        sections: [{
          pageSize: { orientation: 'landscape' },
        }],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })

    it('应支持文档元数据 documentMeta', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'paragraph', text: '带元数据的文档' },
        ],
        documentMeta: {
          title: '文档标题',
          creator: '作者名',
          subject: '主题',
          description: '描述',
          keywords: '关键词1,关键词2',
          category: '分类',
          lastModifiedBy: '修改者',
          revision: 3,
        },
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)

      // 验证元数据写入（core.xml 路径可能因 docx 版本不同）
      const zip = new AdmZip(result.outputPath!)
      const entries = zip.getEntries().map((e) => e.entryName)
      const coreEntry = entries.find((e) => e.includes('core.xml'))
      if (coreEntry) {
        const coreXml = zip.readAsText(coreEntry)
        expect(coreXml).toContain('文档标题')
        expect(coreXml).toContain('作者名')
        expect(coreXml).toContain('主题')
      }
    })

    it('应支持混合内容块', async () => {
      const root = createRoot()
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        title: '混合内容文档',
        blocks: [
          { type: 'heading', level: 1, text: '文档标题' },
          { type: 'paragraph', text: '引言段落。' },
          { type: 'heading', level: 2, text: '第一节' },
          { type: 'bullet', text: '要点一' },
          { type: 'bullet', text: '要点二' },
          { type: 'numbered', text: '步骤一' },
          { type: 'numbered', text: '步骤二' },
          { type: 'quote', text: '重要引用', quoteStyle: 'block' },
          { type: 'code', text: 'console.log("hello")', codeLanguage: 'javascript' },
          { type: 'hr' },
          { type: 'table', rows: [[{ text: 'A' }, { text: 'B' }], [{ text: 'C' }, { text: 'D' }]] },
          { type: 'page-break' },
          { type: 'heading', level: 1, text: '第二页' },
          { type: 'hyperlink', hyperlink: { text: '链接', url: 'https://example.com' } },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
    })
  })

  describe('analyze 操作', () => {
    it('应返回段落计数和文本内容', async () => {
      const root = createRoot()
      // 先创建一个文档
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '分析测试' },
          { type: 'paragraph', text: '这是一段文本用于分析。' },
        ],
      })

      const result = await processDocx({
        operation: 'analyze',
        worktree: root,
        file: createResult.outputPath!,
      })

      expect(result.summary).toContain('段落')
      expect(result.content).toContain('分析测试')
      expect(result.content).toContain('这是一段文本用于分析')
    })

    it('文件不存在应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({
          operation: 'analyze',
          worktree: root,
          file: join(root, 'nonexistent.docx'),
        }),
      ).rejects.toThrow()
    })

    it('缺少 file 应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({ operation: 'analyze', worktree: root }),
      ).rejects.toThrow('file')
    })
  })

  describe('edit 操作', () => {
    it('应执行文本替换并保留格式', async () => {
      const root = createRoot()
      // 先创建文档
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'paragraph', text: '旧文本需要被替换' },
        ],
      })

      const result = await processDocx({
        operation: 'edit',
        worktree: root,
        file: createResult.outputPath!,
        replacements: [
          { find: '旧文本', replace: '新文本' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)

      // 验证替换生效
      const analyzeResult = await processDocx({
        operation: 'analyze',
        worktree: root,
        file: result.outputPath!,
      })
      expect(analyzeResult.content).toContain('新文本')
      expect(analyzeResult.content).not.toContain('旧文本')
    })

    it('缺少 replacements 应抛出错误', async () => {
      const root = createRoot()
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: 'test' }],
      })

      await expect(
        processDocx({
          operation: 'edit',
          worktree: root,
          file: createResult.outputPath!,
        }),
      ).rejects.toThrow('replacements')
    })
  })

  describe('track-changes 操作', () => {
    it('应添加修订标记', async () => {
      const root = createRoot()
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'paragraph', text: '原始内容需要修改' },
        ],
      })

      const result = await processDocx({
        operation: 'track-changes',
        worktree: root,
        file: createResult.outputPath!,
        changes: [
          { find: '原始内容', replace: '修改后内容' },
        ],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)

      // 验证修订标记存在
      const zip = new AdmZip(result.outputPath!)
      const docXml = zip.readAsText('word/document.xml')
      expect(docXml).toContain('w:ins')
      expect(docXml).toContain('w:del')
    })

    it('缺少 changes 应抛出错误', async () => {
      const root = createRoot()
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: 'test' }],
      })

      await expect(
        processDocx({
          operation: 'track-changes',
          worktree: root,
          file: createResult.outputPath!,
        }),
      ).rejects.toThrow('changes')
    })
  })

  describe('outputPath 自定义', () => {
    it('应支持自定义输出路径', async () => {
      const root = createRoot()
      const customPath = join(root, 'custom-output.docx')
      const result = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: '自定义路径测试' }],
        outputPath: customPath,
      })

      expect(result.outputPath).toBe(customPath)
      expect(existsSync(customPath)).toBe(true)
    })
  })

  describe('merge 操作', () => {
    it('应合并两个 DOCX 文件', async () => {
      const root = createRoot()

      const createResult1 = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: '文档一内容' }],
      })
      const createResult2 = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: '文档二内容' }],
      })

      const result = await processDocx({
        operation: 'merge',
        worktree: root,
        files: [createResult1.outputPath!, createResult2.outputPath!],
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('2')

      // 验证合并后包含两份内容
      const analyzeResult = await processDocx({
        operation: 'analyze',
        worktree: root,
        file: result.outputPath!,
      })
      expect(analyzeResult.content).toContain('文档一内容')
      expect(analyzeResult.content).toContain('文档二内容')
    })

    it('少于 2 个文件应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({
          operation: 'merge',
          worktree: root,
          files: ['only-one.docx'],
        }),
      ).rejects.toThrow('2')
    })

    it('缺少 files 应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({ operation: 'merge', worktree: root }),
      ).rejects.toThrow('2')
    })

    it('应合并三个 DOCX 文件', async () => {
      const root = createRoot()

      const files: string[] = []
      for (let i = 0; i < 3; i++) {
        const r = await processDocx({
          operation: 'create',
          worktree: root,
          blocks: [{ type: 'paragraph', text: `文档${i + 1}内容` }],
        })
        files.push(r.outputPath!)
      }

      const result = await processDocx({
        operation: 'merge',
        worktree: root,
        files,
      })

      expect(result.outputPath).toBeTruthy()
      expect(existsSync(result.outputPath!)).toBe(true)
      expect(result.summary).toContain('3')

      const analyzeResult = await processDocx({
        operation: 'analyze',
        worktree: root,
        file: result.outputPath!,
      })
      expect(analyzeResult.content).toContain('文档1内容')
      expect(analyzeResult.content).toContain('文档2内容')
      expect(analyzeResult.content).toContain('文档3内容')
    })
  })

  describe('split 操作', () => {
    it('应按分页符拆分文档', async () => {
      const root = createRoot()

      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [
          { type: 'heading', level: 1, text: '第一部分' },
          { type: 'paragraph', text: '第一部分正文' },
          { type: 'page-break' },
          { type: 'heading', level: 1, text: '第二部分' },
          { type: 'paragraph', text: '第二部分正文' },
        ],
      })

      const result = await processDocx({
        operation: 'split',
        worktree: root,
        file: createResult.outputPath!,
      })

      expect(result.outputPaths).toBeTruthy()
      expect(result.outputPaths!.length).toBeGreaterThanOrEqual(2)
      for (const p of result.outputPaths!) {
        expect(existsSync(p)).toBe(true)
      }
      expect(result.summary).toContain('2')
    })

    it('无法拆分的文档应抛出错误', async () => {
      const root = createRoot()
      const createResult = await processDocx({
        operation: 'create',
        worktree: root,
        blocks: [{ type: 'paragraph', text: '只有一个段落，无法拆分' }],
      })

      await expect(
        processDocx({
          operation: 'split',
          worktree: root,
          file: createResult.outputPath!,
        }),
      ).rejects.toThrow()
    })

    it('缺少 file 应抛出错误', async () => {
      const root = createRoot()
      await expect(
        processDocx({ operation: 'split', worktree: root }),
      ).rejects.toThrow('file')
    })
  })
})
