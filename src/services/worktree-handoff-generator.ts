import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

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
  plan_path: string
  requirements_path?: string
  design_path?: string
  design_borne_by_plan: boolean
  execution_baseline: string
  verification_requirements: string
}

export interface WorktreeHandoffOutput {
  filePath: string
  canonicalContinuePrompt: string
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
  if (!input.plan_path.trim()) return 'plan_path 不能为空。'
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
  lines.push(`- plan: \`${input.plan_path}\``)
  if (input.requirements_path?.trim()) {
    lines.push(`- requirements: \`${input.requirements_path}\``)
  }
  if (input.design_borne_by_plan) {
    lines.push('- design: 由计划文档承载，未提供独立设计文档。')
  } else if (input.design_path?.trim()) {
    lines.push(`- design: \`${input.design_path}\``)
  }
  return lines.join('\n')
}

function buildCanonicalContinuePrompt(
  input: WorktreeHandoffInput,
  handoffRelPath: string,
): string {
  const handoffAbsPath = `${input.target_worktree}/${handoffRelPath}`
  const parts: string[] = []
  parts.push(`请打开目标 B worktree 对应的工作空间：${input.target_worktree}。`)
  parts.push('在该工作空间中启动 opencode，然后粘贴并执行以下提示词继续：')
  parts.push(`调用 ae:work，并把 ${handoffAbsPath} 作为唯一任务输入；不得按裸提示词处理。`)
  if (input.requirements_path?.trim()) {
    parts.push(`需求文档路径为 ${input.requirements_path}，`)
  }
  parts.push(`计划文档路径为 ${input.plan_path}，`)
  if (input.design_borne_by_plan) {
    parts.push('设计由计划承载。')
  } else if (input.design_path?.trim()) {
    parts.push(`设计文档路径为 ${input.design_path}。`)
  }
  parts.push('进入 ae:work 后必须把需求、计划和本交接文件视为已确定执行基线，不得审查或深化本次需求文档、设计文档或计划文档，不得调用需求、设计、计划相关审查或转换技能；直接从阶段 1 的任务分析继续到阶段 2 执行。')
  parts.push(`禁止回到 A worktree ${input.source_worktree} 写文件。`)
  parts.push(`${input.execution_baseline}`)
  parts.push(`验证要求：${input.verification_requirements}`)
  parts.push('实现完成后进行代码审查或记录无法审查原因，并调用 ae-gate workflow:work checkpoint:final。')
  return parts.join('\n')
}

function buildUserInstruction(input: WorktreeHandoffInput, handoffRelPath: string): string {
  return [
    '执行已转移到新的 B worktree。',
    '',
    `目标工作空间：${input.target_worktree}`,
    `交接文件：${handoffRelPath}`,
    '',
    '请在目标工作空间中启动 opencode，然后执行：',
    '',
    '```text',
    '/ae-work-continue',
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
  lines.push(`  - plan: \`${input.plan_path}\``)
  if (input.design_borne_by_plan) {
    lines.push('  - design: 由计划文档承载')
  } else if (input.design_path?.trim()) {
    lines.push(`  - design: \`${input.design_path}\``)
  }
  lines.push(`- execution_baseline: ${input.execution_baseline}`)
  lines.push(`- continue_prompt_ref: 见 ## Continue Prompt 章节`)
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

function buildExecutionBaselineSection(input: WorktreeHandoffInput): string {
  const lines: string[] = []
  lines.push('## Execution Baseline')
  lines.push('')
  lines.push(`- 计划文档是本次执行的唯一实现基线，进入 B worktree 后不得重新审查、深化或转换本次需求、设计或计划。`)
  lines.push(`- ${input.execution_baseline}`)
  lines.push(`- 验证命令：${input.verification_requirements}`)
  lines.push(`- 实现完成后必须进行代码审查或记录无法审查原因，并调用 ae-gate workflow:work checkpoint:final。`)
  lines.push(`- 禁止回到 A worktree ${input.source_worktree} 写代码、配置、测试或文档；后续所有实现只在目标 B worktree 中进行。`)
  lines.push('')
  return lines.join('\n')
}

function buildContinuePromptSection(canonicalContinuePrompt: string): string {
  const lines: string[] = []
  lines.push('## Continue Prompt')
  lines.push('')
  lines.push(canonicalContinuePrompt)
  lines.push('')
  return lines.join('\n')
}

export function generateHandoffMarkdown(input: WorktreeHandoffInput): { markdown: string; canonicalContinuePrompt: string; handoffRelPath: string } | { error: string } {
  const validationError = validateInput(input)
  if (validationError) {
    return { error: validationError }
  }

  const timestamp = generateTimestamp()
  const worktreeName = input.branch.replace(/^feat\/|^fix\/|^refactor\/|^docs\/|^test\/|^chore\//, '')
  const handoffRelPath = `docs/ae/handoffs/${timestamp}-worktree-handoff.md`

  const canonicalContinuePrompt = buildCanonicalContinuePrompt(input, handoffRelPath)

  const sections: string[] = []
  sections.push(buildFrontmatter(input))
  sections.push('')
  sections.push(`# Worktree Handoff: ${worktreeName}`)
  sections.push('')
  sections.push(buildStartupProof(input, handoffRelPath))
  sections.push(buildMigratedArtifactsSection(input))
  sections.push(buildExecutionBaselineSection(input))
  sections.push(buildContinuePromptSection(canonicalContinuePrompt))

  return {
    markdown: sections.join('\n'),
    canonicalContinuePrompt,
    handoffRelPath,
  }
}

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
      canonicalContinuePrompt: result.canonicalContinuePrompt,
      userInstruction: buildUserInstruction(input, result.handoffRelPath),
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { error: `写入交接文件失败：${message}` }
  }
}
