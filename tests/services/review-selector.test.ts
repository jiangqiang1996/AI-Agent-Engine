import { describe, it, expect } from 'vitest'
import { selectReviewers } from '../../src/services/review-selector.js'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'

describe('selectReviewers — 代码域', () => {
  it('代码域默认应返回 5 个 alwaysOn 代理', () => {
    const selected = selectReviewers({ kind: 'code' })
    expect(selected).toHaveLength(5)
    expect(selected).toContain(AGENT.CORRECTNESS_REVIEWER)
    expect(selected).toContain(AGENT.TESTING_REVIEWER)
    expect(selected).toContain(AGENT.MAINTAINABILITY_REVIEWER)
    expect(selected).toContain(AGENT.STANDARDS_REVIEWER)
    expect(selected).toContain(AGENT.RESEARCH_REVIEWER)
    expect(selected).not.toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域 hasCli 应激活 agent-native-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasCli: true })
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域 hasUi 应激活 agent-native-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasUi: true })
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域 hasTooling 应激活 agent-native-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasTooling: true })
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域 hasAgentConfig 应激活 agent-native-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasAgentConfig: true })
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域普通 hasConfig 不应单独激活 agent-native-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasConfig: true })
    expect(selected).not.toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('代码域 hasArchitectureDecision 应激活 architecture-strategist', () => {
    const selected = selectReviewers({ kind: 'code', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('代码域 hasNewAbstraction 应激活 architecture-strategist', () => {
    const selected = selectReviewers({ kind: 'code', hasNewAbstraction: true })
    expect(selected).toContain(AGENT.ARCHITECTURE_STRATEGIST)
    expect(selected).not.toContain('pattern-recognition-specialist')
  })

  it('代码域 hasSecurity 应激活 security-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_REVIEWER)
  })

  it('代码域 hasInfra 应激活 reliability-reviewer（含基础设施审查）', () => {
    const selected = selectReviewers({ kind: 'code', hasInfra: true })
    expect(selected).toContain(AGENT.RELIABILITY_REVIEWER)
  })

  it('代码域 hasReliability 应激活 reliability-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasReliability: true })
    expect(selected).toContain(AGENT.RELIABILITY_REVIEWER)
  })

  it('代码域 hasDatabase 应激活 data-migrations-reviewer（含数据库审查）', () => {
    const selected = selectReviewers({ kind: 'code', hasDatabase: true })
    expect(selected).toContain(AGENT.DATA_MIGRATIONS_REVIEWER)
  })

  it('代码域 hasMigrations 应激活 data-migrations-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', hasMigrations: true })
    expect(selected).toContain(AGENT.DATA_MIGRATIONS_REVIEWER)
  })

  it('代码域 changedLineCount >= 50 应激活 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 50 })
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(selected).toContain(AGENT.ARCHITECTURE_STRATEGIST)
    expect(selected).not.toContain('pattern-recognition-specialist')
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

  it('文档域 plan 类型应激活 product-lens-reviewer 和 step-granularity-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'plan' })
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
    expect(selected).toContain(AGENT.STEP_GRANULARITY_REVIEWER)
  })

  it('文档域 requirements 类型不应激活 plan 专属代理', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'requirements' })
    expect(selected).not.toContain(AGENT.STEP_GRANULARITY_REVIEWER)
  })

  it('文档域 test 类型应激活 test-case-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'test' })
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('文档域带 upstream 不应再激活已移除的等价转换代理', () => {
    expect(selectReviewers({ kind: 'document', hasUpstream: true })).toEqual([
      AGENT.COHERENCE_REVIEWER,
      AGENT.FEASIBILITY_REVIEWER,
    ])
  })

  it('文档域非 test 类型不应激活 test-case-reviewer', () => {
    for (const documentType of ['requirements', 'plan', 'general'] as const) {
      const selected = selectReviewers({ kind: 'document', documentType })
      expect(selected).not.toContain(AGENT.TEST_CASE_REVIEWER)
    }
  })

  it('文档域 test 类型与条件审查者同时激活时不应重复', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'test', requirementCount: 5 })
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(new Set(selected).size).toBe(selected.length)
  })

  it('文档域 general 类型应在 alwaysOn 基础上激活 evidence-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'general' })
    expect(selected).toContain(AGENT.EVIDENCE_REVIEWER)
    expect(selected.length).toBeGreaterThanOrEqual(3)
  })

  it('文档域 hasUi 应激活 design-lens-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', hasUi: true })
    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
  })

  it('文档域 hasSecurity 应激活 security-reviewer（跨域）', () => {
    const selected = selectReviewers({ kind: 'document', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_REVIEWER)
  })

  it('文档域 requirementCount >= 5 应激活 product-lens-reviewer 和 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', requirementCount: 5 })
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
  })

  it('文档域 plan 类型 hasArchitectureDecision 应激活 adversarial-reviewer 和 architecture-strategist', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'plan', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(selected).toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('文档域 requirements 类型 hasArchitectureDecision 不应激活 architecture-strategist', () => {
    const selected = selectReviewers({ kind: 'document', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(selected).not.toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('文档域 hasProductClaim 应激活 product-lens-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', hasProductClaim: true })
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
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
    expect(selected).not.toContain(AGENT.PRODUCT_LENS_REVIEWER)
  })

  it('changedLineCount 49 不应激活 adversarial-reviewer', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 49 })
    expect(selected).not.toContain(AGENT.ADVERSARIAL_REVIEWER)
    expect(selected).not.toContain(AGENT.ARCHITECTURE_STRATEGIST)
    expect(selected).not.toContain('pattern-recognition-specialist')
  })
})

describe('selectReviewers — 通用混合域', () => {
  it('targetTypes 应激活对应专一审查者', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'prototype', 'test-case', 'asset'],
    })

    expect(selected).toContain(AGENT.REQUIREMENTS_REVIEWER)
    expect(selected).toContain(AGENT.PROTOTYPE_REVIEWER)
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
    expect(selected).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
  })

  it('LSM 产物链应通过通用混合审查激活追溯和证据审查', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'design', 'prototype', 'test-case', 'document'],
      hasEvidenceClaim: true,
    })

    expect(selected).toContain(AGENT.REQUIREMENTS_REVIEWER)
    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
    expect(selected).toContain(AGENT.PROTOTYPE_REVIEWER)
    expect(selected).toContain(AGENT.TEST_CASE_REVIEWER)
    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(selected).toContain(AGENT.EVIDENCE_REVIEWER)
  })

  it('reviewScenes 应激活对应专一审查者', () => {
    const selected = selectReviewers({
      kind: 'general',
      reviewScenes: ['design', 'plan', 'general-document'],
    })

    expect(selected).toContain(AGENT.DESIGN_LENS_REVIEWER)
    expect(selected).toContain(AGENT.PRODUCT_LENS_REVIEWER)
    expect(selected).toContain(AGENT.STEP_GRANULARITY_REVIEWER)
    expect(selected).toContain(AGENT.EVIDENCE_REVIEWER)
  })
})

describe('selectReviewers — LSM 产物链', () => {
  it('hasLsmArtifactChain=true + general 应强制激活 traceability-reviewer 和 evidence-reviewer', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'design'],
      hasLsmArtifactChain: true,
    })
    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(selected).toContain(AGENT.EVIDENCE_REVIEWER)
  })

  it('hasLsmArtifactChain=true + hasMixedTargets=true 应强制激活 traceability-reviewer 和 evidence-reviewer', () => {
    const selected = selectReviewers({
      kind: 'document',
      hasMixedTargets: true,
      hasLsmArtifactChain: true,
    })
    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(selected).toContain(AGENT.EVIDENCE_REVIEWER)
  })

  it('hasLsmArtifactChain=true 但单一目标不应劫持普通 code 流程', () => {
    const selected = selectReviewers({
      kind: 'code',
      hasLsmArtifactChain: true,
    })
    expect(selected).not.toContain(AGENT.TRACEABILITY_REVIEWER)
  })

  it('hasLsmArtifactChain 缺省时不应触发 LSM 强制注入分支', () => {
    const withoutFlag = selectReviewers({
      kind: 'code',
      hasMixedTargets: false,
    })
    expect(withoutFlag).not.toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(withoutFlag).not.toContain(AGENT.EVIDENCE_REVIEWER)
  })

  it('hasLsmArtifactChain=true 不应导致重复代理', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'design', 'prototype', 'test-case', 'document'],
      hasEvidenceClaim: true,
      hasLsmArtifactChain: true,
    })
    expect(new Set(selected).size).toBe(selected.length)
  })
})
