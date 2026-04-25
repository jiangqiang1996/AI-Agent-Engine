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
    expect(selected).not.toContain(AGENT.TEST_CASE_REVIEWER)
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

  it('test 类型应包含 coherence、feasibility 和 test-case-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'test' })
    expect(selected).toContain(AGENT.COHERENCE_REVIEWER)
    expect(selected).toContain(AGENT.FEASIBILITY_REVIEWER)
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('test 类型不应包含 plan 专属代理', () => {
    const selected = selectDocumentReviewers({ documentType: 'test' })
    expect(selected).not.toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).not.toContain(AGENT.BATCH_OPERATION_REVIEWER)
  })

  it('test 类型且 hasUi 应包含 design-lens-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'test', hasUi: true })
    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
  })

  it('test 类型且 hasSecurity 应包含 security-lens-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'test', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_LENS_REVIEWER)
  })

  it('general 类型应仅包含 alwaysOn 代理', () => {
    const selected = selectDocumentReviewers({ documentType: 'general' })
    expect(selected).toContain(AGENT.COHERENCE_REVIEWER)
    expect(selected).toContain(AGENT.FEASIBILITY_REVIEWER)
    expect(selected).toHaveLength(2)
  })

  it('general 类型不应包含任何 documentType 专属代理', () => {
    const selected = selectDocumentReviewers({ documentType: 'general' })
    expect(selected).not.toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).not.toContain(AGENT.BATCH_OPERATION_REVIEWER)
    expect(selected).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('general 类型且 hasUi 应包含 design-lens-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'general', hasUi: true })
    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
  })

  it('hasArchitectureDecision 应激活 adversarial-document-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  })

  it('isHighRiskDomain 应激活 adversarial-document-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements', isHighRiskDomain: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  })

  it('hasNewAbstraction 应激活 adversarial-document-reviewer', () => {
    const selected = selectDocumentReviewers({ documentType: 'requirements', hasNewAbstraction: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  })
})
