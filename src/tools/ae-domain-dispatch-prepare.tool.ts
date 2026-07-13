import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { AGENT } from '../schemas/ae-asset-schema.js'
import {
  selectSpecialists,
  getCoordinationStrategy,
  getDomainAgentName,
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
  [AGENT.ARCHITECTURE_STRATEGIST]: '你是一位架构策略师。从架构视角分析变更，检查架构边界、跨模块依赖和系统级抽象。',
  [AGENT.PERFORMANCE_REVIEWER]: '你是一位性能审查者。审查运行时性能和可扩展性问题。',
  [AGENT.API_CONTRACT_REVIEWER]: '你是一位 API 契约审查者。审查破坏性契约变更和兼容性。',
  [AGENT.RELIABILITY_REVIEWER]: '你是一位可靠性审查者。审查错误处理、重试和故障模式。',
  [AGENT.DATA_MIGRATIONS_REVIEWER]: '你是一位数据迁移审查者。审查数据完整性、迁移安全性和隐私合规。',
  [AGENT.PREVIOUS_COMMENTS_REVIEWER]: '你是一位历史评论审查者。检查先前反馈是否已在当前变更中处理。',
  [AGENT.PRODUCT_LENS_REVIEWER]: '你是一位产品视角审查者。质疑前提主张、评估战略后果和范围对齐。',
  [AGENT.STEP_GRANULARITY_REVIEWER]: '你是一位步骤粒度审查者。审查设计步骤是否拆解至最小不可再分单元。',
  [AGENT.DESIGN_LENS_REVIEWER]: '你是一位设计视角审查者。审查缺失的设计决策、信息架构和交互状态。',
  [AGENT.TEST_CASE_REVIEWER]: '你是一位测试用例审查者。审查测试文档的结构完整性和覆盖完备性。',
  [AGENT.REQUIREMENTS_REVIEWER]: '你是一位需求审查者。审查目标清晰度、范围边界、验收标准可验证性和未决问题。',
  [AGENT.PROTOTYPE_REVIEWER]: '你是一位原型审查者。审查交互完整性、状态覆盖、与需求的一致性以及实现可行性提示。',
  [AGENT.TRACEABILITY_REVIEWER]: '你是一位追溯审查者。审查需求、设计、原型、测试和代码之间的链路断裂。',
  [AGENT.EVIDENCE_REVIEWER]: '你是一位证据审查者。审查事实性声明、命令输出、引用和交付证据是否可核验。',
  [AGENT.GOAL_ALIGNMENT_REVIEWER]: '你是一位目标对齐审查者。逐条校验变更是否达成审查目标。',
  [AGENT.FRONTEND_DEV]: '你是一位前端开发专精代理。处理 UI 组件、样式、交互逻辑和响应式设计。',
  [AGENT.BACKEND_DEV]: '你是一位后端开发专精代理。处理 API、数据层、业务逻辑和中间件。',
  [AGENT.DEBUG_FIX]: '你是一位调试修复专精代理。处理错误分析、根因定位、修复实现和回归验证。',
}

function getSpecialistPrompt(specialistName: string): string {
  return SPECIALIST_PROMPT_TEMPLATES[specialistName] ?? `你是一位专精代理: ${specialistName}。`
}

interface ConsistencyWarning {
  field: string
  message: string
  severity: 'error' | 'warn' | 'info'
}

function checkKindDomainConsistency(
  domain: string,
  kind: string | undefined,
): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = []

  if (domain === 'development' && kind !== undefined) {
    warnings.push({
      field: 'kind',
      message: `development 域不使用 kind 参数（kind 是审查类型标识: code/document/general 等）。你可能误用了 domain=development 来做代码审查；审查请用 domain=review，开发任务请移除 kind 参数。`,
      severity: 'warn',
    })
  }

  if ((domain === 'review' || domain === 'general') && kind === undefined) {
    warnings.push({
      field: 'kind',
      message: `审查域建议传入 kind 参数（code/document/general/mixed/hybrid）以精确选择专精代理。未传入时将按默认逻辑推导，可能遗漏关键审查维度。`,
      severity: 'info',
    })
  }

  return warnings
}

interface DispatchGuard {
  rule: string
  allowedDegradation: string
  forbiddenReasons: string[]
  currentCount: number
}

function buildDispatchGuard(domain: string, count: number): DispatchGuard {
  const domainAgentName = getDomainAgentName(domain)
  return {
    rule: `specialistCount=${count} > 0，禁止调用 ${domainAgentName}，必须直接 Task 调度全部 ${count} 个专精代理`,
    allowedDegradation: `仅当平台硬性不支持多工具调用（需可验证证据）且 specialistCount > 20 时，才允许降级为调用 ${domainAgentName}`,
    forbiddenReasons: [
      '上下文成本 / token 经济顾虑',
      '根因已定位或审查动力下降',
      'LLM 主观判断"太多"或"不高效"',
    ],
    currentCount: count,
  }
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
    '',
    '注意事项：',
    '- 所有域上下文标记（has_security、has_api 等）均为顶级参数，无需嵌套对象',
    '- 布尔标记默认 false，仅需传入 true 的标记即可激活对应专精代理',
  ].join('\n'),
  args: {
    domain: z
      .enum(['review', 'development', 'general'])
      .describe('目标域名；general 表示 ae:review 混合范围审查，使用 review 域专精代理'),
    intent: z
      .string()
      .min(1)
      .describe('任务意图文本'),
    constraints: z
      .array(z.string())
      .default([])
      .describe('约束条件列表'),
    kind: z
      .enum(['code', 'document', 'test', 'general', 'design', 'prototype', 'mixed', 'hybrid'])
      .optional()
      .describe('审查类型；code=代码审查，document=文档审查，general/mixed/hybrid=混合审查'),
    scenes: z
      .string()
      .optional()
      .describe('审查场景列表，逗号分隔，可选值：code/requirements/design/prototype/test-case/config/asset/general-document'),
    targets: z
      .string()
      .optional()
      .describe('目标产出物类型列表，逗号分隔，可选值：code/requirements/design/prototype/test-case/config/asset/document'),
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
    has_pr_metadata: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否存在 PR 元数据'),
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
    has_product_claim: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否包含战略或产品主张'),
    has_architecture_decision: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否包含重要架构决策'),
    is_high_risk_domain: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否属于高风险领域'),
    has_new_abstraction: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否提出新抽象'),
    has_upstream: z
      .boolean()
      .optional()
      .default(false)
      .describe('文档是否记录了上游来源'),
    has_goal_alignment: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否提供审查目标（成功条件列表），激活目标对齐审查'),
    has_design_contract: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否存在设计文档契约，激活设计一致性、UI 一致性和测试覆盖审查'),
    has_evidence_claim: z
      .boolean()
      .optional()
      .default(false)
      .describe('文档是否包含事实性声明、外部引用或交付证据'),
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

      const domainContext: Record<string, unknown> = {
        kind: args.kind,
        domain: args.domain,
        scenes: args.scenes,
        targetTypes: args.targets,
        hasSecurity: args.has_security,
        hasApi: args.has_api,
        hasPerformance: args.has_performance,
        hasReliability: args.has_reliability,
        hasCli: args.has_cli,
        hasTooling: args.has_tooling,
        hasAgentConfig: args.has_agent_config,
        hasPrMetadata: args.has_pr_metadata,
        hasTypescript: args.has_typescript,
        hasMigrations: args.has_migrations,
        hasConfig: args.has_config,
        hasInfra: args.has_infra,
        hasDatabase: args.has_database,
        hasScript: args.has_script,
        hasUi: args.has_ui,
        hasProductClaim: args.has_product_claim,
        hasArchitectureDecision: args.has_architecture_decision,
        isHighRiskDomain: args.is_high_risk_domain,
        hasNewAbstraction: args.has_new_abstraction,
        hasUpstream: args.has_upstream,
        hasGoalAlignment: args.has_goal_alignment,
        hasDesignContract: args.has_design_contract,
        hasEvidenceClaim: args.has_evidence_claim,
        changedLineCount: args.changed_lines,
        requirementCount: args.requirement_count,
      }

      const specialists = selectSpecialists(args.domain, taskIntent, domainContext)
      const strategyDomain = args.domain === 'general' ? 'review' : args.domain
      const strategy: CoordinationConfig = getCoordinationStrategy(strategyDomain)
      const consistencyWarnings = checkKindDomainConsistency(args.domain, args.kind)

      if (specialists.length === 0) {
        const isReviewDomain = args.domain === 'review' || args.domain === 'general'
        const domainAgentName = getDomainAgentName(args.domain)
        const consistencyHint = consistencyWarnings.length > 0
          ? ` 一致性警告: ${consistencyWarnings.map((w) => w.message).join(' ')}`
          : ''
        return JSON.stringify({
          domain: args.domain,
          strategy,
          tasks: [],
          specialistCount: 0,
          consistencyWarnings,
          fallbackHint: `未选中任何${isReviewDomain ? '审查' : '开发'}专精代理。请检查传入的标记参数是否正确。${consistencyHint} 如确认参数无误仍为空，可调用 ${domainAgentName}。`,
        }, null, 2)
      }

      const tasks = specialists.map((s) => ({
        agent: s.name,
        prompt: getSpecialistPrompt(s.name),
        capabilities: s.capabilities,
        selectionCriteria: s.selectionCriteria,
      }))

      const dispatchGuard = buildDispatchGuard(args.domain, specialists.length)

      return JSON.stringify({
        domain: args.domain,
        strategy,
        tasks,
        specialistCount: specialists.length,
        consistencyWarnings,
        dispatchGuard,
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `准备域调度时出错: ${message}`
    }
  },
})
