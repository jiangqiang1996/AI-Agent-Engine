import { describe, it, expect } from 'vitest'
import { DOCUMENT_REVIEWERS, CODE_REVIEWERS } from './review-catalog.js'
import { AGENT } from '../schemas/ae-asset-schema.js'

describe('review-catalog', () => {
  it('DOCUMENT_REVIEWERS 应包含 9 个条目', () => {
    expect(DOCUMENT_REVIEWERS).toHaveLength(9)
  })

  it('新增的 step-granularity-reviewer 应存在于 DOCUMENT_REVIEWERS', () => {
    const reviewer = DOCUMENT_REVIEWERS.find((r) => r.name === AGENT.STEP_GRANULARITY_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('新增的 batch-operation-reviewer 应存在于 DOCUMENT_REVIEWERS', () => {
    const reviewer = DOCUMENT_REVIEWERS.find((r) => r.name === AGENT.BATCH_OPERATION_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('alwaysOn 条目仅包含 coherence 和 feasibility', () => {
    const alwaysOn = DOCUMENT_REVIEWERS.filter((r) => r.alwaysOn)
    expect(alwaysOn).toHaveLength(2)
    expect(alwaysOn.map((r) => r.name)).toEqual([
      AGENT.COHERENCE_REVIEWER,
      AGENT.FEASIBILITY_REVIEWER,
    ])
  })

  it('新增条目应放在 security-lens-reviewer 之后', () => {
    const securityIdx = DOCUMENT_REVIEWERS.findIndex((r) => r.name === AGENT.SECURITY_LENS_REVIEWER)
    const stepIdx = DOCUMENT_REVIEWERS.findIndex((r) => r.name === AGENT.STEP_GRANULARITY_REVIEWER)
    const batchIdx = DOCUMENT_REVIEWERS.findIndex((r) => r.name === AGENT.BATCH_OPERATION_REVIEWER)
    expect(stepIdx).toBe(securityIdx + 1)
    expect(batchIdx).toBe(securityIdx + 2)
  })

  it('CODE_REVIEWERS 包含 learnings-researcher 为常驻代理', () => {
    const reviewer = CODE_REVIEWERS.find((r) => r.name === AGENT.LEARNINGS_RESEARCHER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(true)
  })

  it('CODE_REVIEWERS 应包含 19 个条目', () => {
    expect(CODE_REVIEWERS).toHaveLength(19)
  })

  it('新增的 config-reviewer 应存在于 CODE_REVIEWERS', () => {
    const reviewer = CODE_REVIEWERS.find((r) => r.name === AGENT.CONFIG_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('新增的 infra-reviewer 应存在于 CODE_REVIEWERS', () => {
    const reviewer = CODE_REVIEWERS.find((r) => r.name === AGENT.INFRA_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('新增的 database-reviewer 应存在于 CODE_REVIEWERS', () => {
    const reviewer = CODE_REVIEWERS.find((r) => r.name === AGENT.DATABASE_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })

  it('新增的 script-reviewer 应存在于 CODE_REVIEWERS', () => {
    const reviewer = CODE_REVIEWERS.find((r) => r.name === AGENT.SCRIPT_REVIEWER)
    expect(reviewer).toBeDefined()
    expect(reviewer!.alwaysOn).toBe(false)
  })
})
