import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { runGate } from '../services/gate-service.js'
import { showToast } from '../services/toast-holder.js'

export const aeGateTool: ToolDefinition = tool({
  description: [
    '执行 AE 自诊断与硬门禁检查。',
    '',
    '功能说明：',
    '- 为 `/ae-lfg` 和 `ae:work` 检查阶段是否跳过、验证是否记录、Git 写操作是否授权',
    '- 收集需求文档、计划文档、工作区变更、验证命令、审查状态等证据',
    '- 在最终门禁写入 `docs/ae/gates/` 证明文件',
    '',
    '适用场景：',
    '- `/ae-lfg` 的 before_work、before_review、final 门禁',
    '- `ae:work` 交付前证明没有漏验证或越权',
    '',
    '不适用场景：',
    '- 不替代真实测试、构建、浏览器验收或代码审查',
    '- 不自动修复阻断项，只返回需要补齐的证据和操作',
  ].join('\n'),
  args: {
    workflow: tool.schema.enum(['lfg', 'work']).describe('工作流名称'),
    checkpoint: tool.schema
      .enum(['start', 'before_plan', 'before_work', 'before_review', 'final'])
      .describe('门禁检查点'),
    requirements_path: tool.schema.string().optional().describe('需求文档路径，使用仓库相对路径'),
    plan_path: tool.schema.string().optional().describe('计划文档路径，使用仓库相对路径'),
    validation_commands: tool.schema.array(tool.schema.string()).optional().describe('已实际运行的验证命令列表'),
    review_status: tool.schema
      .enum(['passed', 'failed', 'not_run', 'not_applicable'])
      .optional()
      .describe('代码或文档审查状态'),
    browser_test_status: tool.schema
      .enum(['passed', 'failed', 'not_run', 'not_applicable'])
      .optional()
      .describe('浏览器验收状态'),
    git_operations: tool.schema.array(tool.schema.string()).optional().describe('本次会话执行过的 Git 写操作记录'),
    user_authorized_git_write: tool.schema.boolean().optional().describe('用户是否明确授权 Git 写操作'),
    no_code_change_reason: tool.schema.string().optional().describe('没有代码变更时的原因'),
    notes: tool.schema.string().optional().describe('补充说明、跳过原因或风险记录'),
    write_proof: tool.schema.boolean().optional().describe('是否写入门禁证明文件，final 默认写入'),
  },
  async execute(args, context) {
    context.metadata({ title: `AE 门禁检查: ${args.workflow}/${args.checkpoint}` })

    return Effect.runPromise(
      runGate(context.worktree, {
        workflow: args.workflow,
        checkpoint: args.checkpoint,
        requirementsPath: args.requirements_path,
        planPath: args.plan_path,
        validationCommands: args.validation_commands,
        reviewStatus: args.review_status,
        browserTestStatus: args.browser_test_status,
        gitOperations: args.git_operations,
        userAuthorizedGitWrite: args.user_authorized_git_write,
        noCodeChangeReason: args.no_code_change_reason,
        notes: args.notes,
        writeProof: args.write_proof,
      }).pipe(
        Effect.map((result) => JSON.stringify(result, null, 2)),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          showToast(`AE 门禁检查失败：${message}`)
          return Effect.succeed(`❌ AE 门禁检查失败：${message}`)
        }),
      ),
    )
  },
})
