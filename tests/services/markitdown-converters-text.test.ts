import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { MarkitdownError } from '../../src/services/markitdown-errors.js'
import {
  CsvConverter,
  HtmlConverter,
  JsonConverter,
  MarkdownConverter,
  TextConverter,
  XmlConverter,
  YamlConverter,
} from '../../src/services/markitdown-converters-text.js'
import type { ConverterInput } from '../../src/services/markitdown-types.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')

async function makeInput(file: string, format: string): Promise<ConverterInput> {
  const filePath = path.join(FIXTURES_DIR, file)
  const textContent = await fs.readFile(filePath, 'utf8')
  return {
    filePath,
    textContent,
    binaryContent: Buffer.from(textContent),
    format: format as never,
  }
}

describe('markitdown-converters-text (aligned with Python reference behavior)', () => {
  describe('HtmlConverter', () => {
    it('应该将 HTML 转换为 Markdown', async () => {
      const input = await makeInput('sample.html', 'html')
      const result = await new HtmlConverter().convert(input)
      expect(result.markdown).toContain('# Hello World')
      expect(result.markdown).toContain('**sample**')
      expect(result.markdown).toContain('Item 1')
      expect(result.title).toBe('Sample HTML')
    })

    it('应该只接受 html 格式', () => {
      const converter = new HtmlConverter()
      expect(converter.accept('a.html', 'html')).toBe(true)
      expect(converter.accept('a.txt', 'text')).toBe(false)
    })

    it('空 HTML 应返回空 markdown（不抛异常，匹配参考行为）', async () => {
      const input: ConverterInput = {
        filePath: 'empty.html',
        textContent: '<html></html>',
        binaryContent: Buffer.from(''),
        format: 'html',
      }
      const result = await new HtmlConverter().convert(input)
      // Reference strips and returns; does not throw on empty
      expect(result).toHaveProperty('markdown')
      expect(typeof result.markdown).toBe('string')
    })
  })

  describe('CsvConverter', () => {
    it('应该将 CSV 转换为 Markdown 表格', async () => {
      const input = await makeInput('sample.csv', 'csv')
      const result = await new CsvConverter().convert(input)
      expect(result.markdown).toContain('| name | age | city |')
      expect(result.markdown).toContain('| Alice | 30 | Beijing |')
      expect(result.markdown).toContain('---')
    })

    it('应该支持 TSV 格式', async () => {
      const input = await makeInput('sample.tsv', 'csv')
      input.filePath = 'sample.tsv'
      const result = await new CsvConverter().convert(input)
      expect(result.markdown).toContain('| name | age | city |')
    })

    it('应该处理带引号的 CSV 字段', async () => {
      const input: ConverterInput = {
        filePath: 'quoted.csv',
        textContent: 'name,desc\n"Alice","Hello, World"\n"Bob","Line\nbreak"',
        binaryContent: Buffer.from(''),
        format: 'csv',
      }
      const result = await new CsvConverter().convert(input)
      expect(result.markdown).toContain('Hello, World')
    })

    it('空 CSV 应返回空 markdown（不抛异常，匹配参考行为）', async () => {
      const input: ConverterInput = {
        filePath: 'empty.csv',
        textContent: '',
        binaryContent: Buffer.from(''),
        format: 'csv',
      }
      const result = await new CsvConverter().convert(input)
      // Reference returns empty markdown for empty rows
      expect(result).toHaveProperty('markdown')
      expect(result.markdown).toBe('')
    })

    it('短行应填充空列以匹配表头长度（匹配参考行为）', async () => {
      const input: ConverterInput = {
        filePath: 'short.csv',
        textContent: 'a,b,c\n1,2\nx,y,z',
        binaryContent: Buffer.from(''),
        format: 'csv',
      }
      const result = await new CsvConverter().convert(input)
      // Reference pads short rows with empty strings
      expect(result.markdown).toContain('| 1 | 2 |  |')
    })
  })

  describe('JsonConverter', () => {
    it('应该将对象数组转换为表格', async () => {
      const input = await makeInput('sample.json', 'json')
      const result = await new JsonConverter().convert(input)
      expect(result.markdown).toContain('| name | age |')
      expect(result.markdown).toContain('| Alice | 30 |')
    })

    it('应该将非数组 JSON 放入代码块', async () => {
      const input: ConverterInput = {
        filePath: 'obj.json',
        textContent: '{"name":"test","value":123}',
        binaryContent: Buffer.from(''),
        format: 'json',
      }
      const result = await new JsonConverter().convert(input)
      expect(result.markdown).toContain('```json')
      expect(result.markdown).toContain('"name": "test"')
    })

    it('应该拒绝非法 JSON', async () => {
      const input: ConverterInput = {
        filePath: 'bad.json',
        textContent: '{invalid json}',
        binaryContent: Buffer.from(''),
        format: 'json',
      }
      await expect(new JsonConverter().convert(input)).rejects.toThrow(MarkitdownError)
    })
  })

  describe('XmlConverter', () => {
    it('应该将 XML 放入代码块', async () => {
      const input = await makeInput('sample.xml', 'xml')
      const result = await new XmlConverter().convert(input)
      expect(result.markdown).toContain('```xml')
      expect(result.markdown).toContain('<root>')
    })
  })

  describe('YamlConverter', () => {
    it('应该将 YAML 放入代码块', async () => {
      const input = await makeInput('sample.yaml', 'yaml')
      const result = await new YamlConverter().convert(input)
      expect(result.markdown).toContain('```yaml')
      expect(result.markdown).toContain('name: Sample')
    })

    it('应该拒绝非法 YAML', async () => {
      const input: ConverterInput = {
        filePath: 'bad.yaml',
        textContent: 'key: : : invalid',
        binaryContent: Buffer.from(''),
        format: 'yaml',
      }
      await expect(new YamlConverter().convert(input)).rejects.toThrow(MarkitdownError)
    })
  })

  describe('TextConverter', () => {
    it('应该原样返回纯文本内容', async () => {
      const input = await makeInput('sample.txt', 'text')
      const result = await new TextConverter().convert(input)
      expect(result.markdown).toContain('plain text file')
      expect(result.markdown).not.toContain('```')
    })
  })

  describe('MarkdownConverter', () => {
    it('应该原样返回 Markdown 内容', async () => {
      const input = await makeInput('sample.md', 'markdown')
      const result = await new MarkdownConverter().convert(input)
      expect(result.markdown).toContain('# Sample Markdown')
      expect(result.markdown).toContain('**markdown**')
    })
  })
})
