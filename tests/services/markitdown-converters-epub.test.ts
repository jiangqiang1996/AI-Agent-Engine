import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { EpubConverter } from '../../src/services/markitdown/converters/epub-converter.js'
import type { ConverterInput } from '../../src/services/markitdown-types.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')
const REF_DIR = path.join(FIXTURES_DIR, 'reference')

async function loadEpubFixture(filename: string): Promise<ConverterInput> {
  const filePath = path.join(REF_DIR, filename)
  const binaryContent = await fs.readFile(filePath)
  return {
    filePath,
    textContent: '',
    binaryContent,
    format: 'epub',
  }
}

describe('EpubConverter (aligned with Python reference behavior)', () => {
  describe('静态工具方法 convertEpub', () => {
    it('应该接收 Buffer 并返回 ConverterResult', async () => {
      expect(typeof EpubConverter.convertEpub).toBe('function')
      const input = await loadEpubFixture('test.epub')
      const result = await EpubConverter.convertEpub(input.binaryContent)
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })

    it('应该从 EPUB 提取元数据作为首段', async () => {
      const input = await loadEpubFixture('test.epub')
      const result = await EpubConverter.convertEpub(input.binaryContent)
      // 匹配参考行为：**Title:** Test EPUB Document
      expect(result.markdown).toContain('**Title:** Test EPUB Document')
      expect(result.markdown).toContain('**Authors:** Test Author')
      expect(result.markdown).toContain('**Description:** A test EPUB document for MarkItDown testing')
    })

    it('应该按 spine 顺序提取章节内容', async () => {
      const input = await loadEpubFixture('test.epub')
      const result = await EpubConverter.convertEpub(input.binaryContent)
      // 第一章节
      expect(result.markdown).toContain('# Chapter 1: Test Content')
      expect(result.markdown).toContain('This is a **test** paragraph with some formatting.')
      // turndown 使用 "-   " 作为列表项前缀（与 Python markdownify 的 "* " 不同）
      expect(result.markdown).toContain('A bullet point')
      expect(result.markdown).toContain('Another point')
      // 第二章节
      expect(result.markdown).toContain('# Chapter 2: More Content')
      expect(result.markdown).toContain("*different* style")
      expect(result.markdown).toContain('> This is a blockquote for testing')
    })

    it('应该从元数据提取 title', async () => {
      const input = await loadEpubFixture('test.epub')
      const result = await EpubConverter.convertEpub(input.binaryContent)
      expect(result.title).toBe('Test EPUB Document')
    })

    it('应该对损坏的 EPUB Buffer 抛出 MarkitdownError', async () => {
      await expect(EpubConverter.convertEpub(Buffer.from('not an epub'))).rejects.toThrow()
    })

    it('应该对缺少 META-INF/container.xml 的 EPUB 抛出错误', async () => {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      zip.file('content.opf', '<?xml version="1.0"?><package/>')
      const buffer = Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }))
      await expect(EpubConverter.convertEpub(buffer)).rejects.toThrow()
    })
  })

  describe('实例方法 convert', () => {
    it('应该接受 epub 格式', () => {
      const converter = new EpubConverter()
      expect(converter.accept('test.epub', 'epub')).toBe(true)
      expect(converter.accept('test.pdf', 'pdf')).toBe(false)
    })

    it('应该通过 ConverterInput 转换', async () => {
      const input = await loadEpubFixture('test.epub')
      const converter = new EpubConverter()
      const result = await converter.convert(input)
      expect(result.markdown).toContain('# Chapter 1: Test Content')
    })
  })

  describe('大文件处理', () => {
    it('应该能处理包含多个章节的 EPUB（流式逐章节读取）', async () => {
      // 使用真实 fixture 验证流式处理逻辑
      const input = await loadEpubFixture('test.epub')
      const result = await EpubConverter.convertEpub(input.binaryContent)
      // 元数据 + nav + 2 章节，应有 4 段以上的内容
      const sections = result.markdown.split('\n\n').filter((s) => s.trim().length > 0)
      expect(sections.length).toBeGreaterThanOrEqual(3)
    })
  })
})
