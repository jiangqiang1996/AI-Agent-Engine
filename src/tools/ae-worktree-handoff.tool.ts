import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { z } from 'zod'

import { writeHandoffFile } from '../services/worktree-handoff-generator.js'
import type { WorktreeHandoffInput } from '../services/worktree-handoff-generator.js'

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
  requirements_path: z
    .string()
    .optional()
    .describe('需求文档相对路径，例如 ae/prds/xxx.md。A 端条件必选：当前任务对应的上游需求产物真实存在时必须迁移并传入（即使被 .gitignore 忽略也按物理存在迁移）；不存在时不传'),
  design_path: z
    .string()
    .optional()
    .describe('设计文档相对路径，例如 ae/designs/xxx/design.md。A 端条件必选：上游设计产物真实存在时必须迁移并传入（即使被 .gitignore 忽略也按物理存在迁移）；不存在时可不传，但此时必须传 task_brief'),
  graph_path: z
    .string()
    .optional()
    .describe('图谱目录相对路径。A 端条件必选：ae/graphs/ 真实存在时必须迁移并传入（即使被 .gitignore 忽略也按物理存在迁移）；不存在时不传'),
  ae_config_path: z
    .string()
    .optional()
    .describe('AE 项目配置相对路径。A 端条件必选：.opencode/ae.jsonc 真实存在时必须迁移并传入（即使被 .gitignore 忽略也按物理存在迁移）；不存在时不传'),
  task_brief: z
    .string()
    .optional()
    .describe('任务详情。无 design_path 时必填：将任务详情（目标、范围、约束、已确定决策、实现要求）直接写入交接文件，确保 B worktree 无需读取 A worktree 任何文件即可执行。有 design_path 时可不传'),
  execution_baseline: z
    .string()
    .describe('执行基线声明，描述进入 B 后必须遵守的基线约束，例如"必须从 ae:work 阶段 1 的任务分析继续执行"'),
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
    '- 交接文件采用结构化章节和 resume_entrypoint 作为真源',
    '- 返回简短交接提示，供 A 会话最后回复使用',
    '- A→B Startup Proof 按固定 schema 逐字段输出，不允许遗漏',
    '- 需求、设计、图谱和 AE 项目配置路径在 A 端是条件必选：当上游产物或物理文件真实存在时必须迁移并传入；不存在时不传。B 端缺失时降级为可选上下文，不阻断继续执行',
    '- design_path 和 task_brief 至少传入一个：有设计文档时传 design_path 并迁移到 B worktree；无设计文档时必须通过 task_brief 将任务详情写入交接文件，确保 B worktree 无需读取 A worktree 任何文件即可执行',
    '- 产物独立性约束：ae:prd 和 ae:design 的产物不得引用之前的产物文件（如当前 prd 禁止引用上一个需求或设计的产物路径）；交接文件中只迁移当前任务的直接上游产物，不迁移历史产物',
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
    requirements_path: WorktreeHandoffInputSchema.shape.requirements_path,
    design_path: WorktreeHandoffInputSchema.shape.design_path,
    graph_path: WorktreeHandoffInputSchema.shape.graph_path,
    ae_config_path: WorktreeHandoffInputSchema.shape.ae_config_path,
    task_brief: WorktreeHandoffInputSchema.shape.task_brief,
    execution_baseline: WorktreeHandoffInputSchema.shape.execution_baseline,
    verification_requirements: WorktreeHandoffInputSchema.shape.verification_requirements,
  },
  async execute(args) {
    const input: WorktreeHandoffInput = {
      source_session_id: args.source_session_id,
      source_worktree: args.source_worktree,
      target_worktree: args.target_worktree,
      branch: args.branch,
      head: args.head,
      head_message: args.head_message,
      authorization_source: args.authorization_source,
      authorization_scope: args.authorization_scope,
      covered_command_args: args.covered_command_args,
      final_command_args: args.final_command_args,
      creation_result: args.creation_result,
      execution_baseline: args.execution_baseline,
      verification_requirements: args.verification_requirements,
    }
    if (args.session_evidence !== undefined) {
      input.session_evidence = args.session_evidence
    }
    if (args.requirements_path !== undefined) {
      input.requirements_path = args.requirements_path
    }
    if (args.design_path !== undefined) {
      input.design_path = args.design_path
    }
    if (args.graph_path !== undefined) {
      input.graph_path = args.graph_path
    }
    if (args.ae_config_path !== undefined) {
      input.ae_config_path = args.ae_config_path
    }
    if (args.task_brief !== undefined) {
      input.task_brief = args.task_brief
    }

    const result = await writeHandoffFile(input)

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
    lines.push('**A 会话最后回复必须逐字使用以下简短交接提示：**')
    lines.push('')
    lines.push(result.userInstruction)
    lines.push('')
    lines.push('---')
    lines.push('')
    lines.push('交接后确认清单：')
    lines.push('1. 工具返回成功（本消息无错误提示）')
    lines.push('2. A 会话最后回复逐字使用了上方简短交接提示')
    lines.push('3. 交接文件路径符合 ae/handoffs/<timestamp>-worktree-handoff.md 格式')
    lines.push('4. B worktree 通过 ae:work 读取结构化交接文件继续')

    return lines.join('\n')
  },
})
