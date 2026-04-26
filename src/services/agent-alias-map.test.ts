import { describe, it, expect } from 'vitest'
import { AGENT_ALIAS_MAP, resolveAgentName } from './agent-alias-map.js'

describe('agent-alias-map', () => {
  it('别名映射应包含 10 个条目', () => {
    expect(AGENT_ALIAS_MAP.size).toBe(10)
  })

  it('旧名 kieran-typescript-reviewer 应解析为 correctness-reviewer', () => {
    expect(resolveAgentName('kieran-typescript-reviewer')).toBe('correctness-reviewer')
  })

  it('旧名 cli-agent-readiness-reviewer 应解析为 agent-native-reviewer', () => {
    expect(resolveAgentName('cli-agent-readiness-reviewer')).toBe('agent-native-reviewer')
  })

  it('旧名 security-lens-reviewer 应解析为 security-reviewer', () => {
    expect(resolveAgentName('security-lens-reviewer')).toBe('security-reviewer')
  })

  it('旧名 adversarial-document-reviewer 应解析为 adversarial-reviewer', () => {
    expect(resolveAgentName('adversarial-document-reviewer')).toBe('adversarial-reviewer')
  })

  it('旧名 product-lens-reviewer 应解析为 product-scope-reviewer', () => {
    expect(resolveAgentName('product-lens-reviewer')).toBe('product-scope-reviewer')
  })

  it('旧名 scope-guardian-reviewer 应解析为 product-scope-reviewer', () => {
    expect(resolveAgentName('scope-guardian-reviewer')).toBe('product-scope-reviewer')
  })

  it('旧名 step-granularity-reviewer 应解析为 plan-quality-reviewer', () => {
    expect(resolveAgentName('step-granularity-reviewer')).toBe('plan-quality-reviewer')
  })

  it('旧名 batch-operation-reviewer 应解析为 plan-quality-reviewer', () => {
    expect(resolveAgentName('batch-operation-reviewer')).toBe('plan-quality-reviewer')
  })

  it('旧名 project-standards-reviewer 应解析为 standards-reviewer', () => {
    expect(resolveAgentName('project-standards-reviewer')).toBe('standards-reviewer')
  })

  it('旧名 learnings-researcher 应解析为 learnings-reviewer', () => {
    expect(resolveAgentName('learnings-researcher')).toBe('learnings-reviewer')
  })

  it('当前名 correctness-reviewer 应保持不变', () => {
    expect(resolveAgentName('correctness-reviewer')).toBe('correctness-reviewer')
  })

  it('不存在的名称应返回原值', () => {
    expect(resolveAgentName('nonexistent-reviewer')).toBe('nonexistent-reviewer')
  })
})
