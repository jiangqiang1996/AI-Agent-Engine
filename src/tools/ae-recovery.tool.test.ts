import { describe, expect, it } from 'vitest'

import { aeRecoveryTool } from './ae-recovery.tool.js'

describe('ae-recovery.tool', () => {
  it('应该返回带 nextSkill 的 lfg 恢复结果', async () => {
    const output = await aeRecoveryTool.execute(
      {
        phase: 'lfg',
      },
      {} as never,
    )

    const parsed = JSON.parse(output as string) as { phase: string; nextSkill?: string }
    expect(parsed.phase).toBe('lfg')
    expect(typeof parsed.nextSkill).toBe('string')
  })

  it('应该接受 plan-review 作为恢复阶段', async () => {
    const output = await aeRecoveryTool.execute(
      {
        phase: 'plan-review',
      },
      {} as never,
    )

    const parsed = JSON.parse(output as string) as { phase: string }
    expect(parsed.phase).toBe('plan-review')
  })
})
