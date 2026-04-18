import { describe, expect, it } from 'vitest'

import { selectCodeReviewers, selectDocumentReviewers } from '../../src/services/review-selector.js'
import { runReviewGate } from '../../src/services/review-orchestration.js'

describe('review-orchestration integration', () => {
  it('应该为计划文档选择 document-review reviewer family', () => {
    const reviewers = selectDocumentReviewers({
      documentType: 'plan',
      requirementCount: 8,
    })

    expect(reviewers).toContain('coherence-reviewer')
    expect(reviewers).toContain('product-lens-reviewer')
  })

  it('应该为高风险 TypeScript 改动选择代码审查 reviewer 并执行 gate', () => {
    const reviewers = selectCodeReviewers({
      hasTypescript: true,
      hasCli: true,
      changedLineCount: 80,
      hasSecurity: true,
    })

    const result = runReviewGate([
      {
        reviewer: reviewers[0] ?? 'correctness-reviewer',
        title: '高风险问题',
        severity: 'P1',
        autofixClass: 'manual',
        message: '需要人工确认',
        evidence: [],
        requiresVerification: true,
      },
    ])

    expect(reviewers).toContain('adversarial-reviewer')
    expect(result.blocked).toBe(true)
  })
})
