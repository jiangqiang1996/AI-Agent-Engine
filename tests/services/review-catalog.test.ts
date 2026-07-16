import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { REVIEW_MATRIX } from '../../src/services/review-catalog.js'
import { getAllAgentDefinitions } from '../../src/services/ae-catalog.js'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'

describe('REVIEW_MATRIX', () => {
  it('代码域 alwaysOn 应为 1 个（ocr-reviewer 合并了 correctness/testing/maintainability）', () => {
    const codeAlwaysOn = REVIEW_MATRIX.filter((r) => r.domain === 'code' && r.alwaysOn)
    expect(codeAlwaysOn).toHaveLength(1)
    expect(codeAlwaysOn.map((r) => r.name)).toEqual([AGENT.OCR_REVIEWER])
  })

  it('文档域 alwaysOn 应为 0 个（document-reviewer 是 both 域）', () => {
    const docAlwaysOn = REVIEW_MATRIX.filter((r) => r.domain === 'document' && r.alwaysOn)
    expect(docAlwaysOn).toHaveLength(0)
  })

  it('审查矩阵不应注册旧文档等价转换代理', () => {
    expect(REVIEW_MATRIX.map((r) => r.name)).not.toContain('doc-equivalence-reviewer')
  })

  it('每个条目应有非空 description', () => {
    for (const entry of REVIEW_MATRIX) {
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('test-cases-design-reviewer 描述应覆盖测试用例文档审查核心能力', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.TEST_CASES_DESIGN_REVIEWER)
    const agent = getAllAgentDefinitions().find((a) => a.name === AGENT.TEST_CASES_DESIGN_REVIEWER)

    if (!reviewer || !agent) {
      throw new Error('test-cases-design-reviewer 应存在于审查矩阵和代理目录中')
    }
    expect(reviewer.description).toContain('覆盖矩阵')
    expect(reviewer.description).toContain('维度覆盖追溯')
  })

  it('test-cases-design-reviewer 提示词应包含误报抑制边界', () => {
    const content = readFileSync(
      new URL('../../src/assets/agents/domains/review/specialists/test-cases-design-reviewer.md', import.meta.url),
      'utf-8',
    )

    expect(content).toContain('覆盖矩阵')
    expect(content).toContain('维度覆盖追溯')
  })

  it('ocr-reviewer 应包含配置审查职责', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.OCR_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.description).toContain('配置')
  })

  it('document-reviewer 应存在于 both 域 alwaysOn 条目', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.DOCUMENT_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.domain).toBe('both')
    expect(reviewer!.alwaysOn).toBe(true)
  })

  it('审查矩阵和代理目录不应注册已删除的 pattern-recognition-specialist', () => {
    expect(REVIEW_MATRIX.map((r) => r.name)).not.toContain('pattern-recognition-specialist')
    expect(getAllAgentDefinitions().map((agent) => agent.name)).not.toContain('pattern-recognition-specialist')
  })

  it('ocr-reviewer 应为代码域 alwaysOn 条目', () => {
    const reviewer = REVIEW_MATRIX.find((r) => r.name === AGENT.OCR_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.domain).toBe('code')
    expect(reviewer!.alwaysOn).toBe(true)
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
