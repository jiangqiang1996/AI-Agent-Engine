import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import {
  convertHtmlToPptx,
  formatHtmlToPptxError,
  resolveDirectorySlides,
  isSlidesForgeDirectory,
  convertDirectorySlidesToPptxRegex,
  createMergedSlidesHtml,
  cleanupMergedHtml,
} from '../../src/services/html-to-pptx-service.js'

describe('html-to-pptx-service', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ae-html-to-pptx-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('convertHtmlToPptx', () => {
    it('应该将简单 HTML 转换为 PPTX', async () => {
      const htmlPath = join(tempDir, 'simple.html')
      writeFileSync(htmlPath, [
        '<!DOCTYPE html><html><body>',
        '<section><h1>标题页</h1><p>这是正文</p></section>',
        '<section><h2>第二页</h2><p>第二页内容</p></section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.outputPath).toBeTruthy()
      expect(result.outputPath.endsWith('.pptx')).toBe(true)
      expect(result.slideCount).toBe(2)
      expect(result.warnings).toEqual([])
    })

    it('应该按 section 分页', async () => {
      const htmlPath = join(tempDir, 'sections.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<section><h1>第一页</h1></section>',
        '<section><h2>第二页</h2></section>',
        '<section><h3>第三页</h3></section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
        slideSeparator: 'section',
      })

      expect(result.slideCount).toBe(3)
    })

    it('应该按 hr 分页', async () => {
      const htmlPath = join(tempDir, 'hr.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<h1>第一页</h1><p>内容1</p>',
        '<hr>',
        '<h2>第二页</h2><p>内容2</p>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
        slideSeparator: 'hr',
      })

      expect(result.slideCount).toBe(2)
    })

    it('应该按 h1 分页', async () => {
      const htmlPath = join(tempDir, 'h1.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<h1>标题1</h1><p>内容1</p>',
        '<h1>标题2</h1><p>内容2</p>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
        slideSeparator: 'h1',
      })

      expect(result.slideCount).toBe(2)
    })

    it('应该处理列表元素', async () => {
      const htmlPath = join(tempDir, 'list.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<section><h1>列表页</h1>',
        '<ul><li>项目1</li><li>项目2</li></ul>',
        '<ol><li>编号1</li><li>编号2</li></ol>',
        '</section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.slideCount).toBe(1)
    })

    it('应该处理表格元素', async () => {
      const htmlPath = join(tempDir, 'table.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<section><h1>表格页</h1>',
        '<table>',
        '<tr><th>列1</th><th>列2</th></tr>',
        '<tr><td>值1</td><td>值2</td></tr>',
        '</table>',
        '</section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.slideCount).toBe(1)
    })

    it('应该处理 blockquote 元素', async () => {
      const htmlPath = join(tempDir, 'quote.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<section><h1>引用页</h1>',
        '<blockquote>这是一段引用文字</blockquote>',
        '</section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.slideCount).toBe(1)
    })

    it('应该剥离 script 和 style 标签', async () => {
      const htmlPath = join(tempDir, 'script.html')
      writeFileSync(htmlPath, [
        '<html><head><style>.x{color:red}</style></head><body>',
        '<script>alert("test")</script>',
        '<section><h1>标题</h1><p>内容</p></section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.slideCount).toBe(1)
    })

    it('应该从 h1 提取标题', async () => {
      const htmlPath = join(tempDir, 'title.html')
      writeFileSync(htmlPath, [
        '<html><body>',
        '<section><h1>演示标题</h1><p>内容</p></section>',
        '</body></html>',
      ].join(''))

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
      })

      expect(result.slideCount).toBe(1)
    })

    it('应该在文件不存在时抛出错误', async () => {
      await expect(
        convertHtmlToPptx({
          file: join(tempDir, 'nonexistent.html'),
          worktree: tempDir,
        }),
      ).rejects.toThrow('HTML 文件不存在')
    })

    it('应该处理空 HTML 文件', async () => {
      const htmlPath = join(tempDir, 'empty.html')
      writeFileSync(htmlPath, '<html><body></body></html>')

      await expect(
        convertHtmlToPptx({
          file: htmlPath,
          worktree: tempDir,
        }),
      ).rejects.toThrow('HTML 内容为空')
    })

    it('应该处理自定义输出路径', async () => {
      const htmlPath = join(tempDir, 'custom.html')
      const outputDir = join(tempDir, 'custom-output')
      mkdirSync(outputDir, { recursive: true })
      const outputPath = join(outputDir, 'custom.pptx')
      writeFileSync(htmlPath, '<section><h1>标题</h1></section>')

      const result = await convertHtmlToPptx({
        file: htmlPath,
        worktree: tempDir,
        outputPath,
      })

      expect(result.outputPath).toBe(outputPath)
    })

    it('应该处理相对路径', async () => {
      const htmlPath = join(tempDir, 'relative.html')
      writeFileSync(htmlPath, '<section><h1>标题</h1><p>内容</p></section>')

      const result = await convertHtmlToPptx({
        file: 'relative.html',
        worktree: tempDir,
      })

      expect(result.outputPath).toBeTruthy()
      expect(result.slideCount).toBe(1)
    })
  })

  describe('formatHtmlToPptxError', () => {
    it('应该格式化 Error 对象', () => {
      const error = new Error('测试错误')
      const formatted = formatHtmlToPptxError(error)
      expect(formatted).toContain('测试错误')
    })

    it('应该格式化字符串错误', () => {
      const formatted = formatHtmlToPptxError('字符串错误')
      expect(formatted).toContain('字符串错误')
    })

    it('应该格式化未知错误', () => {
      const formatted = formatHtmlToPptxError(null)
      expect(formatted).toBeTruthy()
    })
  })

  describe('resolveDirectorySlides', () => {
    it('应该按编号排序解析 slide-NN.html 文件', () => {
      mkdirSync(join(tempDir, 'slides'), { recursive: true })
      writeFileSync(join(tempDir, 'slides', 'slide-02.html'), '<h1>第二页</h1>')
      writeFileSync(join(tempDir, 'slides', 'slide-01.html'), '<h1>第一页</h1>')
      writeFileSync(join(tempDir, 'slides', 'slide-03.html'), '<h1>第三页</h1>')
      writeFileSync(join(tempDir, 'slides', 'index.html'), '<html></html>')

      const slides = resolveDirectorySlides(join(tempDir, 'slides'))

      expect(slides.length).toBe(3)
      expect(slides[0].number).toBe(1)
      expect(slides[0].filename).toBe('slide-01.html')
      expect(slides[1].number).toBe(2)
      expect(slides[2].number).toBe(3)
    })

    it('应该忽略不符合 slide-NN.html 模式的文件', () => {
      mkdirSync(join(tempDir, 'slides'), { recursive: true })
      writeFileSync(join(tempDir, 'slides', 'slide-01.html'), '<h1>第一页</h1>')
      writeFileSync(join(tempDir, 'slides', 'index.html'), '<html></html>')
      writeFileSync(join(tempDir, 'slides', 'common.css'), 'body{}')
      writeFileSync(join(tempDir, 'slides', 'common.js'), 'console.log(1)')

      const slides = resolveDirectorySlides(join(tempDir, 'slides'))

      expect(slides.length).toBe(1)
      expect(slides[0].filename).toBe('slide-01.html')
    })

    it('应该在目录不存在时返回空数组', () => {
      const slides = resolveDirectorySlides(join(tempDir, 'nonexistent'))
      expect(slides).toEqual([])
    })

    it('应该在传入文件路径而非目录时返回空数组', () => {
      const filePath = join(tempDir, 'some-file.html')
      writeFileSync(filePath, '<html></html>')
      const slides = resolveDirectorySlides(filePath)
      expect(slides).toEqual([])
    })
  })

  describe('isSlidesForgeDirectory', () => {
    it('应该在目录含 slide-NN.html 文件时返回 true', () => {
      mkdirSync(join(tempDir, 'slides'), { recursive: true })
      writeFileSync(join(tempDir, 'slides', 'slide-01.html'), '<h1>第一页</h1>')
      writeFileSync(join(tempDir, 'slides', 'index.html'), '<html></html>')

      expect(isSlidesForgeDirectory(join(tempDir, 'slides'))).toBe(true)
    })

    it('应该在目录不含 slide-NN.html 文件时返回 false', () => {
      mkdirSync(join(tempDir, 'no-slides'), { recursive: true })
      writeFileSync(join(tempDir, 'no-slides', 'index.html'), '<html></html>')

      expect(isSlidesForgeDirectory(join(tempDir, 'no-slides'))).toBe(false)
    })

    it('应该在传入文件路径时返回 false', () => {
      const filePath = join(tempDir, 'some-file.html')
      writeFileSync(filePath, '<html></html>')

      expect(isSlidesForgeDirectory(filePath)).toBe(false)
    })

    it('应该在路径不存在时返回 false', () => {
      expect(isSlidesForgeDirectory(join(tempDir, 'nonexistent'))).toBe(false)
    })
  })

  describe('convertDirectorySlidesToPptxRegex', () => {
    it('应该将 slide-NN.html 目录转换为 PPTX', async () => {
      const slidesDir = join(tempDir, 'slides-dir')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(join(slidesDir, 'slide-01.html'), '<section><h1>第一页</h1><p>内容1</p></section>')
      writeFileSync(join(slidesDir, 'slide-02.html'), '<section><h2>第二页</h2><p>内容2</p></section>')
      writeFileSync(join(slidesDir, 'index.html'), '<html><head></head><body></body></html>')

      const result = await convertDirectorySlidesToPptxRegex(slidesDir, tempDir)

      expect(result.outputPath).toBeTruthy()
      expect(result.outputPath.endsWith('.pptx')).toBe(true)
      expect(result.slideCount).toBe(2)
    })

    it('应该在目录无 slide-NN.html 时抛出错误', async () => {
      mkdirSync(join(tempDir, 'empty-dir'), { recursive: true })

      await expect(
        convertDirectorySlidesToPptxRegex(join(tempDir, 'empty-dir'), tempDir),
      ).rejects.toThrow('未找到')
    })

    it('应该支持自定义标题和输出路径', async () => {
      const slidesDir = join(tempDir, 'slides-custom')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(join(slidesDir, 'slide-01.html'), '<section><h1>自定义标题</h1></section>')

      const outputPath = join(tempDir, 'custom-output.pptx')
      const result = await convertDirectorySlidesToPptxRegex(
        slidesDir,
        tempDir,
        '自定义标题名',
        outputPath,
      )

      expect(result.outputPath).toBe(outputPath)
      expect(result.slideCount).toBe(1)
    })
  })

  describe('createMergedSlidesHtml', () => {
    it('应该将多个 slide-NN.html 合并为单个 HTML 文件', () => {
      const slidesDir = join(tempDir, 'merge-dir')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(join(slidesDir, 'slide-01.html'), '<html><body><h1>第一页</h1><p>内容1</p></body></html>')
      writeFileSync(join(slidesDir, 'slide-02.html'), '<html><body><h2>第二页</h2><p>内容2</p></body></html>')
      writeFileSync(join(slidesDir, 'index.html'), '<html></html>')

      const mergedPath = createMergedSlidesHtml(slidesDir)

      expect(mergedPath).toBe(join(slidesDir, '_ae_merged_tmp.html'))
      const mergedContent = readFileSync(mergedPath, 'utf8')
      expect(mergedContent).toContain('第一页')
      expect(mergedContent).toContain('第二页')
      expect(mergedContent).toContain('data-slide-number="1"')
      expect(mergedContent).toContain('data-slide-number="2"')
    })

    it('应该合并 common.css 内容', () => {
      const slidesDir = join(tempDir, 'merge-css')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(join(slidesDir, 'slide-01.html'), '<html><body><h1>标题</h1></body></html>')
      writeFileSync(join(slidesDir, 'common.css'), 'body { background: #fff; }')

      const mergedPath = createMergedSlidesHtml(slidesDir)

      const mergedContent = readFileSync(mergedPath, 'utf8')
      expect(mergedContent).toContain('body { background: #fff; }')
    })

    it('应该提取各 slide 中的 inline style', () => {
      const slidesDir = join(tempDir, 'merge-styles')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(
        join(slidesDir, 'slide-01.html'),
        '<html><head><style>.slide1{color:red}</style></head><body><h1>标题</h1></body></html>',
      )

      const mergedPath = createMergedSlidesHtml(slidesDir)

      const mergedContent = readFileSync(mergedPath, 'utf8')
      expect(mergedContent).toContain('.slide1{color:red}')
    })

    it('应该在目录无 slide-NN.html 时抛出错误', () => {
      mkdirSync(join(tempDir, 'empty-merge'), { recursive: true })

      expect(() => createMergedSlidesHtml(join(tempDir, 'empty-merge'))).toThrow('未找到')
    })
  })

  describe('cleanupMergedHtml', () => {
    it('应该删除合并的临时 HTML 文件', () => {
      const slidesDir = join(tempDir, 'cleanup-dir')
      mkdirSync(slidesDir, { recursive: true })
      writeFileSync(join(slidesDir, 'slide-01.html'), '<html><body><h1>标题</h1></body></html>')

      const mergedPath = createMergedSlidesHtml(slidesDir)
      expect(existsSync(mergedPath)).toBe(true)

      cleanupMergedHtml(slidesDir)
      expect(existsSync(mergedPath)).toBe(false)
    })

    it('应该在文件不存在时静默忽略', () => {
      const slidesDir = join(tempDir, 'no-merged')
      mkdirSync(slidesDir, { recursive: true })

      cleanupMergedHtml(slidesDir)
      // 无异常即可
    })
  })
})
