import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'

const BRANCH_PREFIX_PATTERN = /^(feat|fix|refactor|docs|test|chore)\//

/** A→B worktree 交接输入参数，包含来源/目标 worktree 信息、Git 授权证据和执行基线。需求/设计/图谱/AE 配置路径在 A 端条件必选：上游产物或物理文件存在时必须迁移并传入；B 端缺失时降级为可选上下文。当无 design_path 时，task_brief 必填——将任务详情直接写入交接文件，确保 B worktree 无需读取 A worktree 文件即可执行。 */
export interface WorktreeHandoffInput {
  source_session_id: string
  session_evidence?: string
  source_worktree: string
  target_worktree: string
  branch: string
  head: string
  head_message: string
  authorization_source: string
  authorization_scope: string
  covered_command_args: string
  final_command_args: string
  creation_result: string
  requirements_path?: string
  design_path?: string
  graph_path?: string
  ae_config_path?: string
  task_brief?: string
  execution_baseline: string
  verification_requirements: string
}

/** 交接文件写入结果，包含文件绝对路径和用户续执行指令。 */
export interface WorktreeHandoffOutput {
  filePath: string
  userInstruction: string
}

function validateInput(input: WorktreeHandoffInput): string | null {
  if (!input.source_session_id.trim()) return 'source_session_id 不能为空。'
  if (input.source_session_id.trim() === 'unavailable' && !input.session_evidence?.trim()) {
    return 'source_session_id 为 unavailable 时，session_evidence 必须提供可引用的消息或会话证据。'
  }
  if (!input.source_worktree.trim()) return 'source_worktree 不能为空。'
  if (!input.target_worktree.trim()) return 'target_worktree 不能为空。'
  if (!input.branch.trim()) return 'branch 不能为空。'
  if (!input.head.trim()) return 'head 不能为空。'
  if (!input.head_message.trim()) return 'head_message 不能为空。'
  if (!input.authorization_source.trim()) return 'authorization_source 不能为空。'
  if (!input.authorization_scope.trim()) return 'authorization_scope 不能为空。'
  if (!input.covered_command_args.trim()) return 'covered_command_args 不能为空。'
  if (!input.final_command_args.trim()) return 'final_command_args 不能为空。'
  if (!input.creation_result.trim()) return 'creation_result 不能为空。'
  if (!input.design_path?.trim() && !input.task_brief?.trim()) {
    return 'design_path 和 task_brief 至少传入一个：有设计文档时传 design_path；无设计文档时必须通过 task_brief 将任务详情写入交接文件，确保 B worktree 无需读取 A worktree 文件即可执行。'
  }
  if (!input.execution_baseline.trim()) return 'execution_baseline 不能为空。'
  if (!input.verification_requirements.trim()) return 'verification_requirements 不能为空。'
  return null
}

function generateTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ms}`
}

function buildMigratedArtifacts(input: WorktreeHandoffInput): string {
  const lines: string[] = []
  if (input.requirements_path?.trim()) {
    lines.push(`- requirements: \`${input.requirements_path}\``)
  }
  if (input.design_path?.trim()) {
    lines.push(`- design: \`${input.design_path}\``)
  }
  if (input.task_brief?.trim() && !input.design_path?.trim()) {
    lines.push('- task_brief: 内联于交接文件 Task Brief 章节')
  }
  if (input.graph_path?.trim()) {
    lines.push(`- graph: \`${input.graph_path}\``)
  }
  if (input.ae_config_path?.trim()) {
    lines.push(`- ae_config: \`${input.ae_config_path}\``)
  }
  return lines.join('\n')
}

function buildUserInstruction(input: WorktreeHandoffInput, handoffRelPath: string): string {
  return [
    '执行已转移到新的 B worktree。',
    '',
    `目标工作空间：${input.target_worktree}`,
    `交接文件：${handoffRelPath}`,
    '',
    '请在目标工作空间中启动 opencode，然后调用 ae:work，并把交接文件作为唯一任务输入。',
    '可使用便捷命令：',
    '',
    '```text',
    `/ae-work-continue ${handoffRelPath}`,
    '```',
  ].join('\n')
}

function buildFrontmatter(input: WorktreeHandoffInput): string {
  const timestamp = new Date().toISOString()
  return [
    '---',
    'type: worktree-handoff',
    'status: transferred',
    `createdAt: ${timestamp}`,
    `sourceWorktree: ${input.source_worktree}`,
    `targetWorktree: ${input.target_worktree}`,
    `branch: ${input.branch}`,
    `head: ${input.head}`,
    '---',
  ].join('\n')
}

function buildStartupProof(input: WorktreeHandoffInput, handoffRelPath: string): string {
  const lines: string[] = []
  lines.push('## A→B Startup Proof')
  lines.push('')
  lines.push(`- source_session_id: ${input.source_session_id}`)
  if (input.source_session_id.trim() === 'unavailable' && input.session_evidence) {
    lines.push(`- session_evidence: ${input.session_evidence}`)
  }
  lines.push(`- source_worktree: \`${input.source_worktree}\``)
  lines.push(`- target_worktree: \`${input.target_worktree}\``)
  lines.push(`- branch: \`${input.branch}\``)
  lines.push(`- head: \`${input.head} ${input.head_message}\``)
  lines.push(`- authorization_source: ${input.authorization_source}`)
  lines.push(`- authorization_scope: ${input.authorization_scope}`)
  lines.push(`- covered_command_args: \`${input.covered_command_args}\``)
  lines.push(`- final_command_args: \`${input.final_command_args}\``)
  lines.push(`- creation_result: ${input.creation_result}`)
  lines.push(`- migrated_artifacts:`)
  if (input.requirements_path?.trim()) {
    lines.push(`  - requirements: \`${input.requirements_path}\``)
  }
  if (input.design_path?.trim()) {
    lines.push(`  - design: \`${input.design_path}\``)
  }
  if (input.task_brief?.trim() && !input.design_path?.trim()) {
    lines.push('  - task_brief: 内联于交接文件（无 design_path 时作为执行输入）')
  }
  if (input.graph_path?.trim()) {
    lines.push(`  - graph: \`${input.graph_path}\``)
  }
  if (input.ae_config_path?.trim()) {
    lines.push(`  - ae_config: \`${input.ae_config_path}\``)
  }
  lines.push(`- execution_baseline: ${input.execution_baseline}`)
  lines.push(`- resume_entrypoint: ae:work ${handoffRelPath}`)
  lines.push('')
  return lines.join('\n')
}

function buildMigratedArtifactsSection(input: WorktreeHandoffInput): string {
  const lines: string[] = []
  lines.push('## Migrated Artifacts')
  lines.push('')
  lines.push(buildMigratedArtifacts(input))
  lines.push('')
  return lines.join('\n')
}

function buildTaskBriefSection(input: WorktreeHandoffInput): string | null {
  if (!input.task_brief?.trim()) return null
  const lines: string[] = []
  lines.push('## Task Brief')
  lines.push('')
  lines.push('> 当 design_path 未迁移或不存在时，以下任务详情是 B worktree 执行的唯一输入。')
  lines.push('> B worktree 无需读取 A worktree 的任何文件，直接依据以下内容执行。')
  lines.push('')
  lines.push(input.task_brief)
  lines.push('')
  return lines.join('\n')
}

function buildExecutionBaselineSection(input: WorktreeHandoffInput, handoffRelPath: string): string {
  const lines: string[] = []
  lines.push('## Execution Baseline')
  lines.push('')
  lines.push(`- 设计文档是本次执行的实现基线；进入 B worktree 后不得重新审查、深化或转换本次需求或设计。`)
  lines.push(`- ${input.execution_baseline}`)
  lines.push(`- 验证命令：${input.verification_requirements}`)
  lines.push(`- 续执行入口：在目标 B worktree 中调用 ae:work，并把 ${handoffRelPath} 作为唯一任务输入。`)
  lines.push(`- 实现完成后必须进行代码审查或记录无法审查原因，并在最终回复中列出验证、审查和 Git 操作状态。`)
  lines.push(`- 禁止回到 A worktree ${input.source_worktree} 写代码、配置、测试或文档；后续所有实现只在目标 B worktree 中进行。`)
  lines.push('')
  return lines.join('\n')
}

/**
 * 生成 A→B worktree 交接 Markdown 内容和相对路径。
 * 输入校验失败时返回 `{ error }`。
 */
export function generateHandoffMarkdown(input: WorktreeHandoffInput): { markdown: string; handoffRelPath: string } | { error: string } {
  const validationError = validateInput(input)
  if (validationError) {
    return { error: validationError }
  }

  const timestamp = generateTimestamp()
  const worktreeName = input.branch.replace(BRANCH_PREFIX_PATTERN, '')
  const handoffDir = docsAePath(DOCS_AE_SUBDIRS.HANDOFFS)
  const handoffRelPath = `${handoffDir}/${timestamp}-worktree-handoff.md`

  const sections: string[] = []
  sections.push(buildFrontmatter(input))
  sections.push('')
  sections.push(`# Worktree Handoff: ${worktreeName}`)
  sections.push('')
  sections.push(buildStartupProof(input, handoffRelPath))
  sections.push(buildMigratedArtifactsSection(input))
  const taskBriefSection = buildTaskBriefSection(input)
  if (taskBriefSection) {
    sections.push(taskBriefSection)
  }
  sections.push(buildExecutionBaselineSection(input, handoffRelPath))

  return {
    markdown: sections.join('\n'),
    handoffRelPath,
  }
}

/**
 * 生成交接 Markdown 并写入目标 worktree 的 `ae/handoffs/` 目录。
 * 目录不存在时自动递归创建。
 */
export async function writeHandoffFile(
  input: WorktreeHandoffInput,
): Promise<WorktreeHandoffOutput | { error: string }> {
  const result = generateHandoffMarkdown(input)
  if ('error' in result) {
    return { error: result.error }
  }

  const absPath = join(input.target_worktree, result.handoffRelPath)
  const dir = dirname(absPath)

  try {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(absPath, result.markdown, 'utf-8')
    return {
      filePath: absPath,
      userInstruction: buildUserInstruction(input, result.handoffRelPath),
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { error: `写入交接文件失败：${message}` }
  }
}
