import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-lfg/SKILL.md', 'utf8')
const routingText = readFileSync('src/assets/skills/ae-lfg/references/task-routing.md', 'utf8')

describe('ae:lfg 门禁文本契约', () => {
  it('应该同步最终门禁的新证据字段', () => {
    expect(skillText).toContain('review_evidence:{...}')
    expect(skillText).toContain('git_operation_args')
    expect(skillText).toContain('git_authorization_evidence')
    expect(skillText).toContain('不能只依赖 `user_authorized_git_write`')
  })

  it('应该要求 S3 正式交付记录 worktree 决策', () => {
    expect(routingText).toContain('worktree 决策')
    expect(routingText).toContain('修改项目文件前完成 worktree 决策')
    expect(routingText).toContain('拒绝 worktree 不等于允许直接在默认分支实现')
  })
})
