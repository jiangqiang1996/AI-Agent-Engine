import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import {
  DomainFindingSchema,
  SpecialistResultSchema,
  type SpecialistResult,
  type DomainFinding,
} from '../schemas/ae-asset-schema.js'
import { aggregateResults, type AggregationStrategy } from '../services/domain-dispatch-service.js'

const ToolSpecialistResultSchema = SpecialistResultSchema.extend({
  agentName: z.string().optional().describe('专精代理名称'),
  findings: z
    .array(DomainFindingSchema)
    .optional()
    .describe('预解析的结构化发现列表，优先于从 output 文本中正则提取'),
})

export const aeDomainDispatchAggregateTool = tool({
  description: [
    '代码化域调度聚合：将专精代理结果按策略聚合为 DomainExecutionResult。',
    '',
    '功能说明：',
    '- 按 union/merge/best-of/reduce 策略确定性聚合结果',
    '- union 策略合并所有发现，同标题保留最高严重级别',
    '- 优先使用 results[].findings；缺失时正则提取兜底',
    '- 返回 DomainExecutionResult 及 dispatchManifest',
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

      const result = {
        ...aggregated,
        dispatchManifest: {
          dispatched: args.dispatchedAgents,
          skipped: args.skippedAgents,
          skipReasons: args.skipReasons,
        },
      }

      return JSON.stringify(result, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `聚合域调度结果时出错: ${message}`
    }
  },
})
