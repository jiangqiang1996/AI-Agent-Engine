import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const requirementsCapture = readFileSync('src/assets/skills/ae-prd/references/requirements-capture.md', 'utf8')
const reviewSkill = readFileSync('src/assets/skills/ae-review/SKILL.md', 'utf8')

describe('人读与机器可提取文档契约', () => {
  it('应该声明需求的人读机器提取格式', () => {
    expect(requirementsCapture).toContain('format: human-readable-requirements')
  })

  it('应该只允许按模块数量或用户明确要求触发分片', () => {
    expect(requirementsCapture).toContain('模块数量大于 1')
    expect(requirementsCapture).toContain('用户明确要求')
  })

  it('应该要求分片主文件保留全局上下文和跨模块关系', () => {
    expect(requirementsCapture).toContain('不能退化为分片路径列表')
    expect(requirementsCapture).toMatch(/全局范围|全局上下文/)
    expect(requirementsCapture).toContain('跨模块')
  })

  it('应该声明分片子文件 parent 和 module 规则', () => {
    expect(requirementsCapture).toContain('type: prd-shard')
    expect(requirementsCapture).toContain('parent: <主文件仓库相对路径>')
    expect(requirementsCapture).toContain('module: <模块名>')
  })

  it('应该避免生成无内容占位章节', () => {
    expect(requirementsCapture).toContain('省略没有实质内容的可选章节')
  })

  it('应该在审查契约中包含分片 diagnostics 字段', () => {
    expect(reviewSkill).toContain('rootDocument')
    expect(reviewSkill).toContain('shards')
    expect(reviewSkill).toContain('diagnostics')
  })
})
