import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import { writeHandoffFile } from '../services/worktree-handoff-generator.js'

const WorktreeHandoffInputSchema = z.object({
  source_session_id: z
    .string()
    .describe('A 会话 ID；运行时不可见时传 unavailable'),
  session_evidence: z
    .string()
    .optional()
    .describe('source_session_id=unavailable 时必填，可引用的消息 ID 或会话证据'),
  source_worktree: z
    .string()
    .describe('A 的可观察 worktree 绝对路径'),
  target_worktree: z
    .string()
    .describe('B worktree 绝对路径'),
  branch: z
    .string()
    .describe('B 的分支名'),
  head: z
    .string()
    .describe('B 的 HEAD commit hash'),
  head_message: z
    .string()
    .describe('HEAD 的提交信息'),
  authorization_source: z
    .string()
    .describe('用户授权来源描述，例如"当前会话用户选择创建 worktree，随后明确选择授权创建"'),
  authorization_scope: z
    .string()
    .describe('授权覆盖的命令范围描述'),
  covered_command_args: z
    .string()
    .describe('用户授权覆盖的完整命令参数'),
  final_command_args: z
    .string()
    .describe('实际执行的完整命令参数'),
  creation_result: z
    .string()
    .describe('worktree 创建结果描述'),
  plan_path: z
    .string()
    .describe('计划文档相对路径，例如 docs/ae/plans/xxx-plan.md'),
  requirements_path: z
    .string()
    .optional()
    .describe('需求文档相对路径，例如 docs/ae/brainstorms/xxx.md'),
  design_path: z
    .string()
    .optional()
    .describe('设计文档相对路径；设计由计划承载时无需传值'),
  design_borne_by_plan: z
    .boolean()
    .describe('设计是否由计划文档承载'),
  execution_baseline: z
    .string()
    .describe('执行基线声明，描述进入 B 后必须遵守的基线约束'),
  verification_requirements: z
    .string()
    .describe('验证要求摘要，描述交付前必须运行的验证命令和标准'),
})

export const aeWorktreeHandoffTool: ToolDefinition = tool({
  description: [
    '仅用于 ae:work 中 A→B worktree 转移时生成交接文件；不创建新会话，会话级交接请用 ae-handoff。',
    '',
    '功能说明：',
    '- 按规范模板生成交接 Markdown，结构由代码保证，AI 只需填值',
    '- Continue Prompt 只出现一次（单一真源），通过返回值供 A 会话最后回复使用',
    '- A→B Startup Proof 按固定 schema 逐字段输出，不允许遗漏',
    '- source_session_id=unavailable 时强制要求 session_evidence',
    '- 自动创建目标目录并写入文件',
    '',
    '适用场景：',
    '- ae:work 流程中 A 会话创建 B worktree 后，需要生成交接文件',
    '',
    '不适用场景：',
    '- 会话级交接（使用 ae-handoff 工具）',
    '- 非 worktree 转移场景',
  ].join('\n'),
  args: {
    source_session_id: WorktreeHandoffInputSchema.shape.source_session_id,
    session_evidence: WorktreeHandoffInputSchema.shape.session_evidence,
    source_worktree: WorktreeHandoffInputSchema.shape.source_worktree,
    target_worktree: WorktreeHandoffInputSchema.shape.target_worktree,
    branch: WorktreeHandoffInputSchema.shape.branch,
    head: WorktreeHandoffInputSchema.shape.head,
    head_message: WorktreeHandoffInputSchema.shape.head_message,
    authorization_source: WorktreeHandoffInputSchema.shape.authorization_source,
    authorization_scope: WorktreeHandoffInputSchema.shape.authorization_scope,
    covered_command_args: WorktreeHandoffInputSchema.shape.covered_command_args,
    final_command_args: WorktreeHandoffInputSchema.shape.final_command_args,
    creation_result: WorktreeHandoffInputSchema.shape.creation_result,
    plan_path: WorktreeHandoffInputSchema.shape.plan_path,
    requirements_path: WorktreeHandoffInputSchema.shape.requirements_path,
    design_path: WorktreeHandoffInputSchema.shape.design_path,
    design_borne_by_plan: WorktreeHandoffInputSchema.shape.design_borne_by_plan,
    execution_baseline: WorktreeHandoffInputSchema.shape.execution_baseline,
    verification_requirements: WorktreeHandoffInputSchema.shape.verification_requirements,
  },
  async execute(args) {
    const result = await writeHandoffFile(args)

    if ('error' in result) {
      return `❌ 交接文件生成失败：${result.error}`
    }

    const lines: string[] = []
    lines.push('✅ 交接文件已生成并写入。')
    lines.push('')
    lines.push(`文件路径：${result.filePath}`)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('**A 会话最后回复必须逐字使用以下 canonical_continue_prompt：**')
    lines.push('')
    lines.push(result.canonicalContinuePrompt)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('交接后确认清单：')
    lines.push('1. 工具返回成功（本消息无错误提示）')
    lines.push('2. A 会话最后回复逐字使用了上方 canonical_continue_prompt')
    lines.push('3. 交接文件路径符合 docs/ae/handoffs/<timestamp>-worktree-handoff.md 格式')

    return lines.join('\n')
  },
})
