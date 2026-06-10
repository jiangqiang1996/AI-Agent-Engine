import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import { AGENT } from '../schemas/ae-asset-schema.js'
import {
  selectSpecialists,
  getCoordinationStrategy,
  type CoordinationConfig,
} from '../services/domain-dispatch-service.js'

// 同步约束：修改代理 markdown 文件的 Role 段落时，必须同步更新此表中对应条目。
// 新增域专精代理时，必须在此表追加条目，否则 getSpecialistPrompt 将返回 fallback 摘要。
const SPECIALIST_PROMPT_TEMPLATES: Record<string, string> = {
  [AGENT.CORRECTNESS_REVIEWER]: '你是一位代码正确性审查者。审查代码中的逻辑错误、边界情况和状态管理 bug。',
  [AGENT.TESTING_REVIEWER]: '你是一位测试审查者。审查测试覆盖缺口、弱断言和缺失的边界用例。',
  [AGENT.MAINTAINABILITY_REVIEWER]: '你是一位可维护性审查者。审查过早抽象、不必要的间接层、死代码和命名模糊。',
  [AGENT.STANDARDS_REVIEWER]: '你是一位项目规范审查者。审查代码是否符合项目自身 CLAUDE.md 和 AGENTS.md 标准。',
  [AGENT.RESEARCH_REVIEWER]: '你是一位研究审查者。搜索历史方案和最佳实践，与当前实现对比。',
  [AGENT.COHERENCE_REVIEWER]: '你是一位文档一致性审查者。审查文档内部一致性、术语漂移和结构性问题。',
  [AGENT.FEASIBILITY_REVIEWER]: '你是一位可行性审查者。评估文档中提出的技术方法能否经受现实考验。',
  [AGENT.SECURITY_REVIEWER]: '你是一位安全审查者。审查可利用漏洞、认证授权和数据暴露风险。',
  [AGENT.ADVERSARIAL_REVIEWER]: '你是一位对抗式审查者。构造故障场景来破坏实现，质疑前提假设。',
  [AGENT.AGENT_NATIVE_REVIEWER]: '你是一位代理就绪度审查者。审查代理操作、CLI 就绪度和工具配置。',
  [AGENT.ARCHITECTURE_STRATEGIST]: '你是一位架构策略师。从架构视角分析变更，检查模式合规性和设计完整性。',
  [AGENT.PATTERN_RECOGNITION_SPECIALIST]: '你是一位模式识别专家。分析设计模式、反模式和代码重复。',
  [AGENT.PERFORMANCE_REVIEWER]: '你是一位性能审查者。审查运行时性能和可扩展性问题。',
  [AGENT.API_CONTRACT_REVIEWER]: '你是一位 API 契约审查者。审查破坏性契约变更和兼容性。',
  [AGENT.RELIABILITY_REVIEWER]: '你是一位可靠性审查者。审查错误处理、重试和故障模式。',
  [AGENT.DATA_MIGRATIONS_REVIEWER]: '你是一位数据迁移审查者。审查数据完整性、迁移安全性和隐私合规。',
  [AGENT.PREVIOUS_COMMENTS_REVIEWER]: '你是一位历史评论审查者。检查先前反馈是否已在当前变更中处理。',
  [AGENT.PRODUCT_LENS_REVIEWER]: '你是一位产品视角审查者。质疑前提主张、评估战略后果和范围对齐。',
  [AGENT.STEP_GRANULARITY_REVIEWER]: '你是一位步骤粒度审查者。审查计划步骤是否拆解至最小不可再分单元。',
  [AGENT.DESIGN_LENS_REVIEWER]: '你是一位设计视角审查者。审查缺失的设计决策、信息架构和交互状态。',
  [AGENT.TEST_CASE_REVIEWER]: '你是一位测试用例审查者。审查测试文档的结构完整性和覆盖完备性。',
  [AGENT.GOAL_ALIGNMENT_REVIEWER]: '你是一位目标对齐审查者。逐条校验变更是否达成审查目标。',
  [AGENT.FRONTEND_DEV]: '你是一位前端开发专精代理。处理 UI 组件、样式、交互逻辑和响应式设计。',
  [AGENT.BACKEND_DEV]: '你是一位后端开发专精代理。处理 API、数据层、业务逻辑和中间件。',
  [AGENT.DEBUG_FIX]: '你是一位调试修复专精代理。处理错误分析、根因定位、修复实现和回归验证。',
  [AGENT.REFACTOR_DEV]: '你是一位重构专精代理。处理代码重构、架构优化和技术债清理。',
}

function getSpecialistPrompt(specialistName: string): string {
  return SPECIALIST_PROMPT_TEMPLATES[specialistName] ?? `你是一位专精代理: ${specialistName}。`
}

export const aeDomainDispatchPrepareTool = tool({
  description: [
    '代码化域调度准备：预计算专精代理列表、协调策略和 prompt 模板。',
    '',
    '功能说明：',
    '- 调用 selectSpecialists() 确定性选择专精代理',
    '- 调用 getCoordinationStrategy() 获取协调策略和聚合策略',
    '- 为每个选中的专精生成 prompt 模板和变量槽，编排层只需填充变量后直接 Task 调用',
    '- 返回 tasks 数组，每个元素包含 agent（专精代理名）和 prompt（可填充的模板）',
    '',
    '适用场景：',
    '- ae:review 编排层直接并行调度审查专精代理（替代通过 @review-domain 中转）',
    '- ae:work 编排层直接并行调度开发专精代理（替代通过 @development-domain 中转）',
    '',
    '不适用场景：',
    '- 仅查询域目录信息（使用 ae-domain-catalog）',
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
      .describe('域特有扩展上下文，如 hasSecurity、hasApi、kind 等'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `准备域调度: ${args.domain}`, metadata: { domain: args.domain } })

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

      if (specialists.length === 0) {
        return JSON.stringify({
          domain: args.domain,
          strategy,
          tasks: [],
          specialistCount: 0,
          fallbackHint: args.domain === 'review'
            ? '未选中任何审查专精代理。请检查 domainContext 中的标记是否正确，或考虑直接调用 @review-domain。'
            : '未选中任何开发专精代理。请检查 domainContext 中的标记是否正确，或考虑直接调用 @development-domain。',
        }, null, 2)
      }

      const tasks = specialists.map((s) => ({
        agent: s.name,
        prompt: getSpecialistPrompt(s.name),
        capabilities: s.capabilities,
        selectionCriteria: s.selectionCriteria,
      }))

      return JSON.stringify({
        domain: args.domain,
        strategy,
        tasks,
        specialistCount: specialists.length,
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `准备域调度时出错: ${message}`
    }
  },
})
