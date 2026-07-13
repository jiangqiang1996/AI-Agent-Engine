import { describe, expect, it } from 'vitest'

import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'
import { getLifecycleCatalogDescription } from '../../src/services/lifecycle-contract.js'
import { SKILL } from '../../src/schemas/ae-asset-schema.js'

describe('lifecycle-contract 服务', () => {
  it('应该为 catalog 提供稳定生命周期阶段描述', () => {
    expect(getLifecycleCatalogDescription('work')).toBe('实施阶段：执行设计或直接任务，产出代码、文档、测试用例、设计、报告或其他交付物')
  })

  it('核心 catalog 应该消费生命周期阶段描述', () => {
    const entries = getPhaseOneEntries()
    const workEntry = entries.find((entry) => entry.skillName === SKILL.WORK)
    const reviewEntry = entries.find((entry) => entry.skillName === SKILL.REVIEW)

    expect(workEntry?.description).toBe(getLifecycleCatalogDescription('work'))
    expect(reviewEntry?.description.startsWith(getLifecycleCatalogDescription('outcome-review'))).toBe(true)
  })
})
