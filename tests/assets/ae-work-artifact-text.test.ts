import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const shippingText = readFileSync('src/assets/skills/ae-work/references/shipping-workflow.md', 'utf8')

describe('ae:work 产物与交付文本契约', () => {
  it('应该把产物迁移边界落在技能文本而非仅靠 rules', () => {
    expect(skillText).toContain('首版不自动迁移 AE 产物')
    expect(skillText).toContain('不得靠最近修改时间或相近 topic 批量复制 `docs/ae/*`')
    expect(skillText).toContain('若用户要求迁移产物但无法唯一确定当前任务关联需求/计划，必须询问用户')
  })

  it('应该要求最终交付记录 worktree 决策和结构化证据', () => {
    expect(shippingText).toContain('worktree_decision')
    expect(shippingText).toContain('git_operation_args')
    expect(shippingText).toContain('git_authorization_evidence')
    expect(shippingText).toContain('user_authorized_git_write` 只是声明证据')
    expect(shippingText).toContain('review_evidence')
  })

  it('应该把 A 到 B 转移状态与功能交付完成区分开', () => {
    expect(shippingText).toContain('执行已转移 / 等待用户在 B 重启')
    expect(shippingText).toContain('不是“功能交付完成”')
  })
})
