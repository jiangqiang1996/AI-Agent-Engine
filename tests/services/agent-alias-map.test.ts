import { describe, it, expect } from 'vitest'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'
import { resolveAgentName } from '../../src/services/agent-alias-map.js'

describe('agent-alias-map', () => {
  it('旧名 kieran-typescript-reviewer 应解析为 correctness-reviewer', () => {
    expect(resolveAgentName('kieran-typescript-reviewer')).toBe(AGENT.CORRECTNESS_REVIEWER)
  })

  it('旧名 cli-agent-readiness-reviewer 应解析为 agent-native-reviewer', () => {
    expect(resolveAgentName('cli-agent-readiness-reviewer')).toBe(AGENT.AGENT_NATIVE_REVIEWER)
  })

  it('旧名 security-lens-reviewer 应解析为 security-reviewer', () => {
    expect(resolveAgentName('security-lens-reviewer')).toBe(AGENT.SECURITY_REVIEWER)
  })

  it('旧名 adversarial-document-reviewer 应解析为 adversarial-reviewer', () => {
    expect(resolveAgentName('adversarial-document-reviewer')).toBe(AGENT.ADVERSARIAL_REVIEWER)
  })

  it('旧名 product-scope-reviewer 应解析为 product-lens-reviewer', () => {
    expect(resolveAgentName('product-scope-reviewer')).toBe(AGENT.PRODUCT_LENS_REVIEWER)
  })

  it('旧名 scope-guardian-reviewer 应解析为 product-lens-reviewer', () => {
    expect(resolveAgentName('scope-guardian-reviewer')).toBe(AGENT.PRODUCT_LENS_REVIEWER)
  })

  it('旧名 plan-quality-reviewer 应解析为 step-granularity-reviewer', () => {
    expect(resolveAgentName('plan-quality-reviewer')).toBe(AGENT.STEP_GRANULARITY_REVIEWER)
  })

  it('旧名 batch-operation-reviewer 应解析为 step-granularity-reviewer', () => {
    expect(resolveAgentName('batch-operation-reviewer')).toBe(AGENT.STEP_GRANULARITY_REVIEWER)
  })

  it('旧名 project-standards-reviewer 应解析为 standards-reviewer', () => {
    expect(resolveAgentName('project-standards-reviewer')).toBe(AGENT.STANDARDS_REVIEWER)
  })

  it('旧名 config-reviewer 应解析为 standards-reviewer', () => {
    expect(resolveAgentName('config-reviewer')).toBe(AGENT.STANDARDS_REVIEWER)
  })

  it('旧名 infra-reviewer 应解析为 reliability-reviewer', () => {
    expect(resolveAgentName('infra-reviewer')).toBe(AGENT.RELIABILITY_REVIEWER)
  })

  it('旧名 database-reviewer 应解析为 data-migrations-reviewer', () => {
    expect(resolveAgentName('database-reviewer')).toBe(AGENT.DATA_MIGRATIONS_REVIEWER)
  })

  it('旧名 script-reviewer 应解析为 maintainability-reviewer', () => {
    expect(resolveAgentName('script-reviewer')).toBe(AGENT.MAINTAINABILITY_REVIEWER)
  })

  it('旧名 learnings-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('learnings-researcher')).toBe(AGENT.RESEARCH_REVIEWER)
  })

  it('旧名 best-practices-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('best-practices-researcher')).toBe(AGENT.RESEARCH_REVIEWER)
  })

  it('旧名 framework-docs-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('framework-docs-researcher')).toBe(AGENT.RESEARCH_REVIEWER)
  })

  it('旧名 learnings-reviewer 应解析为 research-reviewer', () => {
    expect(resolveAgentName('learnings-reviewer')).toBe(AGENT.RESEARCH_REVIEWER)
  })

  it('当前名 correctness-reviewer 应保持不变', () => {
    expect(resolveAgentName(AGENT.CORRECTNESS_REVIEWER)).toBe(AGENT.CORRECTNESS_REVIEWER)
  })

  it('不存在的名称应返回原值', () => {
    expect(resolveAgentName('nonexistent-reviewer')).toBe('nonexistent-reviewer')
  })
})
