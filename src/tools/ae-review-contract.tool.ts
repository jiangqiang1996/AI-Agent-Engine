import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { selectReviewers, type ReviewSelectionInput } from '../services/review-selector.js'
import { AeModeSchema } from '../schemas/ae-asset-schema.js'

function resolveKind(raw: string): ReviewSelectionInput['kind'] {
  return raw === 'code' ? 'code' : 'document'
}

function resolveDocumentType(raw: string): ReviewSelectionInput['documentType'] {
  if (raw === 'plan') return 'plan'
  if (raw === 'test') return 'test'
  if (raw === 'general') return 'general'
  return 'requirements'
}

export const aeReviewContractTool: ToolDefinition = tool({
  description: [
    '返回 AE 审查契约。',
    '',
    '功能说明：',
    '- 根据审查类型与模式生成审查团队',
    '- 代码审查（kind=code）：支持 Git 差异、全量扫描、会话变更等多种范围确定方式',
    '- 文档审查（kind=document/plan/test/general）：面向文档，与 Git 无强关联',
    '- 返回门控规则和模式边界',
    '',
    '适用场景：',
    '- markdown 技能需要先确定审查团队再并行派发时',
    '- README 或测试需要校验公开审查契约时',
    '',
    '不适用场景：',
    '- 不负责真正执行审查子代理',
    '- 不负责写入审查发现或审查产物',
  ].join('\n'),
  args: {
    kind: tool.schema.enum(['document', 'plan', 'test', 'general', 'code']).describe('审查类型'),
    mode: AeModeSchema.describe('审查模式'),
    has_ui: tool.schema.boolean().optional().describe('是否涉及 UI'),
    has_security: tool.schema.boolean().optional().describe('是否涉及安全边界'),
    has_cli: tool.schema.boolean().optional().describe('是否涉及 CLI'),
    has_tooling: tool.schema.boolean().optional().describe('是否涉及工具定义、工具参数或工具注册'),
    has_agent_config: tool.schema.boolean().optional().describe('是否涉及代理配置、代理注册或技能 frontmatter'),
    has_typescript: tool.schema.boolean().optional().describe('是否涉及 TypeScript 代码'),
    has_performance: tool.schema.boolean().optional().describe('是否涉及性能敏感逻辑'),
    has_api: tool.schema.boolean().optional().describe('是否涉及 API 契约变更'),
    has_reliability: tool.schema.boolean().optional().describe('是否涉及可靠性/容错机制'),
    changed_lines: tool.schema.number().optional().describe('改动行数'),
    has_pr_metadata: tool.schema.boolean().optional().describe('是否存在 PR 元数据'),
    requirement_count: tool.schema.number().optional().describe('需求数量'),
    has_architecture_decision: tool.schema.boolean().optional().describe('是否包含重要架构决策'),
    has_product_claim: tool.schema.boolean().optional().describe('是否包含战略或产品主张'),
    is_high_risk_domain: tool.schema.boolean().optional().describe('是否属于高风险领域'),
    has_new_abstraction: tool.schema.boolean().optional().describe('是否提出新抽象'),
    has_migrations: tool.schema.boolean().optional().describe('是否涉及数据迁移'),
    has_config: tool.schema.boolean().optional().describe('是否涉及配置变更'),
    has_infra: tool.schema.boolean().optional().describe('是否涉及基础设施变更'),
    has_database: tool.schema.boolean().optional().describe('是否涉及数据库变更'),
    has_script: tool.schema.boolean().optional().describe('是否涉及脚本变更'),
    has_upstream: tool.schema.boolean().optional().describe('文档是否记录了 upstream/origin 等上游来源'),
  },
  async execute(args) {
    return Effect.runPromise(
      Effect.try({
        try: () => {
          const kind = resolveKind(args.kind)
          const documentType = resolveDocumentType(args.kind)

          const reviewers = selectReviewers({
            kind,
            documentType,
            hasSecurity: args.has_security,
            hasPerformance: args.has_performance,
            hasApi: args.has_api,
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
            changedLineCount: args.changed_lines,
            requirementCount: args.requirement_count,
            hasArchitectureDecision: args.has_architecture_decision,
            hasProductClaim: args.has_product_claim,
            isHighRiskDomain: args.is_high_risk_domain,
            hasNewAbstraction: args.has_new_abstraction,
            hasUpstream: args.has_upstream,
          })

          return JSON.stringify(
            {
              kind: args.kind,
              documentType: kind === 'document' ? documentType : undefined,
              mode: args.mode,
              reviewers,
              nonSelectionInputs: ['has_typescript', 'has_config', 'has_script'],
              gate: kind === 'code' ? 'P0/P1 默认阻断；只读模式仅报告' : '文档与计划审查默认作为质量门控',
            },
            null,
            2,
          )
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return Effect.succeed(`❌ 审查契约生成失败：${message}`)
        }),
      ),
    )
  },
})
