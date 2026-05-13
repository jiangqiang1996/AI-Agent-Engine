import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const planHandoffText = readFileSync('src/assets/skills/ae-plan/references/plan-handoff.md', 'utf8')

describe('ae-plan 资产文本契约', () => {
  it('应该在直接计划完成后只提示下一步而不自动进入 work', () => {
    expect(planHandoffText).toContain('只呈现下一步选项，不自动执行任何后续技能')
    expect(planHandoffText).toContain('由用户确认后另行发起')
    expect(planHandoffText).toContain('不得在当前 `ae:plan` 流程中自动调用 `ae:work`')
    expect(planHandoffText).not.toContain('根据选择路由')
  })

  it('应该保留管道模式返回调用者的边界', () => {
    expect(planHandoffText).toContain('**管道模式：** 跳过交互菜单，立即将控制权返回给调用者。')
  })
})
