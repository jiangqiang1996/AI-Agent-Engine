import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { convertHtmlToPptx, formatHtmlToPptxError } from '../../src/services/html-to-pptx-service.js'

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
})
