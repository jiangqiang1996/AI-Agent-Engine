import { describe, expect, it } from 'vitest'

import { selectSpecialists } from '../../src/services/domain-dispatch-service.js'
import { AGENT } from '../../src/schemas/ae-asset-schema.js'
import type { TaskIntent } from '../../src/schemas/orchestration-protocol.js'

const taskIntent: TaskIntent = {
  stage: 'entry',
  intent: '审查变更',
  domain: 'review',
  constraints: [],
  rawInput: '审查当前变更',
  timestamp: '2026-05-29T00:00:00.000Z',
}

function selectedNames(domain: string, domainContext: Record<string, unknown>) {
  return selectSpecialists(domain, taskIntent, domainContext).map((specialist) => specialist.name)
}

describe('domain-dispatch-service', () => {
  it('应该按代码审查类型选择代码常驻审查者而不是文档常驻审查者', () => {
    const names = selectedNames('review', { kind: 'code' })

    expect(names).toContain(AGENT.CORRECTNESS_REVIEWER)
    expect(names).toContain(AGENT.TESTING_REVIEWER)
    expect(names).toContain(AGENT.MAINTAINABILITY_REVIEWER)
    expect(names).toContain(AGENT.STANDARDS_REVIEWER)
    expect(names).toContain(AGENT.RESEARCH_REVIEWER)
    expect(names).not.toContain(AGENT.COHERENCE_REVIEWER)
    expect(names).not.toContain(AGENT.FEASIBILITY_REVIEWER)
  })

  it('应该在 domainContext 缺省时使用 TaskIntent.domain 选择审查域', () => {
    const names = selectSpecialists('review', { ...taskIntent, domain: 'code' }).map((specialist) => specialist.name)

    expect(names).toContain(AGENT.CORRECTNESS_REVIEWER)
    expect(names).not.toContain(AGENT.COHERENCE_REVIEWER)
  })

  it('应该在 TaskIntent.domain 兜底为代码域时激活架构条件审查者', () => {
    const names = selectSpecialists('review', { ...taskIntent, domain: 'code' }, {
      hasArchitectureDecision: true,
    }).map((specialist) => specialist.name)

    expect(names).toContain(AGENT.ARCHITECTURE_STRATEGIST)
  })

  it('应该按文档审查类型选择文档常驻审查者而不是代码常驻审查者', () => {
    const names = selectedNames('review', { kind: 'plan' })

    expect(names).toContain(AGENT.COHERENCE_REVIEWER)
    expect(names).toContain(AGENT.FEASIBILITY_REVIEWER)
    expect(names).not.toContain(AGENT.CORRECTNESS_REVIEWER)
    expect(names).not.toContain(AGENT.TESTING_REVIEWER)
  })

  it('应该使用 domainContext 条件激活审查专精代理', () => {
    const names = selectedNames('review', {
      kind: 'code',
      hasSecurity: true,
      hasApi: true,
      hasPerformance: true,
      hasReliability: true,
      hasDatabase: true,
    })

    expect(names).toContain(AGENT.SECURITY_REVIEWER)
    expect(names).toContain(AGENT.API_CONTRACT_REVIEWER)
    expect(names).toContain(AGENT.PERFORMANCE_REVIEWER)
    expect(names).toContain(AGENT.RELIABILITY_REVIEWER)
    expect(names).toContain(AGENT.DATA_MIGRATIONS_REVIEWER)
  })

  it('应该使用 domainContext 文本辅助匹配开发专精代理', () => {
    const names = selectedNames('development', {
      taskArea: '后端 API 数据库',
    })

    expect(names).toContain(AGENT.BACKEND_DEV)
  })
})
