import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { selectCodeReviewers, selectDocumentReviewers } from '../services/review-selector.js'

export const aeReviewContractTool: ToolDefinition = tool({
  description: [
    '返回 AE 审查契约。',
    '',
    '功能说明：',
    '- 根据审查类型与模式生成审查团队',
    '- 返回门控语义和模式边界',
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
    kind: tool.schema.enum(['document', 'plan', 'code']).describe('审查类型'),
    mode: tool.schema.enum(['interactive', 'headless', 'report-only', 'autofix']).describe('审查模式'),
    has_ui: tool.schema.boolean().optional().describe('是否涉及 UI'),
    has_security: tool.schema.boolean().optional().describe('是否涉及安全边界'),
    has_cli: tool.schema.boolean().optional().describe('是否涉及 CLI'),
    has_typescript: tool.schema.boolean().optional().describe('是否涉及 TypeScript 代码'),
    changed_lines: tool.schema.number().optional().describe('改动行数'),
    has_pr_metadata: tool.schema.boolean().optional().describe('是否存在 PR 元数据'),
    requirement_count: tool.schema.number().optional().describe('需求数量'),
  },
  async execute(args) {
    return Effect.runPromise(
      Effect.sync(() => {
        const reviewers =
          args.kind === 'code'
            ? selectCodeReviewers({
                hasCli: args.has_cli,
                hasPrMetadata: args.has_pr_metadata,
                hasSecurity: args.has_security,
                hasTypescript: args.has_typescript,
                changedLineCount: args.changed_lines,
              })
            : selectDocumentReviewers({
                documentType: args.kind === 'plan' ? 'plan' : 'requirements',
                hasSecurity: args.has_security,
                hasUi: args.has_ui,
                requirementCount: args.requirement_count,
              })

        return JSON.stringify(
          {
            kind: args.kind,
            mode: args.mode,
            reviewers,
            gate: args.kind === 'code' ? 'P0/P1 默认阻断；report-only 模式仅报告' : '文档与计划审查默认作为门控使用',
          },
          null,
          2,
        )
      }),
    )
  },
})
