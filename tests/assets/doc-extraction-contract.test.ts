import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const brainstormCapture = readFileSync('src/assets/skills/ae-prd/references/requirements-capture.md', 'utf8')
const designTemplate = readFileSync('src/assets/skills/ae-design/references/design-output-template.md', 'utf8')
const designSkill = readFileSync('src/assets/skills/ae-design/SKILL.md', 'utf8')

describe('文档收敛契约', () => {
  it('应该只保留便于人读的核心章节', () => {
    expect(brainstormCapture).not.toContain('## 用户与场景')
    expect(brainstormCapture).not.toContain('## 术语表')
    expect(brainstormCapture).not.toContain('视觉沟通')
    expect(brainstormCapture).not.toContain('## 下一步')
    expect(designTemplate).not.toContain('## 影响面 [可选]')
  })

  it('不应该再引用旧文档互转技能和等价审查代理', () => {
    for (const text of [brainstormCapture, designTemplate, designSkill]) {
      expect(text).not.toContain('ae:doc-humanize')
      expect(text).not.toContain('ae:doc-structure')
      expect(text).not.toContain('doc-equivalence')
    }
  })

  it('应该声明稳定 ID 体系', () => {
    expect(brainstormCapture).toContain('稳定 ID')
  })
})
