import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { MarkitdownError } from '../../src/services/markitdown-errors.js'
import { convertToMarkdown } from '../../src/services/markitdown-service.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')

describe('markitdown-service', () => {
  it('应该转换 HTML 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('html')
    expect(result.markdown).toContain('# Hello World')
    expect(result.title).toBe('Sample HTML')
  })

  it('应该转换 CSV 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.csv')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('csv')
    expect(result.markdown).toContain('| name | age | city |')
  })

  it('应该转换 JSON 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.json')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('json')
    expect(result.markdown).toContain('| name | age |')
  })

  it('应该转换 XML 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.xml')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('xml')
    expect(result.markdown).toContain('```xml')
  })

  it('应该转换 YAML 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.yaml')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('yaml')
    expect(result.markdown).toContain('```yaml')
  })

  it('应该转换文本文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('text')
    expect(result.markdown).toContain('plain text file')
  })

  it('应该转换 Markdown 文件', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.md')),
      worktree: process.cwd(),
    })
    expect(result.format).toBe('markdown')
    expect(result.markdown).toContain('# Sample Markdown')
  })

  it('应该在文件不存在时抛出 MarkitdownError', async () => {
    await expect(
      convertToMarkdown({
        file: 'nonexistent-file.txt',
        worktree: process.cwd(),
      }),
    ).rejects.toThrow(MarkitdownError)
  })

  it('应该支持 format 覆盖扩展名推断', async () => {
    const result = await convertToMarkdown({
      file: path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt')),
      worktree: process.cwd(),
      format: 'markdown',
    })
    expect(result.format).toBe('markdown')
  })
})
