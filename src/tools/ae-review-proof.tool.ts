import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { z } from 'zod'

import { AGENT, COMMAND, SKILL } from '../schemas/ae-asset-schema.js'
import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { toPosixPath } from '../utils/path-utils.js'

const REVIEW_RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/

const REVIEW_SUBAGENT_TYPES: ReadonlySet<string> = new Set([
  AGENT.ADVERSARIAL_REVIEWER,
  AGENT.AGENT_NATIVE_REVIEWER,
  AGENT.API_CONTRACT_REVIEWER,
  AGENT.ARCHITECTURE_STRATEGIST,
  AGENT.COHERENCE_REVIEWER,
  AGENT.CORRECTNESS_REVIEWER,
  AGENT.DATA_MIGRATIONS_REVIEWER,
  AGENT.DESIGN_LENS_REVIEWER,
  AGENT.EVIDENCE_REVIEWER,
  AGENT.FEASIBILITY_REVIEWER,
  AGENT.GOAL_ALIGNMENT_REVIEWER,
  AGENT.MAINTAINABILITY_REVIEWER,
  AGENT.PERFORMANCE_REVIEWER,
  AGENT.PREVIOUS_COMMENTS_REVIEWER,
  AGENT.PRODUCT_LENS_REVIEWER,
  AGENT.PROTOTYPE_REVIEWER,
  AGENT.RELIABILITY_REVIEWER,
  AGENT.REQUIREMENTS_REVIEWER,
  AGENT.RESEARCH_REVIEWER,
  AGENT.REVIEW_DOMAIN,
  AGENT.SECURITY_REVIEWER,
  AGENT.STANDARDS_REVIEWER,
  AGENT.STEP_GRANULARITY_REVIEWER,
  AGENT.TEST_CASE_REVIEWER,
  AGENT.TESTING_REVIEWER,
  AGENT.TRACEABILITY_REVIEWER,
])

const ReviewFindingSchema = z.object({
  severity: z.string().min(1).describe('发现严重级别，例如 P0/P1/P2/P3 或 high/medium/low'),
  title: z.string().min(1).describe('发现标题'),
  evidence: z.string().optional().describe('发现证据摘要'),
}).passthrough()

const BLOCKING_SEVERITY_PATTERN = /^(p0|p1|p2|critical|high|medium)$/i
const HASH_ALGORITHM = 'sha256'

interface WorktreeFingerprint {
  worktreePath: string
  branch?: string
  head?: string
  statusSummary?: string
  available: boolean
  degraded?: boolean
  error?: string
}

interface ReviewOutputEvidence {
  status: 'passed' | 'failed'
  worktree?: string
  branch?: string
  head?: string
  statusSummary?: string
  hasBlockingFinding: boolean
}

function hasBlockingFinding(findings: Array<z.infer<typeof ReviewFindingSchema>>): boolean {
  return findings.some((finding) => BLOCKING_SEVERITY_PATTERN.test(finding.severity))
}

function normalizePathForEvidence(path: string): string {
  const normalized = toPosixPath(path)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function normalizeStatusSummaryForEvidence(statusSummary: string): string {
  return statusSummary
    .split('\n')
    .filter((line) => !line.startsWith('## '))
    .filter((line) => line.trim())
    .filter((line) => !isReviewRuntimePath(line.slice(3).trim()))
    .map((line) => line.trim())
    .join('\n')
}

function isReviewRuntimePath(filePath: string): boolean {
  const normalized = toPosixPath(filePath)
  return normalized.startsWith(`${docsAePath(DOCS_AE_SUBDIRS.EVIDENCE)}/`)
    || normalized.startsWith(`${docsAePath(DOCS_AE_SUBDIRS.REVIEWS)}/`)
    || normalized.startsWith(`${docsAePath(DOCS_AE_SUBDIRS.HANDOFFS)}/`)
    || normalized.startsWith('ae/screenshot/')
}

function normalizeReviewStatusSummary(statusSummary: string): string {
  const normalized = statusSummary.trim().toLowerCase()
  if (normalized === 'clean' || normalized === 'no changes' || normalized === 'no output') {
    return ''
  }
  return normalizeStatusSummaryForEvidence(statusSummary)
}

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 30_000,
  }).trim()
}

function parseBranchFromStatus(statusOutput: string): string | undefined {
  const branchLine = statusOutput.split('\n').find((line) => line.startsWith('## '))
  if (!branchLine) {
    return undefined
  }
  const branch = branchLine.slice(3).split('...')[0]?.trim()
  return branch && branch !== 'HEAD (no branch)' ? branch : undefined
}

function collectCurrentWorktreeFingerprint(repoRoot: string): WorktreeFingerprint {
  try {
    const worktreePath = normalizePathForEvidence(runGit(repoRoot, ['rev-parse', '--show-toplevel']))
    const head = runGit(repoRoot, ['rev-parse', 'HEAD'])
    const statusOutput = runGit(repoRoot, ['status', '--porcelain', '--branch'])
    const branch = parseBranchFromStatus(statusOutput) ?? runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])

    return {
      worktreePath,
      branch,
      head,
      statusSummary: normalizeStatusSummaryForEvidence(statusOutput),
      available: true,
      degraded: false,
    }
  } catch (error) {
    return {
      worktreePath: normalizePathForEvidence(repoRoot),
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function extractLabeledTextField(output: string, labels: string[]): string | undefined {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const labelPattern = escapedLabels.join('|')
  const match = output.match(new RegExp(
    `(?:^|\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?(?:${labelPattern})(?:\\*\\*)?\\s*[:：]\\s*(?:\\*\\*)?\\s*(.+)`,
    'i',
  ))
  return match?.[1]?.replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim()
}

function hasBlockingFindingInText(output: string): boolean {
  return /^\s*(?:#{1,6}\s*)?(?:(?:[-*]|\d+[.)])\s*)?(?:\*\*)?\[?(?:P[0-2]|critical|high|medium)\]?(?:\b|\s|[-—:：])/im.test(output)
}

function extractJsonObject(output: string): string | undefined {
  const taskResultMatch = /<task_result>\s*([\s\S]*?)\s*<\/task_result>/.exec(output)
  const candidate = taskResultMatch?.[1] ?? output
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return undefined
  }
  return candidate.slice(start, end + 1)
}

function hasBlockingFindingInUnknown(findings: unknown): boolean {
  if (!Array.isArray(findings)) {
    return false
  }

  return findings.some((finding) => {
    if (!finding || typeof finding !== 'object') {
      return false
    }
    const severity = (finding as { severity?: unknown }).severity
    return typeof severity === 'string' && BLOCKING_SEVERITY_PATTERN.test(severity)
  })
}

function parseReviewOutputEvidence(output: string): ReviewOutputEvidence | undefined {
  const jsonText = extractJsonObject(output)
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const rawStatus = parsed.reviewStatus ?? parsed.review_status ?? parsed.status ?? parsed.conclusion
      const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined
      if (normalizedStatus === 'passed' || normalizedStatus === 'pass'
        || normalizedStatus === 'failed' || normalizedStatus === 'fail') {
        return {
          status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
          worktree: typeof parsed.worktree === 'string' ? normalizePathForEvidence(parsed.worktree) : undefined,
          branch: typeof parsed.branch === 'string' ? parsed.branch : undefined,
          head: typeof parsed.head === 'string' ? parsed.head : typeof parsed.HEAD === 'string' ? parsed.HEAD : undefined,
          statusSummary: typeof parsed.statusSummary === 'string'
            ? normalizeReviewStatusSummary(parsed.statusSummary)
            : undefined,
          hasBlockingFinding: hasBlockingFindingInUnknown(parsed.findings),
        }
      }
    } catch {
      // ae:review 的最终输出可能是 Markdown/结构化文本；JSON 解析失败时继续按文本解析。
    }
  }

  const rawStatus = extractLabeledTextField(output, ['reviewStatus', 'review_status', 'Review Status', 'status', 'Status'])
  const normalizedStatus = rawStatus?.toLowerCase()
  if (normalizedStatus !== 'passed' && normalizedStatus !== 'pass'
    && normalizedStatus !== 'failed' && normalizedStatus !== 'fail') {
    return undefined
  }

  const worktree = extractLabeledTextField(output, ['worktree', 'Worktree'])
  const branch = extractLabeledTextField(output, ['branch', 'Branch'])
  const head = extractLabeledTextField(output, ['head', 'HEAD'])
  const statusSummary = extractLabeledTextField(output, ['statusSummary', 'Status Summary'])

  return {
    status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
    worktree: worktree ? normalizePathForEvidence(worktree) : undefined,
    branch,
    head,
    statusSummary: statusSummary === undefined ? undefined : normalizeReviewStatusSummary(statusSummary),
    hasBlockingFinding: hasBlockingFindingInText(output),
  }
}

export function hashReviewOutput(content: string): string {
  return createHash(HASH_ALGORITHM).update(content, 'utf8').digest('hex')
}

function extractHistoryText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(extractHistoryText).filter(Boolean).join('\n')
  }

  if (value && typeof value === 'object') {
    const candidate = value as { text?: unknown; content?: unknown; value?: unknown; output?: unknown }
    return extractHistoryText(candidate.text ?? candidate.content ?? candidate.value ?? candidate.output)
  }

  return ''
}

function extractTrustedReviewPayload(output: string): string {
  let payload = output
  while (true) {
    const openTag = '<task_result>'
    const closeTag = '</task_result>'
    const start = payload.indexOf(openTag)
    const end = payload.lastIndexOf(closeTag)
    if (start < 0 || end <= start) {
      return payload
    }
    const nextPayload = payload.slice(start + openTag.length, end).trim()
    if (!nextPayload || nextPayload === payload) {
      return payload
    }
    payload = nextPayload
  }
}

function isSameTrustedReviewOutput(historyOutput: string, sourceReviewOutput: string): boolean {
  return extractTrustedReviewPayload(historyOutput) === extractTrustedReviewPayload(sourceReviewOutput)
}

function isTrustedReviewToolName(candidate: {
  tool?: unknown
  name?: unknown
  toolName?: unknown
  command?: unknown
  message?: {
    tool?: unknown
    name?: unknown
    toolName?: unknown
    command?: unknown
  }
}): boolean {
  const explicitToolNames = [
    candidate.tool,
    candidate.toolName,
    candidate.command,
    candidate.message?.tool,
    candidate.message?.toolName,
    candidate.message?.command,
  ]
  const fallbackNames = [candidate.name, candidate.message?.name]
  const hasExplicitToolMarker = explicitToolNames.some((toolName) => typeof toolName === 'string')
  const toolNames = hasExplicitToolMarker ? explicitToolNames : fallbackNames

  return toolNames.some((toolName) => typeof toolName === 'string'
    && (toolName === SKILL.REVIEW || toolName === COMMAND.REVIEW))
}

function hasTrustedSourceReviewOutput(context: unknown, sourceReviewRef: string, sourceReviewOutput: string): boolean {
  const history = (context as { history?: unknown }).history
  if (!Array.isArray(history)) {
    return false
  }

  return history.some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false
    }

    const candidate = entry as {
      id?: unknown
      task_id?: unknown
      role?: unknown
      tool?: unknown
      name?: unknown
      toolName?: unknown
      command?: unknown
      subagent_type?: unknown
      content?: unknown
      text?: unknown
      message?: {
        id?: unknown
        task_id?: unknown
        role?: unknown
        tool?: unknown
        name?: unknown
        toolName?: unknown
        command?: unknown
        subagent_type?: unknown
        content?: unknown
        text?: unknown
      }
    }
    const role = candidate.role ?? candidate.message?.role
    const id = candidate.id ?? candidate.message?.id
    const taskId = candidate.task_id ?? candidate.message?.task_id
    const subagentTypes = [candidate.subagent_type, candidate.message?.subagent_type]
    const hasSubagentTypeMarker = subagentTypes.some((subagentType) => typeof subagentType === 'string')
    const isReviewTool = isTrustedReviewToolName(candidate)
    const isReviewSubagent = subagentTypes.some((subagentType) => typeof subagentType === 'string'
      && REVIEW_SUBAGENT_TYPES.has(subagentType))
    const content = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)

    return role === 'tool'
      && (id === sourceReviewRef || taskId === sourceReviewRef)
      && (hasSubagentTypeMarker ? isReviewSubagent : isReviewTool)
      && isSameTrustedReviewOutput(content, sourceReviewOutput)
  })
}

/** 写入 ae:review 的结构化审查证明。 */
export const aeReviewProofTool: ToolDefinition = tool({
  description: [
    '写入 ae:review 结构化审查证明。',
    '',
    '功能说明：',
    '- 在当前工作区写入 `ae/reviews/<run-id>/metadata.json`',
    '- 返回传入的真实审查输出，metadata 中记录该输出的 SHA-256，便于后续审计报告是否被篡改',
    '',
    '适用场景：',
    '- ae:review 完成真实审查后生成可审计的结构化报告元数据',
    '',
    '不适用场景：',
    '- 不替代真实代码或文档审查',
    '- 不采信普通 task 正文或手写 metadata 作为审查事实来源',
  ].join('\n'),
  args: {
    review_run_id: z.string().min(1).describe('审查运行 ID；只允许字母、数字、点、下划线和短横线'),
    source_review_ref: z.string().min(1).optional().describe('原始 ae:review 或审查子代理输出的消息 ID/task_id；用于跨会话复验时区分 proof run id 与审查来源'),
    review_status: z.enum(['passed', 'failed']).describe('审查结论；passed 表示无阻断发现，failed 表示存在阻断发现或审查失败'),
    summary: z.string().min(1).describe('审查结论摘要'),
    findings: z.array(ReviewFindingSchema).default([]).describe('审查发现列表；passed 时不得包含 P0/P1/P2/high/medium 级别发现'),
    targetCoverage: z.record(z.string(), z.unknown()).optional().describe('通用域混合审查的目标覆盖摘要；不参与 source_review_output 哈希，作为 metadata 可选审计字段写入'),
    source_review_output: z.string().min(1).describe('当前会话中真实 ae:review 或审查子代理输出的完整文本；必须包含可解析的状态、worktree、branch、HEAD 和 statusSummary；通用域（混合审查）输出还应包含 targetCoverage 摘要供审计'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: '写入 ae:review 审查证明...' })

    if (!REVIEW_RUN_ID_PATTERN.test(args.review_run_id) || args.review_run_id === '.' || args.review_run_id === '..') {
      return '审查运行 ID 只能包含字母、数字、点、下划线和短横线，且不能是 . 或 ..。'
    }

    if (args.review_status === 'passed' && hasBlockingFinding(args.findings)) {
      return 'review_status 为 passed 时不能包含 P0/P1/P2/critical/high/medium 级别发现。'
    }

    const worktree = ctx.worktree
    const sessionId = ctx.sessionID
    if (!sessionId) {
      return '无法获取当前会话 ID，不能写入 ae:review 审查证明。请在支持 sessionID 的 opencode 运行时中重试。'
    }

    const fingerprint = collectCurrentWorktreeFingerprint(worktree)
    if (!fingerprint.available || !fingerprint.branch || !fingerprint.head) {
      return `当前工作区指纹不可用，不能写入 ae:review 审查证明：${fingerprint.error ?? '未知错误'}`
    }

    if (fingerprint.degraded) {
      return '当前工作区指纹省略了未跟踪文件，不能写入 ae:review 审查证明。请清理或纳入未跟踪文件后重试。'
    }

    const trustedReviewPayload = extractTrustedReviewPayload(args.source_review_output)
    const parsedOutput = parseReviewOutputEvidence(trustedReviewPayload)
    if (!parsedOutput
      || parsedOutput.status !== args.review_status
      || parsedOutput.worktree !== fingerprint.worktreePath
      || parsedOutput.branch !== fingerprint.branch
      || parsedOutput.head !== fingerprint.head
      || parsedOutput.statusSummary !== fingerprint.statusSummary
      || (args.review_status === 'passed' && parsedOutput.hasBlockingFinding)) {
      return 'source_review_output 必须包含与当前 worktree 指纹和 review_status 匹配的真实结构化审查输出。'
    }

    const sourceReviewRef = args.source_review_ref ?? args.review_run_id
    if (!hasTrustedSourceReviewOutput(ctx, sourceReviewRef, args.source_review_output)) {
      return 'source_review_output 必须来自当前会话历史中匹配 source_review_ref 的真实 ae:review 或审查子代理输出。'
    }

    const reviewOutputHash = hashReviewOutput(trustedReviewPayload)
    const metadata = {
      generatedBy: SKILL.REVIEW,
      proofKind: 'ae-review-proof',
      reviewRunIdOrMessageRef: args.review_run_id,
      sourceReviewRef,
      sessionId,
      worktree: fingerprint.worktreePath,
      branch: fingerprint.branch,
      head: fingerprint.head,
      statusSummary: fingerprint.statusSummary,
      reviewStatus: args.review_status,
      hasBlockingFinding: parsedOutput.hasBlockingFinding,
      ...(args.targetCoverage ? { targetCoverage: args.targetCoverage } : {}),
      reviewOutputHash,
    }
    const metadataPath = `${docsAePath(DOCS_AE_SUBDIRS.REVIEWS)}/${args.review_run_id}/metadata.json`

    if (typeof ctx.ask !== 'function') {
      return '当前环境没有 ask 能力，不能写入 ae:review 审查证明。请在支持文件写入授权的 opencode 运行时中重试。'
    }

    try {
      await ctx.ask({
        permission: 'file',
        patterns: [metadataPath],
        always: [],
        metadata: {
          action: '写入 ae:review 审查证明',
          target: metadataPath,
        },
      })
    } catch (error) {
      const reason = error instanceof Error && error.message ? `：${error.message}` : ''
      return `写入 ae:review 审查证明未获得文件授权${reason}。请确认当前工作区允许写入 ${metadataPath} 后重试。`
    }

    try {
      mkdirSync(join(worktree, docsAePath(DOCS_AE_SUBDIRS.REVIEWS), args.review_run_id), { recursive: true })
      writeFileSync(join(worktree, metadataPath), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    } catch (error) {
      const reason = error instanceof Error && error.message ? `：${error.message}` : ''
      return `写入 ae:review 审查证明失败${reason}。请确认当前工作区允许写入 ${metadataPath} 后重试。`
    }

    return {
      output: trustedReviewPayload,
      metadata: {
        path: metadataPath,
        reviewRunIdOrMessageRef: args.review_run_id,
        sourceReviewRef,
        reviewOutputHash,
      },
    }
  },
})
