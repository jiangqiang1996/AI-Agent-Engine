import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-task-loop/SKILL.md', 'utf8')

describe('ae:task-loop worktree 文本契约', () => {
  it('应该排除 ae:work 技能委派', () => {
    expect(skillText).toContain('ae:work 排除规则')
    expect(skillText).toContain('输入解析时无视 `ae:work` 或 `/ae-work` 前缀')
    expect(skillText).toContain('全流程禁止调用 ae:work 技能')
  })

  it('应该在 Phase 0 收集所有交互后进入禁言期', () => {
    expect(skillText).toContain('交互全部前置')
    expect(skillText).toContain('Phase 0 解决所有用户问题')
    expect(skillText).toContain('此后直至 Phase 3 禁止 `question` 工具或任何形式提问')
  })

  it('应该要求循环体禁止交互和委派', () => {
    expect(skillText).toContain('变更策略由 LLM 自主决策。禁止提问，禁止调用 ae:work。')
    expect(skillText).toContain('遇到歧义自行决策')
    expect(skillText).toContain('循环体中不确定情况自行选择最优解，不得暂停或退出')
  })

  it('应该要求双重退出校验', () => {
    expect(skillText).toContain('ae:review 无阻断发现 AND 成功条件全部达成')
    expect(skillText).toContain('两者独立校验不互蕴含')
  })

  it('应该在 Phase 2 禁止交互和委派', () => {
    expect(skillText).toContain('禁止提问，禁止调用 ae:work')
    expect(skillText).toContain('变更策略由 LLM 自主决策')
    expect(skillText).toContain('禁止委派子代理实施')
  })

  it('应该在 Phase 2 内联实施中禁止交互', () => {
    expect(skillText).toContain('Phase 2：内联实施 + ae:review 循环（禁止交互）')
    expect(skillText).toContain('禁止提问，禁止调用 ae:work')
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(skillText).not.toContain('默认创建独立 worktree')
    expect(skillText).not.toContain('一律准备创建独立 worktree')
    expect(skillText).not.toContain('不询问用户是否创建 worktree')
    expect(skillText).not.toContain('显式声明不使用 worktree')
    expect(skillText).not.toContain('未显式禁用 worktree')
  })

  it('应该要求 Phase 0 推导成功条件并锁死', () => {
    expect(skillText).toContain('推导 3-8 条可客观验证的成功条件')
    expect(skillText).toContain('成功条件锁死')
    expect(skillText).toContain('用户确认后锁死')
  })
})
