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
      format: 'html',
    })
    expect(result.format).toBe('html')
  })
})
