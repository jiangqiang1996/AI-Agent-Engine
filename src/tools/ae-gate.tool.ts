import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { runGate, type ReviewEvidence, type ValidationCommandResult } from '../services/gate-service.js'
import { AGENT, COMMAND, SKILL } from '../schemas/ae-asset-schema.js'

const REVIEW_SUBAGENT_TYPES: ReadonlySet<string> = new Set([
  AGENT.ADVERSARIAL_REVIEWER,
  AGENT.AGENT_NATIVE_REVIEWER,
  AGENT.API_CONTRACT_REVIEWER,
  AGENT.ARCHITECTURE_STRATEGIST,
  AGENT.COHERENCE_REVIEWER,
  AGENT.CORRECTNESS_REVIEWER,
  AGENT.DATA_MIGRATIONS_REVIEWER,
  AGENT.DOC_EQUIVALENCE_REVIEWER,
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

type ToolReviewEvidenceInput =
  | {
      type: 'tool_output'
      review_trust: 'verified' | 'declaration_only'
      review_run_id_or_message_ref: string
      worktree: string
      branch: string
      head: string
      status_summary: string
      summary: string
    }
  | {
      type: 'report_path'
      review_trust: 'verified' | 'declaration_only'
      path: string
      review_run_id_or_message_ref: string
      source_review_ref?: string
      worktree: string
      branch: string
      head: string
      status_summary: string
    }
  | { type: 'not_run_reason'; reason: string }
  | { type: 'declared'; summary: string; review_trust: 'declaration_only' }

function mapReviewEvidence(evidence: ToolReviewEvidenceInput | undefined): ReviewEvidence | undefined {
  if (!evidence) {
    return undefined
  }

  if (evidence.type === 'not_run_reason') {
    return evidence
  }

  if (evidence.type === 'declared') {
    return { type: 'declared', summary: evidence.summary, reviewTrust: evidence.review_trust }
  }

  if (evidence.type === 'tool_output') {
    return {
      type: 'tool_output',
      reviewTrust: evidence.review_trust,
      reviewRunIdOrMessageRef: evidence.review_run_id_or_message_ref,
      worktree: evidence.worktree,
      branch: evidence.branch,
      head: evidence.head,
      statusSummary: evidence.status_summary,
      summary: evidence.summary,
    }
  }

  return {
    type: 'report_path',
    reviewTrust: evidence.review_trust,
    path: evidence.path,
    reviewRunIdOrMessageRef: evidence.review_run_id_or_message_ref,
    sourceReviewRef: evidence.source_review_ref,
    worktree: evidence.worktree,
    branch: evidence.branch,
    head: evidence.head,
    statusSummary: evidence.status_summary,
  }
}

function mapValidationResults(results: Array<{
  command: string
  exit_code: number
  output: string
  executed_at?: string
}> | undefined): ValidationCommandResult[] | undefined {
  return results?.map((result) => ({
    command: result.command,
    exitCode: result.exit_code,
    output: result.output,
    executedAt: result.executed_at,
  }))
}

function collectTrustedAuthorizationRefs(
  context: Record<string, unknown>,
  evidence: Array<{ authorized_at_or_message_ref: string; final_command_args: string[] }> | undefined,
): string[] {
  const history = (context as { history?: unknown }).history
  if (!Array.isArray(history) || !evidence || evidence.length === 0) {
    return []
  }

  return history.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }

    const candidate = entry as {
      id?: unknown
      role?: unknown
      content?: unknown
      text?: unknown
      message?: { id?: unknown; role?: unknown; content?: unknown; text?: unknown }
    }
    const role = candidate.role ?? candidate.message?.role
    const id = candidate.id ?? candidate.message?.id
    const text = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)
    const matchingEvidence = typeof id === 'string'
      ? evidence.find((item) => item.authorized_at_or_message_ref === id)
      : undefined
    if (role !== 'user' || typeof id !== 'string' || !matchingEvidence) {
      return []
    }

    return isExplicitGitAuthorizationText(text, matchingEvidence.final_command_args) ? [id] : []
  })
}

function collectTrustedReviewRefs(context: Record<string, unknown>, evidence: ToolReviewEvidenceInput | undefined): string[] {
  return Object.keys(collectTrustedReviewOutputs(context, evidence))
}

function collectTrustedReviewOutputs(
  context: Record<string, unknown>,
  evidence: ToolReviewEvidenceInput | undefined,
): Record<string, string> {
  if (!evidence || (evidence.type !== 'report_path' && evidence.type !== 'tool_output')) {
    return {}
  }

  const history = (context as { history?: unknown }).history
  if (!Array.isArray(history)) {
    return {}
  }

  const trustedOutputs: Record<string, string> = {}
  for (const entry of history) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const candidate = entry as {
      id?: unknown
      task_id?: unknown
      role?: unknown
      tool?: unknown
      name?: unknown
      toolName?: unknown
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
        subagent_type?: unknown
        content?: unknown
        text?: unknown
      }
    }
    const role = candidate.role ?? candidate.message?.role
    const id = candidate.id ?? candidate.message?.id
    const taskId = candidate.task_id ?? candidate.message?.task_id
    const reviewRef = evidence.type === 'report_path'
      ? evidence.source_review_ref ?? evidence.review_run_id_or_message_ref
      : evidence.review_run_id_or_message_ref
    const content = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)
    const toolNames = [
      candidate.tool,
      candidate.toolName,
      candidate.message?.tool,
      candidate.message?.toolName,
    ]
    const subagentTypes = [
      candidate.subagent_type,
      candidate.message?.subagent_type,
    ]
    const isReviewTool = toolNames.some((toolName) => typeof toolName === 'string'
      && (toolName === SKILL.REVIEW || toolName === COMMAND.REVIEW))
    const isReviewSubagent = subagentTypes.some((subagentType) => typeof subagentType === 'string'
      && REVIEW_SUBAGENT_TYPES.has(subagentType))
    const isReviewSource = isReviewTool || isReviewSubagent
    const isMatchingReviewSource = isReviewSource && (id === reviewRef || taskId === reviewRef)
    if (role === 'tool' && isMatchingReviewSource && isReviewSource && content) {
      trustedOutputs[reviewRef] = content
    }
  }

  return trustedOutputs
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

function isExplicitGitAuthorizationText(text: string, commandArgs: string[]): boolean {
  if (!text) {
    return false
  }

  if (/(不|别|勿|禁止|拒绝|没有|未|不要|不允许|不同意|no|not|don't|do not|without|deny|denied|reject)/i.test(text)) {
    return false
  }

  const commandText = commandArgs.join(' ')
  return /\bgit\b/i.test(text)
    && /(授权|同意|允许|确认执行|authorize|authorized|approve|approved|permission)/i.test(text)
    && text.includes(commandText)
}

function shouldWriteProof(args: { checkpoint?: unknown; write_proof?: unknown }): boolean {
  return typeof args.write_proof === 'boolean' ? args.write_proof : args.checkpoint === 'final'
}

export const aeGateTool: ToolDefinition = tool({
  description: [
    '执行 AE 自诊断与硬门禁检查。',
    '',
    '功能说明：',
    '- 为 `/ae-lfg` 和 `ae:work` 检查阶段是否跳过、验证是否记录、Git 写操作是否授权',
    '- 收集需求文档、计划文档、工作区变更、验证命令、审查状态等证据',
    '- 在最终门禁写入 `ae/gates/` 证明文件',
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
    handoff_path: tool.schema
      .string()
      .optional()
      .describe('B worktree 续执行交接文件路径，使用仓库相对路径，仅用于证明无 plan_path 时的执行基线'),
    validation_commands: tool.schema.array(tool.schema.string()).optional().describe('已实际运行的验证命令列表'),
    validation_results: tool.schema.array(tool.schema.object({
      command: tool.schema.string().describe('已实际执行的验证命令，需与 validation_commands 中的命令一致'),
      exit_code: tool.schema.number().int().describe('验证命令退出码，0 表示通过'),
      output: tool.schema.string().describe('验证命令输出摘要或完整输出，用于证明命令确实执行'),
      executed_at: tool.schema.string().optional().describe('验证命令执行时间或可引用时间戳'),
    })).optional().describe('验证命令真实执行结果记录；用于写入交付证据，但工具入参自报不会升级为可信 tool_output 证据'),
    review_status: tool.schema
      .enum(['passed', 'failed', 'not_run', 'not_applicable'])
      .optional()
      .describe('代码或文档审查状态'),
    browser_test_status: tool.schema
      .enum(['passed', 'failed', 'not_run', 'not_applicable'])
      .optional()
      .describe('浏览器验收状态'),
    git_operations: tool.schema.array(tool.schema.string()).optional().describe('本次会话执行过的 Git 写操作记录'),
    git_operation_args: tool.schema
      .array(tool.schema.array(tool.schema.string()))
      .optional()
      .describe('本次会话执行过的 Git 命令参数数组；Git 写操作应优先使用该结构化字段'),
    git_authorization_evidence: tool.schema
      .array(tool.schema.object({
        authorization_source: tool.schema.string().describe('授权来源，如用户消息引用或工具 ask 结果'),
        authorization_summary: tool.schema.string().describe('授权内容摘要'),
        authorization_trust: tool.schema.enum(['verified', 'declaration_only']).describe('授权证据可信度'),
        covered_command_args: tool.schema.array(tool.schema.string()).describe('授权覆盖的 Git 命令参数数组'),
        source_session_id: tool.schema.string().describe('授权发生的会话 ID'),
        operation_worktree: tool.schema.string().describe('执行 Git 操作的 worktree'),
        target_worktree: tool.schema.string().describe('Git 操作目标 worktree'),
        branch: tool.schema.string().describe('授权覆盖的当前或目标 worktree 分支；worktree add 场景填写目标 worktree 的分支'),
        head: tool.schema.string().describe('授权覆盖的当前或目标 worktree HEAD；worktree add 场景填写目标 worktree 的 HEAD'),
        authorized_at_or_message_ref: tool.schema.string().describe('授权时间或用户消息引用'),
        final_command_args: tool.schema.array(tool.schema.string()).describe('最终实际执行的 Git 命令参数数组'),
      }))
      .optional()
      .describe('结构化 Git 写操作授权证据；不能用 user_authorized_git_write 替代'),
    review_evidence: tool.schema
      .discriminatedUnion('type', [
        tool.schema.object({
          type: tool.schema.literal('tool_output').describe('审查工具输出证据'),
          review_trust: tool.schema.enum(['verified', 'declaration_only']).describe('审查证据可信度'),
          review_run_id_or_message_ref: tool.schema.string().describe('审查运行 ID 或消息引用'),
          worktree: tool.schema.string().describe('审查发生的 worktree'),
          branch: tool.schema.string().describe('审查发生的分支'),
          head: tool.schema.string().describe('审查覆盖的 HEAD'),
          status_summary: tool.schema.string().describe('审查覆盖的工作区状态摘要'),
          summary: tool.schema.string().describe('审查结论摘要'),
        }),
        tool.schema.object({
          type: tool.schema.literal('report_path').describe('审查报告路径证据'),
          review_trust: tool.schema.enum(['verified', 'declaration_only']).describe('审查证据可信度'),
          path: tool.schema.string().describe('审查元数据路径，格式为 ae/reviews/<run-id>/metadata.json'),
          review_run_id_or_message_ref: tool.schema.string().describe('审查运行 ID 或消息引用'),
          source_review_ref: tool.schema.string().optional().describe('原始 ae:review 或审查子代理输出的消息 ID/task_id；省略时兼容使用 review_run_id_or_message_ref'),
          worktree: tool.schema.string().describe('审查发生的 worktree'),
          branch: tool.schema.string().describe('审查发生的分支'),
          head: tool.schema.string().describe('审查覆盖的 HEAD'),
          status_summary: tool.schema.string().describe('审查覆盖的工作区状态摘要'),
        }),
        tool.schema.object({
          type: tool.schema.literal('not_run_reason').describe('审查未运行原因证据'),
          reason: tool.schema.string().describe('未运行审查的原因'),
        }),
        tool.schema.object({
          type: tool.schema.literal('declared').describe('仅声明的审查证据'),
          summary: tool.schema.string().describe('仅声明的审查摘要'),
          review_trust: tool.schema.literal('declaration_only').describe('仅声明可信度'),
        }),
      ])
      .optional()
      .describe('审查来源证据，passed/failed 必须绑定当前 worktree 指纹'),
    worktree_decision: tool.schema
      .enum(['created', 'rejected', 'cancelled', 'transferred', 'not_applicable'])
      .optional()
      .describe('本次 ae:work 的 worktree 决策'),
    user_authorized_git_write: tool.schema
      .boolean()
      .optional()
      .describe('兼容旧字段：用户是否声明授权 Git 写操作，不能替代结构化授权证据'),
    no_code_change_reason: tool.schema.string().optional().describe('没有代码变更时的原因'),
    notes: tool.schema.string().optional().describe('补充说明、跳过原因或风险记录'),
    write_proof: tool.schema.boolean().optional().describe('是否写入门禁证明文件，final 默认写入'),
  },
  async execute(args, context) {
    context.metadata({ title: `AE 门禁检查: ${args.workflow}/${args.checkpoint}` })

    if (shouldWriteProof(args)) {
      if (typeof context.ask !== 'function') {
        return '当前环境没有 ask 能力，不能写入 ae/gates/ 门禁证明。请在支持文件写入授权的 opencode 运行时中重试，或显式设置 write_proof: false 仅执行检查。'
      }

      try {
        await Effect.runPromise(context.ask({
          permission: 'file',
          patterns: ['ae/gates/*.json'],
          always: [],
          metadata: {
            action: '写入 AE 门禁证明',
            target: 'ae/gates/*.json',
          },
        }))
      } catch (error) {
        const reason = error instanceof Error && error.message ? `：${error.message}` : ''
        return `写入 ae/gates/ 门禁证明未获得文件授权${reason}。请确认当前工作区允许写入 ae/gates/*.json 后重试，或显式设置 write_proof: false 仅执行检查。`
      }
    }

    return Effect.runPromise(
      runGate(context.worktree, {
        workflow: args.workflow,
        checkpoint: args.checkpoint,
        requirementsPath: args.requirements_path,
        planPath: args.plan_path,
        handoffPath: args.handoff_path,
        validationCommands: args.validation_commands,
        validationResults: mapValidationResults(args.validation_results),
        reviewStatus: args.review_status,
        browserTestStatus: args.browser_test_status,
        gitOperations: args.git_operations,
        gitOperationArgs: args.git_operation_args,
        gitAuthorizationEvidence: args.git_authorization_evidence?.map((evidence) => ({
          authorizationSource: evidence.authorization_source,
          authorizationSummary: evidence.authorization_summary,
          authorizationTrust: evidence.authorization_trust,
          coveredCommandArgs: evidence.covered_command_args,
          sourceSessionId: evidence.source_session_id,
          operationWorktree: evidence.operation_worktree,
          targetWorktree: evidence.target_worktree,
          branch: evidence.branch,
          head: evidence.head,
          authorizedAtOrMessageRef: evidence.authorized_at_or_message_ref,
          finalCommandArgs: evidence.final_command_args,
        })),
        reviewEvidence: mapReviewEvidence(args.review_evidence),
        worktreeDecision: args.worktree_decision,
        currentSessionId: context.sessionID,
        trustedAuthorizationRefs: collectTrustedAuthorizationRefs(
          context as Record<string, unknown>,
          args.git_authorization_evidence,
        ),
        trustedReviewRefs: collectTrustedReviewRefs(context as Record<string, unknown>, args.review_evidence),
        trustedReviewOutputs: collectTrustedReviewOutputs(
          context as Record<string, unknown>,
          args.review_evidence,
        ),
        userAuthorizedGitWrite: args.user_authorized_git_write,
        noCodeChangeReason: args.no_code_change_reason,
        notes: args.notes,
        writeProof: args.write_proof,
      }).pipe(
        Effect.map((result) => JSON.stringify(result, null, 2)),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return Effect.succeed(`❌ AE 门禁检查失败：${message}`)
        }),
      ),
    )
  },
})
