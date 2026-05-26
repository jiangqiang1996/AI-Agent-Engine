import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'
import { z } from 'zod'

import { AGENT, COMMAND, SKILL } from '../schemas/ae-asset-schema.js'
import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import { collectCurrentWorktreeFingerprint, hashReviewOutput, parseReviewOutputEvidence } from '../services/gate-service.js'

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
  AGENT.FEASIBILITY_REVIEWER,
  AGENT.MAINTAINABILITY_REVIEWER,
  AGENT.PATTERN_RECOGNITION_SPECIALIST,
  AGENT.PERFORMANCE_REVIEWER,
  AGENT.PREVIOUS_COMMENTS_REVIEWER,
  AGENT.PRODUCT_LENS_REVIEWER,
  AGENT.RELIABILITY_REVIEWER,
  AGENT.RESEARCH_REVIEWER,
  AGENT.SECURITY_REVIEWER,
  AGENT.STANDARDS_REVIEWER,
  AGENT.STEP_GRANULARITY_REVIEWER,
  AGENT.TEST_CASE_REVIEWER,
  AGENT.TESTING_REVIEWER,
])

const ReviewFindingSchema = z.object({
  severity: z.string().min(1).describe('发现严重级别，例如 P0/P1/P2/P3 或 high/medium/low'),
  title: z.string().min(1).describe('发现标题'),
  evidence: z.string().optional().describe('发现证据摘要'),
}).passthrough()

const BLOCKING_SEVERITY_PATTERN = /^(p0|p1|p2|critical|high|medium)$/i

function resolveWorktree(context: unknown): string {
  const worktree = (context as { worktree?: unknown }).worktree
  return typeof worktree === 'string' && worktree.length > 0 ? worktree : process.cwd()
}

function resolveSessionId(context: unknown): string | undefined {
  const sessionID = (context as { sessionID?: unknown }).sessionID
  if (typeof sessionID === 'string' && sessionID.length > 0) {
    return sessionID
  }

  const sessionId = (context as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

function hasBlockingFinding(findings: Array<z.infer<typeof ReviewFindingSchema>>): boolean {
  return findings.some((finding) => BLOCKING_SEVERITY_PATTERN.test(finding.severity))
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
    const isReviewTool = isTrustedReviewToolName(candidate)
    const isReviewSubagent = subagentTypes.some((subagentType) => typeof subagentType === 'string'
      && REVIEW_SUBAGENT_TYPES.has(subagentType))
    const content = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)

    return role === 'tool'
      && (id === sourceReviewRef || taskId === sourceReviewRef)
      && (isReviewTool || isReviewSubagent)
      && isSameTrustedReviewOutput(content, sourceReviewOutput)
  })
}

/**
 * 写入 ae:review 的结构化审查证明，供 ae-gate 绑定当前 worktree 指纹复验。
 */
export const aeReviewProofTool: ToolDefinition = tool({
  description: [
    '写入 ae:review 结构化审查证明。',
    '',
    '功能说明：',
    '- 在当前工作区写入 `ae/reviews/<run-id>/metadata.json`',
    '- 返回传入的真实审查输出，metadata 中记录该输出的 SHA-256，供 ae-gate 复验报告未被篡改',
    '',
    '适用场景：',
    '- ae:review 完成真实审查后生成可被 ae-gate 验证的 report_path 证据',
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
    source_review_output: z.string().min(1).describe('当前会话中真实 ae:review 或审查子代理输出的完整文本；必须包含可解析的状态、worktree、branch、HEAD 和 statusSummary'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: '写入 ae:review 审查证明...' })

    if (!REVIEW_RUN_ID_PATTERN.test(args.review_run_id) || args.review_run_id === '.' || args.review_run_id === '..') {
      return '审查运行 ID 只能包含字母、数字、点、下划线和短横线，且不能是 . 或 ..。'
    }

    if (args.review_status === 'passed' && hasBlockingFinding(args.findings)) {
      return 'review_status 为 passed 时不能包含 P0/P1/P2/critical/high/medium 级别发现。'
    }

    const worktree = resolveWorktree(ctx)
    const sessionId = resolveSessionId(ctx)
    if (!sessionId) {
      return '无法获取当前会话 ID，不能写入 ae:review 审查证明。请在支持 sessionID 的 opencode 运行时中重试。'
    }

    const fingerprint = collectCurrentWorktreeFingerprint(worktree)
    if (!fingerprint.available || !fingerprint.branch || !fingerprint.head || fingerprint.statusSummary === undefined) {
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
      reviewOutputHash,
    }
    const metadataPath = `${docsAePath(DOCS_AE_SUBDIRS.REVIEWS)}/${args.review_run_id}/metadata.json`

    if (typeof ctx.ask !== 'function') {
      return '当前环境没有 ask 能力，不能写入 ae:review 审查证明。请在支持文件写入授权的 opencode 运行时中重试。'
    }

    try {
      await Effect.runPromise(ctx.ask({
        permission: 'file',
        patterns: [metadataPath],
        always: [],
        metadata: {
          action: '写入 ae:review 审查证明',
          target: metadataPath,
        },
      }))
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
