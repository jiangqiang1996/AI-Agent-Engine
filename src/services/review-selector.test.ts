import { describe, expect, it } from 'vitest'

import { selectCodeReviewers, selectDocumentReviewers } from './review-selector.js'

describe('review-selector', () => {
  it('应该为计划文档选择文档审查 reviewer', () => {
    const reviewers = selectDocumentReviewers({
      documentType: 'plan',
      requirementCount: 6,
      hasSecurity: true,
    })

    expect(reviewers).toContain('coherence-reviewer')
    expect(reviewers).toContain('product-lens-reviewer')
    expect(reviewers).toContain('security-lens-reviewer')
  })

  it('应该为 TypeScript CLI 改动命中对应 reviewer', () => {
    const reviewers = selectCodeReviewers({
      hasTypescript: true,
      hasCli: true,
      changedLineCount: 60,
    })

    expect(reviewers).toContain('kieran-typescript-reviewer')
    expect(reviewers).toContain('cli-readiness-reviewer')
    expect(reviewers).toContain('adversarial-reviewer')
  })
})
