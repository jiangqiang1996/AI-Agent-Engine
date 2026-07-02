import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import {
  DomainFindingSchema,
  SpecialistResultSchema,
  type SpecialistResult,
  type DomainFinding,
} from '../schemas/ae-asset-schema.js'
import {
  aggregateResults,
  DOMAIN_AGENT_NAMES,
  type AggregationStrategy,
} from '../services/domain-dispatch-service.js'

const ToolSpecialistResultSchema = SpecialistResultSchema.extend({
  agentName: z.string().optional().describe('专精代理名称'),
  findings: z
    .array(DomainFindingSchema)
    .optional()
    .describe('预解析的结构化发现列表，优先于从 output 文本中正则提取'),
})

interface GuardViolation {
  code: string
  message: string
  severity: 'error' | 'warn'
}

function detectDegradationViolation(
  dispatchedAgents: string[],
  expectedCount?: number,
): GuardViolation | null {
  if (dispatchedAgents.length === 0) return null

  const allDomainAgents = dispatchedAgents.every((name) => DOMAIN_AGENT_NAMES.has(name))
  if (!allDomainAgents) return null

  const domainAgentName = dispatchedAgents[0]
  if (expectedCount !== undefined && expectedCount > 0) {
    return {
      code: 'DEGRADATION_VIOLATION',
      message: `编排层通过 ae-domain-dispatch-prepare 获得了 ${expectedCount} 个专精代理（specialistCount > 0），但实际只调度了域代理 [${domainAgentName}]。这违反了不可降级硬约束：specialistCount > 0 时必须直接 Task 调度全部专精代理，不得降级为调用域代理。除非平台硬性不支持多工具调用（需可验证证据）且 specialistCount > 20，否则此降级行为违规。请检查编排层是否因上下文成本顾虑或根因已定位而错误降级。`,
      severity: 'error',
    }
  }

  if (expectedCount === 0) return null

  return {
    code: 'DOMAIN_AGENT_ONLY_DISPATCH',
    message: `dispatchedAgents 仅包含域代理 [${domainAgentName}]，未包含任何专精代理。expectedSpecialistCount 未传入，无法确认是否曾调用 ae-domain-dispatch-prepare。请确认：1) 是否曾调用 ae-domain-dispatch-prepare；2) 返回的 specialistCount 是否 > 0；3) 若 > 0，是否因平台限制或专精 > 20 才降级。`,
    severity: 'warn',
  }
}

export const aeDomainDispatchAggregateTool = tool({
  description: [
    '代码化域调度聚合：将专精代理结果按策略聚合为 DomainExecutionResult。',
    '',
    '功能说明：',
    '- 按 union/merge/best-of/reduce 策略确定性聚合结果',
    '- union 策略合并所有发现，同标题保留最高严重级别',
    '- 优先使用 results[].findings；缺失时正则提取兜底',
    '- 返回 DomainExecutionResult 及 dispatchManifest',
    '- 内置降级违规检测：若 dispatchedAgents 仅含域代理名（review-domain/development-domain），会发出 guardViolation 警告',
    '',
    '适用场景：',
    '- ae:review/ae:work 编排层直接调度专精代理后聚合',
    '',
    '不适用场景：',
    '- 单一代理执行（无需聚合）',
    '- 通过域代理执行的调度（域代理内部已聚合）',
  ].join('\n'),
  args: {
    strategy: z
      .enum(['union', 'merge', 'best-of', 'reduce'])
      .describe('聚合策略：union=合并发现去重（审查域），merge=合并输出（开发域），best-of=选最优，reduce=统计汇总'),
    results: z
      .array(ToolSpecialistResultSchema)
      .min(1)
      .describe('专精代理执行结果列表。若 findings 存在且非空，优先使用，跳过正则提取'),
    dispatchedAgents: z
      .array(z.string())
      .describe('实际调度的专精代理名称列表'),
    skippedAgents: z
      .array(z.string())
      .default([])
      .describe('选中但未调度的专精代理名称列表'),
    skipReasons: z
      .record(z.string(), z.string())
      .default({})
      .describe('跳过原因，key 为专精代理名称'),
    expectedSpecialistCount: z
      .number()
      .optional()
      .describe('ae-domain-dispatch-prepare 返回的 specialistCount，用于降级违规检测。若传入且 > 0，但 dispatchedAgents 仅含域代理名，会发出 error 级 guardViolation'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({
      title: `聚合域调度结果: ${args.strategy}`,
      metadata: { strategy: args.strategy, resultCount: args.results.length },
    })

    try {
      const specialistResults: SpecialistResult[] = args.results.map((r) => ({
        status: r.status,
        output: r.output,
        evidence: r.evidence,
      }))

      const structuredFindings: DomainFinding[][] = args.results.map((r) =>
        r.findings && r.findings.length > 0 ? r.findings : [],
      )

      const aggregated = aggregateResults(
        args.strategy,
        specialistResults,
        structuredFindings,
      )

      const guardViolation = detectDegradationViolation(
        args.dispatchedAgents,
        args.expectedSpecialistCount,
      )

      const result = {
        ...aggregated,
        dispatchManifest: {
          dispatched: args.dispatchedAgents,
          skipped: args.skippedAgents,
          skipReasons: args.skipReasons,
        },
        ...(guardViolation ? { guardViolation } : {}),
      }

      return JSON.stringify(result, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `聚合域调度结果时出错: ${message}`
    }
  },
})
