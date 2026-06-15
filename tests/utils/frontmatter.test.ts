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

  it('非行首分隔符不应被当作 frontmatter', () => {
    const parsed = parseFrontmatter('前言 ---\n---\nname: demo\n---\n正文')

    expect(parsed.data).toEqual({})
    expect(parsed.body).toContain('前言 ---')
  })

  it('不应解析第二段 frontmatter 为 data', () => {
    const parsed = parseFrontmatter('---\nname: first\n---\n---\nname: second\n---\n正文')

    expect(parsed.data).toMatchObject({ name: 'first' })
    expect(parsed.data).not.toHaveProperty('name', 'second')
    expect(parsed.body.trim()).toContain('正文')
  })

  it('仅分隔符行无内容时应返回空元数据', () => {
    const parsed = parseFrontmatter('---\n---\n正文')

    expect(parsed.data).toEqual({})
    expect(parsed.body.trim()).toBe('正文')
  })

  it('应该保留 YAML frontmatter 的原始值类型', () => {
    const parsed = parseFrontmatter('---\nsubtask: true\nsteps: 3\ndate: 2026-05-09\nmetadata:\n  audience: maintainer\n---\n正文')

    expect(parsed.data).toEqual({
      subtask: true,
      steps: 3,
      date: '2026-05-09',
      metadata: {
        audience: 'maintainer',
      },
    })
  })
})
