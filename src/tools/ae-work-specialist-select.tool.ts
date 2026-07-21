import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import {
  selectSpecialists,
  getCoordinationStrategy,
  type CoordinationConfig,
} from '../services/domain-dispatch-service.js'
import { getSpecialistPrompt } from '../services/specialist-prompt-templates.js'

export const aeWorkSpecialistSelectTool = tool({
  description: [
    '开发专精代理选择：为 ae:work 预计算开发专精代理列表、协调策略和 prompt 模板。',
    '',
    '功能说明：',
    '- 调用 selectSpecialists() 确定性选择开发专精代理',
    '- 调用 getCoordinationStrategy() 获取协调策略和聚合策略',
    '- 为每个选中的专精生成 prompt 模板和变量槽，编排层只需填充变量后直接 Task 调用',
    '- 返回 tasks 数组，每个元素包含 agent（专精代理名）和 prompt（可填充的模板）',
    '',
    '适用场景：',
    '- ae:work 编排层直接并行调度开发专精代理',
    '',
    '不适用场景：',
    '- ae:review 审查调度（使用 ae-review-scope-analyze）',
    '- 仅查询域目录信息（使用 ae-domain-catalog）',
    '',
    '注意事项：',
    '- 所有域上下文标记（has_security、has_api 等）均为顶级参数，无需嵌套对象',
    '- 布尔标记默认 false，仅需传入 true 的标记即可激活对应专精代理',
  ].join('\n'),
  args: {
    intent: z
      .string()
      .min(1)
      .describe('任务意图文本'),
    constraints: z
      .array(z.string())
      .default([])
      .describe('约束条件列表'),
    has_security: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及安全边界'),
    has_api: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及 API 契约变更'),
    has_performance: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及性能敏感逻辑'),
    has_reliability: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及可靠性/容错机制'),
    has_cli: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及 CLI'),
    has_tooling: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及工具定义、工具参数或工具注册'),
    has_agent_config: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及代理配置、代理注册或技能 frontmatter'),
    has_typescript: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及 TypeScript 代码'),
    has_migrations: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及数据迁移'),
    has_config: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及配置变更'),
    has_infra: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及基础设施变更'),
    has_database: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及数据库变更'),
    has_script: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及脚本变更'),
    has_ui: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否涉及 UI'),
    changed_lines: z
      .number()
      .optional()
      .describe('改动行数'),
    requirement_count: z
      .number()
      .optional()
      .describe('需求数量'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: '准备开发专精调度', metadata: {} })

    try {
      const taskIntent = {
        stage: 'entry' as const,
        intent: args.intent,
        domain: 'development' as const,
        constraints: args.constraints ?? [],
        rawInput: args.intent,
        timestamp: new Date().toISOString(),
      }

      const domainContext: Record<string, unknown> = {
        domain: 'development',
        hasSecurity: args.has_security,
        hasApi: args.has_api,
        hasPerformance: args.has_performance,
        hasReliability: args.has_reliability,
        hasCli: args.has_cli,
        hasTooling: args.has_tooling,
        hasAgentConfig: args.has_agent_config,
        hasTypescript: args.has_typescript,
        hasMigrations: args.has_migrations,
        hasConfig: args.has_config,
        hasInfra: args.has_infra,
        hasDatabase: args.has_database,
        hasScript: args.has_script,
        hasUi: args.has_ui,
        changedLineCount: args.changed_lines,
        requirementCount: args.requirement_count,
      }

      const specialists = selectSpecialists('development', taskIntent, domainContext)
      const strategy: CoordinationConfig = getCoordinationStrategy('development')

      if (specialists.length === 0) {
        return JSON.stringify({
          domain: 'development',
          strategy,
          tasks: [],
          specialistCount: 0,
          errorHint: '未选中任何开发专精代理。请检查 intent 和布尔标记参数是否正确。',
        }, null, 2)
      }

      const tasks = specialists.map((s) => ({
        agent: s.name,
        prompt: getSpecialistPrompt(s.name),
        capabilities: s.capabilities,
        selectionCriteria: s.selectionCriteria,
      }))

      return JSON.stringify({
        domain: 'development',
        strategy,
        tasks,
        specialistCount: specialists.length,
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return JSON.stringify({
        domain: 'development',
        strategy: null,
        tasks: [],
        specialistCount: 0,
        error: message,
      }, null, 2)
    }
  },
})
