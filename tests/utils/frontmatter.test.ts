import { describe, expect, it } from 'vitest'

import { parseFrontmatter } from '../../src/utils/frontmatter.js'

describe('frontmatter 工具', () => {
  it('应该解析带 BOM 的 Markdown frontmatter', () => {
    const parsed = parseFrontmatter('\uFEFF---\nname: demo\nmode: primary\n---\n\n# 正文\n')

    expect(parsed.data).toMatchObject({
      name: 'demo',
      mode: 'primary',
    })
    expect(parsed.body).not.toContain('mode: primary')
    expect(parsed.body.trim()).toBe('# 正文')
  })

  it('应该解析包含冒号的引号字符串', () => {
    const parsed = parseFrontmatter('---\ndescription: "调用 http://example.com 测试"\n---\n正文')

    expect(parsed.data.description).toBe('调用 http://example.com 测试')
    expect(parsed.body).toBe('正文')
  })

  it('缺少 frontmatter 时应该返回空元数据和原始正文', () => {
    const parsed = parseFrontmatter('# 正文')

    expect(parsed.data).toEqual({})
    expect(parsed.body).toBe('# 正文')
  })

  it('应该保持 frontmatter 返回值为字符串契约', () => {
    const parsed = parseFrontmatter('---\nsubtask: true\nsteps: 3\ndate: 2026-05-09\n---\n正文')

    expect(parsed.data).toEqual({
      subtask: 'true',
      steps: '3',
      date: '2026-05-09',
    })
  })
})
