import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { selectCodeReviewers, selectDocumentReviewers } from '../services/review-selector.js'
import { showToast } from '../services/toast-holder.js'
import { AeModeSchema } from '../schemas/ae-asset-schema.js'

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
    has_typescript: tool.schema.boolean().optional().describe('是否涉及 TypeScript 代码'),
    has_performance: tool.schema.boolean().optional().describe('是否涉及性能敏感逻辑'),
    has_api: tool.schema.boolean().optional().describe('是否涉及 API 契约变更'),
    has_reliability: tool.schema.boolean().optional().describe('是否涉及可靠性/容错机制'),
    changed_lines: tool.schema.number().optional().describe('改动行数'),
    has_pr_metadata: tool.schema.boolean().optional().describe('是否存在 PR 元数据'),
    requirement_count: tool.schema.number().optional().describe('需求数量'),
    has_architecture_decision: tool.schema.boolean().optional().describe('是否包含重要架构决策'),
    is_high_risk_domain: tool.schema.boolean().optional().describe('是否属于高风险领域'),
    has_new_abstraction: tool.schema.boolean().optional().describe('是否提出新抽象'),
  },
  async execute(args) {
    return Effect.runPromise(
      Effect.try({
        try: () => {
          const reviewers =
            args.kind === 'code'
              ? selectCodeReviewers({
                  hasCli: args.has_cli,
                  hasPrMetadata: args.has_pr_metadata,
                  hasSecurity: args.has_security,
                  hasTypescript: args.has_typescript,
                  hasPerformance: args.has_performance,
                  hasApi: args.has_api,
                  hasReliability: args.has_reliability,
                  changedLineCount: args.changed_lines,
                })
              : selectDocumentReviewers({
                  documentType: args.kind === 'plan' ? 'plan' : args.kind === 'test' ? 'test' : args.kind === 'general' ? 'general' : 'requirements',
                  hasSecurity: args.has_security,
                  hasUi: args.has_ui,
                  requirementCount: args.requirement_count,
                  hasArchitectureDecision: args.has_architecture_decision,
                  isHighRiskDomain: args.is_high_risk_domain,
                  hasNewAbstraction: args.has_new_abstraction,
                })

          return JSON.stringify(
            {
              kind: args.kind,
              mode: args.mode,
              reviewers,
              gate: args.kind === 'code' ? 'P0/P1 默认阻断；只读模式仅报告' : '文档与计划审查默认作为质量门控',
            },
            null,
            2,
          )
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          showToast(`审查契约生成失败：${message}`)
          return Effect.succeed(`❌ 审查契约生成失败：${message}`)
        }),
      ),
    )
  },
})
