import { describe, it, expect } from 'vitest'
import { REVIEW_MATRIX } from './review-catalog.js'
import { AGENT } from '../schemas/ae-asset-schema.js'

describe('REVIEW_MATRIX', () => {
  it('应包含 20 个条目', () => {
    expect(REVIEW_MATRIX).toHaveLength(20)
  })

  it('代码域 alwaysOn 应为 6 个', () => {
    const codeAlwaysOn = REVIEW_MATRIX.filter((r) => r.domain === 'code' && r.alwaysOn)
    expect(codeAlwaysOn).toHaveLength(6)
    expect(codeAlwaysOn.map((r) => r.name)).toEqual([
      AGENT.CORRECTNESS_REVIEWER,
      AGENT.TESTING_REVIEWER,
      AGENT.MAINTAINABILITY_REVIEWER,
      AGENT.STANDARDS_REVIEWER,
      AGENT.AGENT_NATIVE_REVIEWER,
      AGENT.RESEARCH_REVIEWER,
    ])
  })

  it('文档域 alwaysOn 应为 2 个', () => {
    const docAlwaysOn = REVIEW_MATRIX.filter((r) => r.domain === 'document' && r.alwaysOn)
    expect(docAlwaysOn).toHaveLength(2)
    expect(docAlwaysOn.map((r) => r.name)).toEqual([
      AGENT.COHERENCE_REVIEWER,
      AGENT.FEASIBILITY_REVIEWER,
    ])
  })

  it('跨域条目应为 security-reviewer 和 adversarial-reviewer', () => {
    const both = REVIEW_MATRIX.filter((r) => r.domain === 'both')
    expect(both).toHaveLength(2)
    expect(both.map((r) => r.name)).toEqual([AGENT.SECURITY_REVIEWER, AGENT.ADVERSARIAL_REVIEWER])
  })

  it('每个条目应有非空 description', () => {
    for (const entry of REVIEW_MATRIX) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('代码域条件条目应包含 5 个', () => {
    const codeConditional = REVIEW_MATRIX.filter((r) => r.domain === 'code' && !r.alwaysOn)
    expect(codeConditional).toHaveLength(5)
  })

  it('文档域条件条目应包含 5 个', () => {
    const docConditional = REVIEW_MATRIX.filter((r) => r.domain === 'document' && !r.alwaysOn)
    expect(docConditional).toHaveLength(5)
  })

  it('standards-reviewer 应包含配置审查职责', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.STANDARDS_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.description).toContain('配置')
  })

  it('product-lens-reviewer 应存在于文档域条件条目', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.PRODUCT_LENS_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.domain).toBe('document')
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('条件条目必须有 conditionGroups', () => {
    const conditional = REVIEW_MATRIX.filter((r) => !r.alwaysOn)
    for (const entry of conditional) {
      expect(entry.conditionGroups).toBeDefined()
      expect(entry.conditionGroups!.length).toBeGreaterThan(0)
    }
  })

  it('alwaysOn 条目不应有 conditionGroups', () => {
    const alwaysOn = REVIEW_MATRIX.filter((r) => r.alwaysOn)
    for (const entry of alwaysOn) {
      expect(entry.conditionGroups).toBeUndefined()
    }
  })
})
