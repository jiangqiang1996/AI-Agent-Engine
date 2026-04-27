import { describe, it, expect } from 'vitest'
import { resolveAgentName } from './agent-alias-map.js'

describe('agent-alias-map', () => {
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

  it('旧名 product-scope-reviewer 应解析为 product-lens-reviewer', () => {
    expect(resolveAgentName('product-scope-reviewer')).toBe('product-lens-reviewer')
  })

  it('旧名 scope-guardian-reviewer 应解析为 product-lens-reviewer', () => {
    expect(resolveAgentName('scope-guardian-reviewer')).toBe('product-lens-reviewer')
  })

  it('旧名 plan-quality-reviewer 应解析为 step-granularity-reviewer', () => {
    expect(resolveAgentName('plan-quality-reviewer')).toBe('step-granularity-reviewer')
  })

  it('旧名 batch-operation-reviewer 应解析为 step-granularity-reviewer', () => {
    expect(resolveAgentName('batch-operation-reviewer')).toBe('step-granularity-reviewer')
  })

  it('旧名 project-standards-reviewer 应解析为 standards-reviewer', () => {
    expect(resolveAgentName('project-standards-reviewer')).toBe('standards-reviewer')
  })

  it('旧名 config-reviewer 应解析为 standards-reviewer', () => {
    expect(resolveAgentName('config-reviewer')).toBe('standards-reviewer')
  })

  it('旧名 infra-reviewer 应解析为 reliability-reviewer', () => {
    expect(resolveAgentName('infra-reviewer')).toBe('reliability-reviewer')
  })

  it('旧名 database-reviewer 应解析为 data-migrations-reviewer', () => {
    expect(resolveAgentName('database-reviewer')).toBe('data-migrations-reviewer')
  })

  it('旧名 script-reviewer 应解析为 maintainability-reviewer', () => {
    expect(resolveAgentName('script-reviewer')).toBe('maintainability-reviewer')
  })

  it('旧名 learnings-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('learnings-researcher')).toBe('research-reviewer')
  })

  it('旧名 best-practices-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('best-practices-researcher')).toBe('research-reviewer')
  })

  it('旧名 framework-docs-researcher 应解析为 research-reviewer', () => {
    expect(resolveAgentName('framework-docs-researcher')).toBe('research-reviewer')
  })

  it('旧名 learnings-reviewer 应解析为 research-reviewer', () => {
    expect(resolveAgentName('learnings-reviewer')).toBe('research-reviewer')
  })

  it('当前名 correctness-reviewer 应保持不变', () => {
    expect(resolveAgentName('correctness-reviewer')).toBe('correctness-reviewer')
  })

  it('不存在的名称应返回原值', () => {
    expect(resolveAgentName('nonexistent-reviewer')).toBe('nonexistent-reviewer')
  })
})
