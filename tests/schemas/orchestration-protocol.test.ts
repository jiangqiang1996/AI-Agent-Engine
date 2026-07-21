import { describe, expect, it } from 'vitest'

import { TaskIntentSchema } from '../../src/schemas/orchestration-protocol.js'

describe('TaskIntentSchema', () => {
  const validBase = {
    stage: 'entry' as const,
    intent: '实现功能',
    domain: 'development',
    rawInput: '实现功能',
    timestamp: '2026-07-21T00:00:00.000Z',
  }

  it('应该在不传 constraints 时默认为空数组', () => {
    const parsed = TaskIntentSchema.parse(validBase)

    expect(parsed.constraints).toEqual([])
  })

  it('应该在传入 constraints 时保留原值', () => {
    const parsed = TaskIntentSchema.parse({
      ...validBase,
      constraints: ['不修改生产代码', '仅新增测试文件'],
    })

    expect(parsed.constraints).toEqual(['不修改生产代码', '仅新增测试文件'])
  })

  it('应该在 constraints 为非数组时拒绝', () => {
    expect(() =>
      TaskIntentSchema.parse({
        ...validBase,
        constraints: '不是数组',
      }),
    ).toThrow()
  })
})
