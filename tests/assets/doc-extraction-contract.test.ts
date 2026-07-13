import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const brainstormCapture = readFileSync('src/assets/skills/ae-prd/references/requirements-capture.md', 'utf8')
const designTemplate = readFileSync('src/assets/skills/ae-design/references/design-output-template.md', 'utf8')
const designSkill = readFileSync('src/assets/skills/ae-design/SKILL.md', 'utf8')
const reviewAgentPaths = [
  'src/assets/agents/domains/review/specialists/adversarial-reviewer.md',
  'src/assets/agents/domains/review/specialists/coherence-reviewer.md',
  'src/assets/agents/domains/review/specialists/design-lens-reviewer.md',
  'src/assets/agents/domains/review/specialists/feasibility-reviewer.md',
  'src/assets/agents/domains/review/specialists/product-lens-reviewer.md',
  'src/assets/agents/domains/review/specialists/security-reviewer.md',
]

describe('文档抽取收敛契约', () => {
  it('应该只保留便于人读和机器抽取的核心章节', () => {
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

  it('应该声明 ae-doc-extract 可依赖的稳定结构', () => {
    expect(brainstormCapture).toContain('稳定 ID')
    expect(brainstormCapture).toContain('ae-doc-extract')
  })

  it('文档审查代理应该支持分片文档集合输入', () => {
    for (const path of reviewAgentPaths) {
      const agent = readFileSync(path, 'utf8')
      expect(agent).toContain('rootDocument')
      expect(agent).toContain('shards')
      expect(agent).toContain('missingShards')
      expect(agent).toContain('duplicateIds')
      expect(agent).toContain('parentMismatch')
      expect(agent).toContain('globalRelations')
      expect(agent).toContain('diagnostics')
      expect(agent).toContain('ae-doc-extract')
      expect(agent).toContain('diagnostics.code')
      expect(agent).toContain('missing-shard')
      expect(agent).toContain('duplicate-id')
      expect(agent).toContain('parent-mismatch')
      expect(agent).toMatch(/同一(?:份)?(?:\S{0,8})文档集合|同一设计集合|同一设计文档集合|同一产品\/范围文档集合/)
    }
  })
})
