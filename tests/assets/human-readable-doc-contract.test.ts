import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const requirementsCapture = readFileSync('src/assets/skills/ae-brainstorm/references/requirements-capture.md', 'utf8')
const planTemplate = readFileSync('src/assets/skills/ae-plan/references/plan-template.md', 'utf8')
const planSkill = readFileSync('src/assets/skills/ae-plan/SKILL.md', 'utf8')
const reviewSkill = readFileSync('src/assets/skills/ae-review/SKILL.md', 'utf8')

describe('人读与机器可提取文档契约', () => {
  it('应该声明需求和计划的人读机器提取格式', () => {
    expect(requirementsCapture).toContain('format: human-readable-requirements')
    expect(planTemplate).toContain('format: human-readable-plan')
    expect(planSkill).toContain('format: human-readable-plan')
  })

  it('应该只允许按模块数量或用户明确要求触发分片', () => {
    for (const text of [requirementsCapture, planTemplate, planSkill]) {
      expect(text).toContain('模块数量大于 1')
      expect(text).toContain('用户明确要求')
    }

    expect(planTemplate).toContain('不得按功能数量、实现单元数量、文档行数或预估 token 数自动分片')
  })

  it('应该要求分片主文件保留全局上下文和跨模块关系', () => {
    for (const text of [requirementsCapture, planTemplate]) {
      expect(text).toContain('不能退化为分片路径列表')
      expect(text).toMatch(/全局范围|全局上下文/)
      expect(text).toContain('跨模块')
    }

    expect(planTemplate).toContain('共享数据')
    expect(planTemplate).toContain('接口边界')
  })

  it('应该声明分片子文件 parent 和 module 规则', () => {
    expect(requirementsCapture).toContain('type: brainstorm-shard')
    expect(planTemplate).toContain('type: plan-shard')
    expect(planTemplate).toContain('type: design-shard')
    for (const text of [requirementsCapture, planTemplate]) {
      expect(text).toContain('parent: <主文件仓库相对路径>')
      expect(text).toContain('module: <模块名>')
    }
  })

  it('应该要求实现单元包含唯一产出物', () => {
    expect(planTemplate).toContain('唯一产出物')
    expect(planSkill).toContain('唯一产出物')
  })

  it('应该避免生成无内容占位章节', () => {
    expect(planTemplate).toContain('可选章节仅在有实质内容时包含')
    expect(planTemplate).toContain('不得写“暂无”“待补充”等占位内容')
    expect(requirementsCapture).toContain('省略没有实质内容的可选章节')
  })

  it('应该在审查契约中包含分片 diagnostics 字段', () => {
    expect(reviewSkill).toContain('rootDocument')
    expect(reviewSkill).toContain('shards')
    expect(reviewSkill).toContain('diagnostics')
  })
})
