import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { REVIEW_MATRIX } from '../../src/services/review-catalog.js'
import { getAllAgentDefinitions } from '../../src/services/ae-catalog.js'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'

describe('REVIEW_MATRIX', () => {
  it('代码域 alwaysOn 应为 5 个', () => {
    const codeAlwaysOn = REVIEW_MATRIX.filter((r) => r.domain === 'code' && r.alwaysOn)
    expect(codeAlwaysOn).toHaveLength(5)
    expect(codeAlwaysOn.map((r) => r.name)).toEqual([
      AGENT.CORRECTNESS_REVIEWER,
      AGENT.TESTING_REVIEWER,
      AGENT.MAINTAINABILITY_REVIEWER,
      AGENT.STANDARDS_REVIEWER,
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

  it('审查矩阵不应注册旧文档等价转换代理', () => {
    expect(REVIEW_MATRIX.map((r) => r.name)).not.toContain('doc-equivalence-reviewer')
  })

  it('每个条目应有非空 description', () => {
    for (const entry of REVIEW_MATRIX) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('test-case-reviewer 描述应覆盖测试用例文档审查核心能力', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.TEST_CASE_REVIEWER)
    const agent = getAllAgentDefinitions().find((a) => a.name === AGENT.TEST_CASE_REVIEWER)

    if (!reviewer || !agent) {
      throw new Error('test-case-reviewer 应存在于审查矩阵和代理目录中')
    }
    expect(reviewer.description).toContain('结构完整性')
    expect(reviewer.description).toContain('覆盖完备性')
    expect(reviewer.description).toContain('步骤可执行性')
    expect(reviewer.description).toContain('结果可验证性')
    expect(agent.description).toBe(reviewer.description)
  })

  it('test-case-reviewer 提示词应包含误报抑制边界', () => {
    const content = readFileSync(
      new URL('../../src/assets/agents/domains/review/specialists/test-case-reviewer.md', import.meta.url),
      'utf-8',
    )

    expect(content).toContain('无外部需求来源')
    expect(content).toContain('没有来源证据的字段约束')
    expect(content).toContain('高风险延期项应放入 `residual_risks`')
    expect(content).toContain('不要求穷举所有排列组合')
    expect(content).toContain('JSON 之外不得包含任何文字说明')
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

  it('审查矩阵和代理目录不应注册已删除的 pattern-recognition-specialist', () => {
    expect(REVIEW_MATRIX.map((r) => r.name)).not.toContain('pattern-recognition-specialist')
    expect(getAllAgentDefinitions().map((agent) => agent.name)).not.toContain('pattern-recognition-specialist')
  })

  it('agent-native-reviewer 应为代码域条件条目', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.AGENT_NATIVE_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.domain).toBe('code')
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
