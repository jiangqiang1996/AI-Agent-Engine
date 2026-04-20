import { describe, expect, it } from 'vitest'

import { getArgumentContracts } from './argument-contract.js'

describe('argument-contract', () => {
  it('应该为每个公开入口生成参数契约', () => {
    expect(getArgumentContracts()).toHaveLength(16)
  })

  it('应该保留带 mode:* 的审查参数约定', () => {
    const review = getArgumentContracts().find((entry) => entry.commandName === 'ae-review-code')
    expect(review?.supportsModes).toBe(true)
  })
})
