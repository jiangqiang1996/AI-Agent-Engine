import { describe, it, expect } from 'vitest'
import { selectDocumentReviewers } from './review-selector.js'
import { AGENT } from '../schemas/ae-asset-schema.js'

describe('selectDocumentReviewers', () => {
  it('plan 类型应包含 step-granularity-reviewer 和 batch-operation-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'plan' })
    expect(selected).toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).toContain(AGENT.BATCH_OPERATION_REVIEWER)
  })

  it('requirements 类型不应包含 step-granularity-reviewer 和 batch-operation-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements' })
    expect(selected).not.toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).not.toContain(AGENT.BATCH_OPERATION_REVIEWER)
  })

  it('plan 类型应始终包含 alwaysOn 代理（coherence、feasibility）', () => {
    const selected = selectDocumentReviewers({ documentType: 'plan' })
    expect(selected).toContain(AGENT.COHERENCE_REVIEWER)
    expect(selected).toContain(AGENT.FEASIBILITY_REVIEWER)
  })

  it('plan 类型应始终包含 product-lens-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'plan' })
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
  })

  it('requirements 类型应包含 alwaysOn 代理但不包含 plan 专属代理', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements' })
    expect(selected).toContain(AGENT.COHERENCE_REVIEWER)
    expect(selected).toContain(AGENT.FEASIBILITY_REVIEWER)
    expect(selected).not.toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).not.toContain(AGENT.BATCH_OPERATION_REVIEWER)
  })

  it('requirements 且 requirementCount >= 5 应激活条件角色', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements', requirementCount: 5 })
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
    expect(selected).toContain(AGENT.SCOPE_GUARDIAN_REVIEWER)
    expect(selected).toContain(AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  })

  it('plan 类型结果不应有重复代理', () => {
    const selected = selectDocumentReviewers({ documentType: 'plan' })
    expect(new Set(selected).size).toBe(selected.length)
  })
})
