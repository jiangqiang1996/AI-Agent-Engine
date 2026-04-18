import { describe, expect, it } from 'vitest'

import { parseFrontmatter } from './frontmatter.js'

describe('frontmatter', () => {
  it('应该解析带 frontmatter 的 markdown', () => {
    const result = parseFrontmatter(`---\nname: ae:plan\ndescription: 生成计划\n---\n正文`)
    expect(result.data.name).toBe('ae:plan')
    expect(result.body).toBe('正文')
  })

  it('应该在没有 frontmatter 时返回原文', () => {
    const result = parseFrontmatter('正文')
    expect(result.data).toEqual({})
    expect(result.body).toBe('正文')
  })
})
