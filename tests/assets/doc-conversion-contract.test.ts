import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const brainstormCapture = readFileSync('src/assets/skills/ae-brainstorm/references/requirements-capture.md', 'utf8')
const planTemplate = readFileSync('src/assets/skills/ae-plan/references/plan-template.md', 'utf8')
const humanizeRequirements = readFileSync('src/assets/skills/ae-doc-humanize/references/requirements-template.md', 'utf8')
const humanizeDesign = readFileSync('src/assets/skills/ae-doc-humanize/references/design-template.md', 'utf8')
const structuredRequirements = readFileSync('src/assets/skills/ae-doc-structure/references/structured-requirements-template.md', 'utf8')
const structuredPlan = readFileSync('src/assets/skills/ae-doc-structure/references/structured-plan-template.md', 'utf8')
const equivalenceReviewer = readFileSync('src/assets/agents/review/doc-equivalence-reviewer.md', 'utf8')

function extractTemplateHeadings(content: string): string[] {
  const template = content.match(/```markdown\r?\n([\s\S]*?)\r?\n```/)
  if (!template) {
    throw new Error('doc-conversion-contract/template-headings: 找不到 markdown 模板块')
  }

  return Array.from(template[1].matchAll(/^## .+$/gm)).map((match) => match[0])
}

describe('文档互转收敛契约', () => {
  it('应该只保留便于大模型识别的核心章节', () => {
    expect(brainstormCapture).not.toContain('## 用户与场景')
    expect(brainstormCapture).not.toContain('## 术语表')
    expect(brainstormCapture).not.toContain('视觉沟通')
    expect(brainstormCapture).not.toContain('## 下一步')
    expect(planTemplate).not.toContain('## 影响面 [可选]')
    expect(humanizeRequirements).not.toContain('## 用户与使用场景 [可选]')
    expect(humanizeRequirements).not.toContain('## 参考信息 [可选]')
    expect(humanizeDesign).not.toContain('## 影响面 [可选]')
    expect(structuredRequirements).not.toContain('## 用户与场景')
    expect(structuredRequirements).not.toContain('## 术语表')
    expect(structuredPlan).not.toContain('## 影响面 [可选]')
  })

  it('应该让结构化模板与源模板的章节骨架尽可能一致', () => {
    expect(extractTemplateHeadings(structuredRequirements)).toEqual(extractTemplateHeadings(brainstormCapture))
    expect(extractTemplateHeadings(structuredPlan)).toEqual(extractTemplateHeadings(planTemplate))
  })

  it('应该把等价审查限制在核心需求和实现内容', () => {
    expect(equivalenceReviewer).toContain('只建立正文核心清单')
    expect(equivalenceReviewer).toContain('只审查核心需求/设计部分')
    expect(equivalenceReviewer).toContain('不审查文档说明、AI 解析契约、等价性检查或其他说明性章节的等价性')
  })
})
