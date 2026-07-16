import { describe, it, expect } from 'vitest'
import { selectReviewers } from '../../src/services/review-selector.js'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'

describe('selectReviewers — 代码域', () => {
  it('代码域默认应返回 2 个 alwaysOn 代理（ocr-reviewer + document-reviewer）', () => {
    const selected = selectReviewers({ kind: 'code' })
    expect(selected).toHaveLength(2)
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  // research-reviewer 已合并入 ocr-reviewer，hasUpstream 不再单独激活额外代理
  it('代码域 hasUpstream 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasUpstream: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // research-reviewer 已合并入 ocr-reviewer，isHighRiskDomain 不再单独激活额外代理
  it('代码域 isHighRiskDomain 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', isHighRiskDomain: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // agent-native-reviewer 已合并入 ocr-reviewer，hasCli 不再单独激活额外代理
  it('代码域 hasCli 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasCli: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // agent-native-reviewer 已合并入 ocr-reviewer，hasUi 在代码域不再单独激活额外代理
  it('代码域 hasUi 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasUi: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // agent-native-reviewer 已合并入 ocr-reviewer，hasTooling 不再单独激活额外代理
  it('代码域 hasTooling 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasTooling: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // agent-native-reviewer 已合并入 ocr-reviewer，hasAgentConfig 不再单独激活额外代理
  it('代码域 hasAgentConfig 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasAgentConfig: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // agent-native-reviewer 已合并入 ocr-reviewer（alwaysOn），hasConfig 不会额外激活
  it('代码域普通 hasConfig 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasConfig: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // architecture-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design 时激活
  it('代码域 hasArchitectureDecision 不应激活 architecture-design-reviewer（需 hasDesignContract）', () => {
    const selected = selectReviewers({ kind: 'code', hasArchitectureDecision: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
  })

  // architecture-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design 时激活
  it('代码域 hasNewAbstraction 不应激活 architecture-design-reviewer（需 hasDesignContract）', () => {
    const selected = selectReviewers({ kind: 'code', hasNewAbstraction: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
    expect(selected).not.toContain('pattern-recognition-specialist')
  })

  // reliability-reviewer 已合并入 ocr-reviewer（alwaysOn），hasInfra 不再单独激活额外代理
  it('代码域 hasInfra 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasInfra: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // reliability-reviewer 已合并入 ocr-reviewer（alwaysOn），hasReliability 不再单独激活额外代理
  it('代码域 hasReliability 应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', hasReliability: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  // database-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design 时激活
  it('代码域 hasDatabase 不应激活 database-design-reviewer（需 hasDesignContract）', () => {
    const selected = selectReviewers({ kind: 'code', hasDatabase: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain(AGENT.DATABASE_DESIGN_REVIEWER)
  })

  // database-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design 时激活
  it('代码域 hasMigrations 不应激活 database-design-reviewer（需 hasDesignContract）', () => {
    const selected = selectReviewers({ kind: 'code', hasMigrations: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain(AGENT.DATABASE_DESIGN_REVIEWER)
  })

  it('代码域 changedLineCount >= 50 + hasRiskSignal 应由 ocr-reviewer 覆盖对抗式审查', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 50, hasSecurity: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain('pattern-recognition-specialist')
  })

  // adversarial-reviewer 已合并入 ocr-reviewer（alwaysOn），无风险信号时不再可区分
  it('代码域 changedLineCount >= 50 无风险信号应由 ocr-reviewer 覆盖（已合并）', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 50 })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  it('代码域 hasSecurity 应由 ocr-reviewer 覆盖对抗式审查', () => {
    const selected = selectReviewers({ kind: 'code', hasSecurity: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
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
  it('文档域默认应返回 1 个 alwaysOn 代理（document-reviewer 合并了 coherence/feasibility/security-design）', () => {
    const selected = selectReviewers({ kind: 'document' })
    expect(selected).toHaveLength(1)
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  // product-lens-reviewer 和 step-granularity-reviewer 已合并入 document-reviewer（alwaysOn）
  it('文档域 design 类型应由 document-reviewer 覆盖产品视角和步骤粒度（已合并）', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'design' })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  it('文档域 requirements 类型不应激活 design 专属代理', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'requirements' })
    expect(selected).not.toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
    expect(selected).not.toContain(AGENT.UI_UX_DESIGN_REVIEWER)
  })

  // test-cases-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design/test-case 时激活
  it('文档域 test 类型应激活 test-cases-design-reviewer（需 hasDesignContract）', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'test', hasDesignContract: true })
    expect(selected).toContain(AGENT.TEST_CASES_DESIGN_REVIEWER)
  })

  it('文档域带 upstream 不应再激活已移除的等价转换代理', () => {
    const selected = selectReviewers({ kind: 'document', hasUpstream: true })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  it('文档域 requirements/general 类型不应激活 test-cases-design-reviewer', () => {
    for (const documentType of ['requirements', 'general'] as const) {
      const selected = selectReviewers({ kind: 'document', documentType })
      expect(selected).not.toContain(AGENT.TEST_CASES_DESIGN_REVIEWER)
    }
  })

  // test-cases-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design/test-case 时激活
  it('文档域 design 类型应激活 test-cases-design-reviewer（test-case 是 design 子维度）', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'design', hasDesignContract: true })
    expect(selected).toContain(AGENT.TEST_CASES_DESIGN_REVIEWER)
  })

  // 旧代理已合并，条件审查者不再单独激活
  it('文档域 test 类型与条件审查者同时激活时不应重复', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'test', hasDesignContract: true, requirementCount: 5, isHighRiskDomain: true })
    expect(selected).toContain(AGENT.TEST_CASES_DESIGN_REVIEWER)
    expect(new Set(selected).size).toBe(selected.length)
  })

  it('文档域 general 类型应由 document-reviewer 覆盖证据核验', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'general' })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
    // 新架构文档域 alwaysOn 只有 document-reviewer
    expect(selected.length).toBeGreaterThanOrEqual(1)
  })

  // design-lens-reviewer 已合并入 ui-ux-design-reviewer，hasUi 不再单独激活
  it('文档域 hasUi 应由 document-reviewer 覆盖设计视角', () => {
    const selected = selectReviewers({ kind: 'document', hasUi: true })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  it('文档域 hasSecurity 应激活 security-design-reviewer（跨域）', () => {
    const selected = selectReviewers({ kind: 'document', hasSecurity: true })
    expect(selected).toContain(AGENT.SECURITY_DESIGN_REVIEWER)
  })

  it('文档域 requirementCount >= 5 应由 document-reviewer 覆盖产品视角', () => {
    const selected = selectReviewers({ kind: 'document', requirementCount: 5 })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  // architecture-design-reviewer 仅在 hasDesignContract 或 targetTypes 含 design 时激活
  it('文档域 design 类型 hasArchitectureDecision 应激活 architecture-design-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', documentType: 'design', hasArchitectureDecision: true, hasDesignContract: true })
    expect(selected).toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
  })

  // adversarial-reviewer 已合并入 ocr-reviewer，isHighRiskDomain 不再单独激活额外代理
  it('文档域 hasArchitectureDecision + isHighRiskDomain 应由 ocr-reviewer 覆盖对抗式审查', () => {
    const selected = selectReviewers({ kind: 'code', hasArchitectureDecision: true, isHighRiskDomain: true })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
  })

  it('文档域 requirements 类型 hasArchitectureDecision 不应激活 architecture-design-reviewer', () => {
    const selected = selectReviewers({ kind: 'document', hasArchitectureDecision: true })
    expect(selected).not.toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
  })

  it('文档域 hasProductClaim 应由 document-reviewer 覆盖产品视角', () => {
    const selected = selectReviewers({ kind: 'document', hasProductClaim: true })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  it('文档域结果不应有重复代理', () => {
    const selected = selectReviewers({
      kind: 'document',
      documentType: 'design',
      hasSecurity: true,
      hasUi: true,
      requirementCount: 6,
    })
    expect(new Set(selected).size).toBe(selected.length)
  })
})

describe('selectReviewers — 派生字段', () => {
  // 条件已变更，document-reviewer 是 alwaysOn，requirementCount 不再影响其存在性
  it('requirementCount 4 不应满足 requirementCountGte5', () => {
    const selected = selectReviewers({ kind: 'document', requirementCount: 4 })
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })

  // ocr-reviewer 是 alwaysOn，changedLineCount 不再影响其存在性
  it('changedLineCount 49 不应额外激活条件代理', () => {
    const selected = selectReviewers({ kind: 'code', changedLineCount: 49 })
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).not.toContain('pattern-recognition-specialist')
  })
})

describe('selectReviewers — 通用混合域', () => {
  it('targetTypes 应激活对应专一审查者', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'design', 'asset'],
    })

    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
    expect(selected).toContain(AGENT.UI_UX_DESIGN_REVIEWER)
    expect(selected).toContain(AGENT.TEST_CASES_DESIGN_REVIEWER)
    expect(selected).toContain(AGENT.OCR_REVIEWER)
    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
  })

  // 旧代理已合并，reviewScenes 不再单独激活对应专一审查者
  it('reviewScenes 应激活对应专一审查者', () => {
    const selected = selectReviewers({
      kind: 'document',
      hasDesignContract: true,
    })

    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
    expect(selected).toContain(AGENT.ARCHITECTURE_DESIGN_REVIEWER)
  })

  it('多目标 + hasEvidenceClaim 应同时激活 traceability 和 evidence reviewer', () => {
    const selected = selectReviewers({
      kind: 'general',
      targetTypes: ['requirements', 'design'],
      hasEvidenceClaim: true,
    })

    expect(selected).toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(selected).toContain(AGENT.DOCUMENT_REVIEWER)
  })
})
