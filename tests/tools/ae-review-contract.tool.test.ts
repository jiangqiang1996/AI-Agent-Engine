import { describe, it, expect } from 'vitest'

import { AGENT } from '../../src/schemas/ae-asset-schema.js'

interface ReviewContractResult {
  kind: string
  normalizedKind?: string
  documentType?: string
  targetCoverage?: Record<string, { status: string; reviewers: string[] }>
  mode: string
  reviewers: string[]
  nonSelectionInputs: string[]
  gate: string
}

async function callTool(args: {
  kind: 'document' | 'test' | 'general' | 'code' | 'design' | 'prototype' | 'mixed' | 'hybrid'
  mode?: string
  targets?: string
  targetTypes?: string
  scenes?: string
  reviewScenes?: string
  has_architecture_decision?: boolean
  has_new_abstraction?: boolean
  has_product_claim?: boolean
  has_cli?: boolean
  has_ui?: boolean
  has_tooling?: boolean
  has_agent_config?: boolean
  has_config?: boolean
  has_evidence_claim?: boolean
}) {
  const { aeReviewContractTool: tool } = await import('../../src/tools/ae-review-contract.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }

  const mockCtx = {
    metadata: () => undefined,
    directory: '/test',
    sessionID: 'test-session',
    worktree: '/test',
    abort: new AbortController().signal,
  }

  const result = await definition.execute({ mode: 'report-only', ...args }, mockCtx)
  return JSON.parse(result) as ReviewContractResult
}

async function getToolDefinition() {
  const { aeReviewContractTool: tool } = await import('../../src/tools/ae-review-contract.tool.js')
  return tool as unknown as {
    args: Record<string, unknown>
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }
}

describe('ae-review-contract 工具', () => {
  it('test 类型应返回测试文档契约并激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'test' })

    expect(result.kind).toBe('test')
    expect(result.documentType).toBe('test')
    expect(result.reviewers).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('document 类型默认不应激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'document' })

    expect(result.kind).toBe('document')
    expect(result.documentType).toBe('requirements')
    expect(result.reviewers).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('design 类型应激活 prototype-reviewer 和 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'design' })

    expect(result.documentType).toBe('design')
    expect(result.reviewers).toContain(AGENT.PROTOTYPE_REVIEWER)
    expect(result.reviewers).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('general 类型应返回通用文档契约且不激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'general' })

    expect(result.documentType).toBe('general')
    expect(result.reviewers).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('code 类型 has_new_abstraction 应激活架构审查者', async () => {
    const result = await callTool({ kind: 'code', has_new_abstraction: true })

    expect(result.reviewers).toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('document 类型 has_product_claim 应激活 product-lens-reviewer', async () => {
    const result = await callTool({ kind: 'document', has_product_claim: true })

    expect(result.reviewers).toContain(AGENT.PRODUCT_LENS_REVIEWER)
  })

  it('has_config 应声明为非选择字段且不单独激活 agent-native-reviewer', async () => {
    const result = await callTool({ kind: 'code', has_config: true })

    expect(result.nonSelectionInputs).toEqual(['has_typescript', 'has_config', 'has_script'])
    expect(result.reviewers).not.toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('应暴露新增选择参数给真实工具调用方', async () => {
    const definition = await getToolDefinition()

    expect(definition.args).toHaveProperty('has_tooling')
    expect(definition.args).toHaveProperty('has_agent_config')
      expect(definition.args).toHaveProperty('has_product_claim')
      expect(definition.args).toHaveProperty('reviewScenes')
      expect(definition.args).toHaveProperty('targetTypes')
  })

  it('has_ui、has_tooling 和 has_agent_config 应激活 agent-native-reviewer', async () => {
    const uiResult = await callTool({ kind: 'code', has_ui: true })
    const toolingResult = await callTool({ kind: 'code', has_tooling: true })
    const agentConfigResult = await callTool({ kind: 'code', has_agent_config: true })

    expect(uiResult.reviewers).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(toolingResult.reviewers).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(agentConfigResult.reviewers).toContain(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('general 类型 targets 应激活对应审查者并返回目标覆盖', async () => {
    const result = await callTool({ kind: 'general', targets: 'requirements,design,asset' })

    expect(result.normalizedKind).toBe('general')
    expect(result.reviewers).toContain(AGENT.REQUIREMENTS_REVIEWER)
    expect(result.reviewers).toContain(AGENT.DESIGN_LENS_REVIEWER)
    expect(result.reviewers).toContain(AGENT.PROTOTYPE_REVIEWER)
    expect(result.reviewers).toContain(AGENT.TEST_CASE_REVIEWER)
    expect(result.reviewers).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(result.targetCoverage?.requirements.status).toBe('covered')
    expect(result.targetCoverage?.design.status).toBe('covered')
    expect(result.targetCoverage?.asset.reviewers).toEqual([AGENT.AGENT_NATIVE_REVIEWER])
  })

  it('应兼容 reviewScenes 和 targetTypes 别名', async () => {
    const result = await callTool({ kind: 'mixed', reviewScenes: 'design', targetTypes: 'design' })

    expect(result.normalizedKind).toBe('general')
    expect(result.reviewers).toContain(AGENT.DESIGN_LENS_REVIEWER)
    expect(result.targetCoverage?.design.status).toBe('covered')
  })

  it('hybrid 混合目标带 evidence_claim 应返回追溯和证据审查覆盖', async () => {
    const result = await callTool({
      kind: 'hybrid',
      targetTypes: 'requirements,design,document',
      has_evidence_claim: true,
    })

    expect(result.normalizedKind).toBe('general')
    expect(result.reviewers).toContain(AGENT.TRACEABILITY_REVIEWER)
    expect(result.reviewers).toContain(AGENT.EVIDENCE_REVIEWER)
    expect(result.targetCoverage?.requirements.status).toBe('covered')
    expect(result.targetCoverage?.design.status).toBe('covered')
    expect(result.targetCoverage?.document.status).toBe('covered')
  })
})

describe('ae-review-contract 工具 — 远程写边界', () => {
  it('description 不得引导 GitHub 远程写操作', async () => {
    const definition = await getToolDefinition()
    const description = (definition as unknown as { description?: string }).description ?? ''
    const forbiddenPatterns = [
      /创建\s*Issue/i,
      /创建\s*Pull\s*Request/i,
      /创建\s*PR/i,
      /创建\s*Release/i,
      /push\s+remote/i,
      /git\s+push/i,
      /gh\s+pr\s+create/i,
      /gh\s+issue\s+create/i,
    ]
    for (const pattern of forbiddenPatterns) {
      expect(description).not.toMatch(pattern)
    }
  })
})
