import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import {
  selectSpecialists,
  getCoordinationStrategy,
  type CoordinationConfig,
} from '../services/domain-dispatch-service.js'

export const aeDomainSelectTool = tool({
  description: [
    '为指定域选择专精代理并返回协调策略。',
    '',
    '功能说明：',
    '- 调用 selectSpecialists() 获取专精代理列表',
    '- 调用 getCoordinationStrategy() 获取协调策略',
    '- 返回选择结果和策略配置，供编排技能填入 DomainCallRequest',
    '',
    '适用场景：',
    '- 编排技能需要在调度域代理前预计算专精列表',
    '- ae:review / ae:work 构造 DomainCallRequest 时获取 selectedSpecialists',
    '',
    '不适用场景：',
    '- 仅查询域目录信息（使用 ae-domain-catalog）',
    '- 不执行域代理调度',
  ].join('\n'),
  args: {
    domain: z
      .enum(['review', 'development'])
      .describe('目标域名'),
    intent: z
      .string()
      .min(1)
      .describe('任务意图文本'),
    constraints: z
      .array(z.string())
      .default([])
      .describe('约束条件列表'),
    domainContext: z
      .record(z.string(), z.unknown())
      .default({})
      .describe('域特有扩展上下文，如 hasSecurity、hasApi 等'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `选择专精代理: ${args.domain}`, metadata: { domain: args.domain } })

    try {
      const taskIntent = {
        stage: 'entry' as const,
        intent: args.intent,
        domain: args.domain,
        constraints: args.constraints,
        rawInput: args.intent,
        timestamp: new Date().toISOString(),
      }

      const specialists = selectSpecialists(args.domain, taskIntent, args.domainContext)
      const strategy: CoordinationConfig = getCoordinationStrategy(args.domain)

      return JSON.stringify(
        {
          domain: args.domain,
          specialists: specialists.map((s) => ({
            name: s.name,
            capabilities: s.capabilities,
            selectionCriteria: s.selectionCriteria,
          })),
          strategy,
          specialistCount: specialists.length,
        },
        null,
        2,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `选择专精代理时出错: ${message}`
    }
  },
})
