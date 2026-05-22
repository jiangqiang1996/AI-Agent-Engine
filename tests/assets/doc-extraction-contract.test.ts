import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const brainstormCapture = readFileSync('src/assets/skills/ae-brainstorm/references/requirements-capture.md', 'utf8')
const planTemplate = readFileSync('src/assets/skills/ae-plan/references/plan-template.md', 'utf8')
const planSkill = readFileSync('src/assets/skills/ae-plan/SKILL.md', 'utf8')

describe('文档抽取收敛契约', () => {
  it('应该只保留便于人读和机器抽取的核心章节', () => {
    expect(brainstormCapture).not.toContain('## 用户与场景')
    expect(brainstormCapture).not.toContain('## 术语表')
    expect(brainstormCapture).not.toContain('视觉沟通')
    expect(brainstormCapture).not.toContain('## 下一步')
    expect(planTemplate).not.toContain('## 影响面 [可选]')
  })

  it('不应该再引用旧文档互转技能和等价审查代理', () => {
    for (const text of [brainstormCapture, planTemplate, planSkill]) {
      expect(text).not.toContain('ae:doc-humanize')
      expect(text).not.toContain('ae:doc-structure')
      expect(text).not.toContain('doc-equivalence')
    }
  })

  it('应该声明 ae-doc-extract 可依赖的稳定结构', () => {
    expect(brainstormCapture).toContain('稳定 ID')
    expect(brainstormCapture).toContain('ae-doc-extract')
    expect(planTemplate).toContain('AI 解析契约')
    expect(planSkill).toContain('ae-doc-extract')
  })
})
