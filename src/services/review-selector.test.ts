import { describe, it, expect } from 'vitest'
import { selectReviewers } from './review-selector.js'
import { AGENT } from '../schemas/ae-asset-schema.js'

describe('selectReviewers — 代码域', () => {
  it('代码域默认应返回 6 个 alwaysOn 代理', () => {
    const selected = selectReviewers({ kind: 'code' })
    expect(selected).toHaveLength(6)
    expect(selected).toContain(AGENT.CORRECTNESS_REVIEWER)
    expect(selected).toContain(AGENT.TESTING_REVIEWER)
    expect(selected).toContain(AGENT.MAINTAINABILITY_REVIEWER)
    expect(selected).toContain(AGENT.STANDARDS_REVIEWER)
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(selected).toContain(AGENT.LEARNINGS_REVIEWER)
  })

  it('代码域 hasSecurity 应激活 security-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_REVIEWER)
  })

  it('代码域 hasConfig 应激活 config-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasConfig: true })
    expect(selected).toContain(AGENT.CONFIG_REVIEWER)
  })

  it('代码域 hasInfra 应激活 infra-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasInfra: true })
    expect(selected).toContain(AGENT.INFRA_REVIEWER)
  })

  it('代码域 hasDatabase 应激活 database-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasDatabase: true })
    expect(selected).toContain(AGENT.DATABASE_REVIEWER)
  })

  it('代码域 hasScript 应激活 script-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasScript: true })
    expect(selected).toContain(AGENT.SCRIPT_REVIEWER)
  })

  it('代码域 hasMigrations 应激活 data-migrations-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasMigrations: true })
    expect(selected).toContain(AGENT.DATA_MIGRATIONS_REVIEWER)
  })

  it('代码域 changedLineCount >= 50 应激活 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 50 })
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
  })

  it('代码域结果不应有重复代理', () => {
    const selected = selectReviewers({
      kind: 'code',
      hasSecurity: true,
      hasApi: true,
      hasPerformance: true,
      changedLineCount: 100,
    })
    expect(new Set(selected).size).toBe(selected.length)
  })
})

describe('selectReviewers — 文档域', () => {
  it('文档域默认应返回 2 个 alwaysOn 代理', () => {
    const selected = selectReviewers({ kind: 'document' })
    expect(selected).toHaveLength(2)
    expect(selected).toContain(AGENT.COHERENCE_REVIEWER)
    expect(selected).toContain(AGENT.FEASIBILITY_REVIEWER)
  })

  it('文档域 plan 类型应激活 product-scope-reviewer 和 plan-quality-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'plan' })
    expect(selected).toContain(AGENT.PRODUCT_SCOPE_REVIEWER)
    expect(selected).toContain(AGENT.PLAN_QUALITY_REVIEWER)
  })

  it('文档域 requirements 类型不应激活 plan 专属代理', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'requirements' })
    expect(selected).not.toContain(AGENT.PLAN_QUALITY_REVIEWER)
  })

  it('文档域 test 类型应激活 test-case-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'test' })
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('文档域 general 类型应仅包含 alwaysOn 代理', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'general' })
    expect(selected).toHaveLength(2)
  })

  it('文档域 hasUi 应激活 design-lens-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', hasUi: true })
    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
  })

  it('文档域 hasSecurity 应激活 security-reviewer（跨域）', () => {
    const selected = selectReviewers({ kind: 'document', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_REVIEWER)
  })

  it('文档域 requirementCount >= 5 应激活 product-scope-reviewer 和 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', requirementCount: 5 })
    expect(selected).toContain(AGENT.PRODUCT_SCOPE_REVIEWER)
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
  })

  it('文档域 hasArchitectureDecision 应激活 adversarial-reviewer 和 architecture-strategist', () => {
    const selected = selectReviewers({ kind: 'document', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(selected).toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('文档域结果不应有重复代理', () => {
    const selected = selectReviewers({
      kind: 'document',
      documentType: 'plan',
      hasSecurity: true,
      hasUi: true,
      requirementCount: 6,
    })
    expect(new Set(selected).size).toBe(selected.length)
  })
})

describe('selectReviewers — 派生字段', () => {
  it('requirementCount 4 不应满足 requirementCountGte5', () => {
    const selected = selectReviewers({ kind: 'document', requirementCount: 4 })
    expect(selected).not.toContain(AGENT.PRODUCT_SCOPE_REVIEWER)
  })

  it('changedLineCount 49 不应激活 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 49 })
    expect(selected).not.toContain(AGENT.ADVERSARIAL_REVIEWER)
  })
})
