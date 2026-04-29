import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scopeText = readFileSync('src/assets/skills/ae-review/references/scope-detection.md', 'utf8')
const synthesisText = readFileSync('src/assets/skills/ae-review/references/synthesis-and-presentation.md', 'utf8')

describe('ae:review 状态文件文本契约', () => {
  it('应该记录并校验 worktree 指纹', () => {
    expect(scopeText).toContain('worktree')
    expect(scopeText).toContain('statusSummary')
    expect(scopeText).toContain('当前 worktree 身份、分支名、HEAD 和工作区状态摘要')
    expect(scopeText).toContain('字段缺失、不匹配或无法证明一致时')
    expect(scopeText).toContain('同分支不同 worktree')
  })

  it('应该在审查后写入工作区身份和状态摘要', () => {
    expect(synthesisText).toContain('当前 worktree 身份、branch、HEAD、工作区状态摘要和审查时间')
    expect(synthesisText).toContain('缺失或不匹配时保守视为未审查')
  })
})
