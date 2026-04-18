import { describe, expect, it } from 'vitest'

import { CODE_REVIEWERS, DOCUMENT_REVIEWERS } from '../../src/services/review-catalog.js'

describe('review-catalog integration', () => {
  it('应该包含文档审查与代码审查所需的最小 reviewer 集', () => {
    expect(DOCUMENT_REVIEWERS.some((reviewer) => reviewer.name === 'coherence-reviewer')).toBe(true)
    expect(CODE_REVIEWERS.some((reviewer) => reviewer.name === 'correctness-reviewer')).toBe(true)
  })
})
