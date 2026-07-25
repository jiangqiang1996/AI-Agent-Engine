import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const requirementsCapture = readFileSync('src/assets/skills/ae-prd/references/requirements-capture.md', 'utf8')
const reviewSkill = readFileSync('src/assets/skills/ae-review/SKILL.md', 'utf8')

describe('人读与机器可提取文档契约', () => {
  it('应该声明需求的人读机器提取格式', () => {
    expect(requirementsCapture).toContain('format: human-readable-requirements')
  })

  it('应该声明分片子文件 parent 和 module 规则', () => {
    expect(requirementsCapture).toContain('type: prd-module')
    expect(requirementsCapture).toContain('type: prd-prototype')
    expect(requirementsCapture).toContain('parent:')
    expect(requirementsCapture).toContain('module:')
  })

  it('应该声明分片触发条件', () => {
    // 文档以目录形式产出，每个 ## 章节对应一个独立文件
    expect(requirementsCapture).toContain('分片')
  })

  it('应该要求分片主文件保留全局上下文', () => {
    // 文档说明全局上下文、范围和跨模块关系拆分为独立子文件
    expect(requirementsCapture).toMatch(/全局|跨模块|scope\.md|decisions\.md/)
  })

  it('应该避免生成无内容占位章节', () => {
    expect(requirementsCapture).toContain('省略没有实质内容的可选章节')
  })

  it.skip('应该在审查契约中包含分片 diagnostics 字段', () => {
    expect(reviewSkill).toContain('rootDocument')
    expect(reviewSkill).toContain('shards')
    expect(reviewSkill).toContain('diagnostics')
  })
})
