import { describe, expect, it } from 'vitest'

import {
  selectSpecialists,
  aggregateResults,
  getCoordinationStrategy,
} from '../../src/services/domain-dispatch-service.js'
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
    const names = selectedNames('review', { kind: 'design' })

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

  it('应该将 general 域映射到审查域并选择混合审查者', () => {
    const names = selectedNames('general', {
      kind: 'general',
      targetTypes: ['requirements', 'design', 'asset'],
    })

    expect(names).toContain(AGENT.REQUIREMENTS_REVIEWER)
    expect(names).toContain(AGENT.PROTOTYPE_REVIEWER)
    expect(names).toContain(AGENT.AGENT_NATIVE_REVIEWER)
    expect(names).toContain(AGENT.TRACEABILITY_REVIEWER)
  })

  it('应该优先使用 normalizedKind 保留混合审查语义', () => {
    const names = selectedNames('review', {
      kind: 'design',
      normalizedKind: 'general',
      targetTypes: ['requirements', 'design'],
    })

    expect(names).toContain(AGENT.REQUIREMENTS_REVIEWER)
    expect(names).toContain(AGENT.TRACEABILITY_REVIEWER)
  })

  it('应该使用 domainContext 文本辅助匹配开发专精代理', () => {
    const names = selectedNames('development', {
      taskArea: '后端 API 数据库',
    })

    expect(names).toContain(AGENT.BACKEND_DEV)
  })

  it('应该在开发域零关键词匹配时兜底选中 debug-fix', () => {
    const intent: TaskIntent = {
      stage: 'entry',
      intent: '添加日志到配置模块',
      domain: 'development',
      constraints: [],
      rawInput: '添加日志到配置模块',
      timestamp: '2026-06-02T00:00:00.000Z',
    }
    const names = selectSpecialists('development', intent, {}).map((s) => s.name)

    expect(names).toContain(AGENT.DEBUG_FIX)
  })

  it('应该在开发域空任务描述时兜底选中 debug-fix', () => {
    const intent: TaskIntent = {
      stage: 'entry',
      intent: '',
      domain: 'development',
      constraints: [],
      rawInput: '',
      timestamp: '2026-06-02T00:00:00.000Z',
    }
    const names = selectSpecialists('development', intent, {}).map((s) => s.name)

    expect(names).toContain(AGENT.DEBUG_FIX)
  })

  it('应该在开发域关键词扩充命中时不触发兜底', () => {
    const intent: TaskIntent = {
      stage: 'entry',
      intent: '重组模块架构',
      domain: 'development',
      constraints: [],
      rawInput: '重组模块架构',
      timestamp: '2026-06-02T00:00:00.000Z',
    }
    const names = selectSpecialists('development', intent, {}).map((s) => s.name)

    expect(names).toContain(AGENT.DEBUG_FIX)
  })

  it('应该使用 hasApi 和 hasUi flags 匹配开发专精代理', () => {
    const intent: TaskIntent = {
      stage: 'entry',
      intent: '实现功能',
      domain: 'development',
      constraints: [],
      rawInput: '实现功能',
      timestamp: '2026-06-02T00:00:00.000Z',
    }
    const names = selectSpecialists('development', intent, {
      hasApi: true,
      hasUi: true,
    }).map((s) => s.name)

    expect(names).toContain(AGENT.BACKEND_DEV)
    expect(names).toContain(AGENT.FRONTEND_DEV)
  })

  describe('aggregateResults', () => {
    const successResult = {
      status: 'success' as const,
      output: '代码正确性审查完成',
      evidence: ['逻辑错误: L42'],
    }
    const partialResult = {
      status: 'partial' as const,
      output: '部分审查完成',
      evidence: ['覆盖缺口: L10'],
    }
    const failedResult = {
      status: 'failed' as const,
      output: '审查失败',
      evidence: [],
    }

    it('应该在 union 策略下合并所有发现并去重', () => {
      const findings = [
        [{ severity: 'P1', title: '逻辑错误' }, { severity: 'P2', title: '命名模糊' }],
        [{ severity: 'P0', title: '逻辑错误' }],
      ]
      const result = aggregateResults('union', [successResult, partialResult], findings)

      expect(result.status).toBe('partial')
      expect(result.findings).toBeDefined()
      expect(result.findings!.length).toBe(2)
      const logicFinding = result.findings!.find((f) => f.title === '逻辑错误')
      expect(logicFinding?.severity).toBe('P0')
    })

    it('应该在 union 策略下无 structuredFindings 时从文本提取', () => {
      const textResult = {
        status: 'success' as const,
        output: '发现：严重级别：P1 标题：空指针风险',
        evidence: [],
      }
      const result = aggregateResults('union', [textResult])

      expect(result.findings).toBeDefined()
      expect(result.findings!.length).toBe(1)
      expect(result.findings![0].severity).toBe('P1')
      expect(result.findings![0].title).toBe('空指针风险')
    })

    it('应该在 structuredFindings 长度与 results 不匹配时降级为文本提取', () => {
      const misalignedFindings = [[{ severity: 'P2', title: '问题A' }]]
      const result = aggregateResults(
        'union',
        [successResult, partialResult],
        misalignedFindings,
      )

      expect(result.status).toBe('partial')
    })

    it('应该在 merge 策略下合并输出和发现', () => {
      const findings = [
        [{ severity: 'P2', title: '重构建议' }],
        [{ severity: 'P1', title: '接口问题' }],
      ]
      const result = aggregateResults('merge', [successResult, partialResult], findings)

      expect(result.status).toBe('partial')
      expect(result.findings).toBeDefined()
      expect(result.findings!.length).toBe(2)
      expect(result.summary).toContain('代码正确性审查完成')
      expect(result.summary).toContain('部分审查完成')
    })

    it('应该在 best-of 策略下选择首个成功结果且仅返回该结果的发现', () => {
      const findings = [
        [{ severity: 'P1', title: '发现A' }],
        [{ severity: 'P2', title: '发现B' }],
      ]
      const result = aggregateResults(
        'best-of',
        [partialResult, successResult],
        findings,
      )

      expect(result.status).toBe('success')
      expect(result.summary).toBe('代码正确性审查完成')
      expect(result.findings).toBeDefined()
      expect(result.findings!.length).toBe(1)
      expect(result.findings![0].title).toBe('发现B')
    })

    it('应该在 reduce 策略下统计各状态数量并聚合发现', () => {
      const findings = [
        [{ severity: 'P1', title: '发现A' }],
        [{ severity: 'P2', title: '发现B' }],
        [],
      ]
      const result = aggregateResults(
        'reduce',
        [successResult, partialResult, failedResult],
        findings,
      )

      expect(result.status).toBe('failed')
      expect(result.summary).toContain('1 成功')
      expect(result.summary).toContain('1 部分')
      expect(result.summary).toContain('1 失败')
      expect(result.findings).toBeDefined()
      expect(result.findings!.length).toBe(2)
    })

    it('应该在所有结果失败时返回 failed 状态', () => {
      const result = aggregateResults('union', [failedResult])

      expect(result.status).toBe('failed')
    })

    it('应该在 union 策略下去重相同标题保留更高严重级别', () => {
      const findings = [
        [{ severity: 'P2', title: 'SQL注入风险' }],
        [{ severity: 'P0', title: 'SQL注入风险' }],
        [{ severity: 'P1', title: 'SQL注入风险' }],
      ]
      const results = [
        { status: 'success' as const, output: '审查1', evidence: [] },
        { status: 'success' as const, output: '审查2', evidence: [] },
        { status: 'success' as const, output: '审查3', evidence: [] },
      ]
      const result = aggregateResults('union', results, findings)

      expect(result.findings!.length).toBe(1)
      expect(result.findings![0].severity).toBe('P0')
    })

    it('应该在 best-of 无任何结果时返回 failed', () => {
      const result = aggregateResults('best-of', [])

      expect(result.status).toBe('failed')
      expect(result.summary).toBe('无可用结果')
    })

    it('应该在 union 策略下 findings 为空数组时使用文本提取兜底', () => {
      const textResult = {
        status: 'success' as const,
        output: '严重级别：P2 标题：重复代码',
        evidence: [],
      }
      const result = aggregateResults('union', [textResult], [[]])

      expect(result.findings).toBeDefined()
      expect(result.findings![0].title).toBe('重复代码')
    })
  })

  describe('getCoordinationStrategy', () => {
    it('应该在审查域返回 parallel 策略', () => {
      const strategy = getCoordinationStrategy('review')
      expect(strategy.strategy).toBe('parallel')
      expect(strategy.aggregation).toBe('union')
    })

    it('应该在开发域返回 parallel-then-sequential 策略', () => {
      const strategy = getCoordinationStrategy('development')
      expect(strategy.strategy).toBe('parallel-then-sequential')
      expect(strategy.aggregation).toBe('merge')
    })
  })
})
