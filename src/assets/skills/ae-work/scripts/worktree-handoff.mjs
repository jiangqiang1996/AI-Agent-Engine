/**
 * Worktree 交接文件生成脚本
 *
 * 仅用于 ae:work 中 A→B worktree 转移时按固定模板生成结构化交接 Markdown 文件。
 *
 * 用法：
 *   echo '{"source_session_id":"...","source_worktree":"...","target_worktree":"...",...}' | node worktree-handoff.mjs
 *
 * 输出：JSON 到 stdout，包含 filePath 和 userInstruction
 *       失败时输出 {"error": "..."}
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'

// ── 常量 ──

const DOCS_AE_ROOT = 'ae'
const HANDOFFS_DIR = `${DOCS_AE_ROOT}/handoffs`
const BRANCH_PREFIX_PATTERN = /^(feat|fix|refactor|docs|test|chore)\//

// ── 校验 ──

function validateInput(input) {
  if (!input.source_session_id?.trim()) return 'source_session_id 不能为空。'
  if (input.source_session_id.trim() === 'unavailable' && !input.session_evidence?.trim()) {
    return 'source_session_id 为 unavailable 时，session_evidence 必须提供可引用的消息或会话证据。'
  }
  if (!input.source_worktree?.trim()) return 'source_worktree 不能为空。'
  if (!input.target_worktree?.trim()) return 'target_worktree 不能为空。'
  if (!input.branch?.trim()) return 'branch 不能为空。'
  if (!input.head?.trim()) return 'head 不能为空。'
  if (!input.head_message?.trim()) return 'head_message 不能为空。'
  if (!input.authorization_source?.trim()) return 'authorization_source 不能为空。'
  if (!input.authorization_scope?.trim()) return 'authorization_scope 不能为空。'
  if (!input.covered_command_args?.trim()) return 'covered_command_args 不能为空。'
  if (!input.final_command_args?.trim()) return 'final_command_args 不能为空。'
  if (!input.creation_result?.trim()) return 'creation_result 不能为空。'
  if (!input.design_path?.trim() && !input.task_brief?.trim()) {
    return 'design_path 和 task_brief 至少传入一个：有设计文档时传 design_path；无设计文档时必须通过 task_brief 将任务详情写入交接文件，确保 B worktree 无需读取 A worktree 文件即可执行。'
  }
  if (!input.execution_baseline?.trim()) return 'execution_baseline 不能为空。'
  if (!input.verification_requirements?.trim()) return 'verification_requirements 不能为空。'
  return null
}

// ── Markdown 构建 ──

function generateTimestamp(now) {
  const pad = (n) => n.toString().padStart(2, '0')
  const ms = now.getMilliseconds().toString().padStart(3, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ms}`
}

function buildFrontmatter(input, now) {
  const timestamp = now.toISOString()
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

function buildMigratedArtifactLines(input, indent, taskBriefLabel) {
  const lines = []
  if (input.requirements_path?.trim()) {
    lines.push(`${indent}- requirements: \`${input.requirements_path}\``)
  }
  if (input.design_path?.trim()) {
    lines.push(`${indent}- design: \`${input.design_path}\``)
  }
  if (input.task_brief?.trim() && !input.design_path?.trim()) {
    lines.push(`${indent}- task_brief: ${taskBriefLabel}`)
  }
  if (input.ae_config_path?.trim()) {
    lines.push(`${indent}- ae_config: \`${input.ae_config_path}\``)
  }
  return lines
}

function buildStartupProof(input, handoffRelPath) {
  const lines = []
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
  lines.push(...buildMigratedArtifactLines(input, '  ', '内联于交接文件（无 design_path 时作为执行输入）'))
  lines.push(`- execution_baseline: ${input.execution_baseline}`)
  lines.push(`- resume_entrypoint: ae:work ${handoffRelPath}`)
  lines.push('')
  return lines.join('\n')
}

function buildMigratedArtifacts(input) {
  return buildMigratedArtifactLines(input, '', '内联于交接文件 Task Brief 章节').join('\n')
}

function buildMigratedArtifactsSection(input) {
  return ['## Migrated Artifacts', '', buildMigratedArtifacts(input), ''].join('\n')
}

function buildTaskBriefSection(input) {
  if (!input.task_brief?.trim()) return null
  return [
    '## Task Brief',
    '',
    '> 当 design_path 未迁移或不存在时，以下任务详情是 B worktree 执行的唯一输入。',
    '> B worktree 无需读取 A worktree 的任何文件，直接依据以下内容执行。',
    '',
    input.task_brief,
    '',
  ].join('\n')
}

function buildExecutionBaselineSection(input, handoffRelPath) {
  const lines = []
  lines.push('## Execution Baseline')
  lines.push('')
  if (input.design_path?.trim()) {
    lines.push(`- 设计文档是本次执行的实现基线；进入 B worktree 后不得重新审查、深化或转换本次需求或设计。`)
  } else {
    lines.push(`- task_brief 是本次执行的实现基线；进入 B worktree 后不得重新审查、深化或转换本次任务详情。`)
  }
  lines.push(`- ${input.execution_baseline}`)
  lines.push(`- 验证命令：${input.verification_requirements}`)
  lines.push(`- 续执行入口：在目标 B worktree 中调用 ae:work，并把 ${handoffRelPath} 作为唯一任务输入。`)
  lines.push(`- 实现完成后必须进行代码审查或记录无法审查原因，并在最终回复中列出验证、审查和 Git 操作状态。`)
  lines.push(`- 禁止回到 A worktree ${input.source_worktree} 写代码、配置、测试或文档；后续所有实现只在目标 B worktree 中进行。`)
  lines.push('')
  return lines.join('\n')
}

function buildUserInstruction(input, handoffRelPath) {
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

// ── 核心逻辑 ──

function generateHandoffMarkdown(input) {
  const validationError = validateInput(input)
  if (validationError) {
    return { error: validationError }
  }

  const now = new Date()
  const timestamp = generateTimestamp(now)
  const worktreeName = input.branch.replace(BRANCH_PREFIX_PATTERN, '')
  const handoffRelPath = `${HANDOFFS_DIR}/${timestamp}-worktree-handoff.md`

  const sections = []
  sections.push(buildFrontmatter(input, now))
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

async function writeHandoffFile(input) {
  const result = generateHandoffMarkdown(input)
  if ('error' in result) {
    return { error: result.error }
  }

  const absPath = join(input.target_worktree, result.handoffRelPath)
  const dir = dirname(absPath)

  try {
    await mkdir(dir, { recursive: true })
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

// ── 入口 ──

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }

  let input
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    console.error('用法: echo \'{"source_session_id":"...","source_worktree":"...","target_worktree":"...",...}\' | node worktree-handoff.mjs')
    process.exit(1)
  }

  if (typeof input !== 'object' || input === null) {
    console.error('输入必须是 JSON 对象')
    process.exit(1)
  }

  const result = await writeHandoffFile(input)

  if ('error' in result) {
    console.log(JSON.stringify({ error: result.error }, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({
    filePath: result.filePath,
    userInstruction: result.userInstruction,
  }, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
