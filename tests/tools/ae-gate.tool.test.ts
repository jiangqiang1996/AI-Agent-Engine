import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { hashReviewOutput } from '../../src/services/gate-service.js'

const tempRoots: string[] = []
const REVIEW_OUTPUT = '<task_result>{"reviewer":"correctness","reviewStatus":"passed","findings":[]}</task_result>'
const SECURITY_REVIEW_OUTPUT = '<task_result>{"reviewStatus":"passed","findings":[]}</task_result>'

function createReviewOutput(evidence: { worktree: string; branch: string; head: string; statusSummary: string }): string {
  return `<task_result>${JSON.stringify({
    reviewer: 'correctness',
    reviewStatus: 'passed',
    worktree: normalizedEvidencePath(evidence.worktree),
    branch: evidence.branch,
    head: evidence.head,
    statusSummary: evidence.statusSummary,
    findings: [],
  })}</task_result>`
}

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-gate-tool-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'docs', 'ae', 'plans'), { recursive: true })
  writeFileSync(join(root, 'docs', 'ae', 'plans', 'test-plan.md'), '# 测试计划\n', 'utf8')
  return root
}

function initGitRepo(root: string): { branch: string; head: string; statusSummary: string } {
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' })
  writeFileSync(join(root, 'README.md'), '# test\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  return { branch, head, statusSummary: '' }
}

function normalizedEvidencePath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function writeReviewReport(
  root: string,
  evidence: {
    reviewRunIdOrMessageRef: string
    worktree: string
    branch: string
    head: string
    statusSummary: string
    reviewOutputHash?: string
  },
): void {
  const reviewOutputHash = evidence.reviewOutputHash ?? hashReviewOutput(createReviewOutput(evidence))
  mkdirSync(join(root, 'docs', 'ae', 'review', evidence.reviewRunIdOrMessageRef), { recursive: true })
  writeFileSync(join(root, 'docs', 'ae', 'review', evidence.reviewRunIdOrMessageRef, 'metadata.json'), `${JSON.stringify({
    generatedBy: 'ae:review',
    reviewRunIdOrMessageRef: evidence.reviewRunIdOrMessageRef,
    worktree: normalizedEvidencePath(evidence.worktree),
    branch: evidence.branch,
    head: evidence.head,
    statusSummary: evidence.statusSummary,
    reviewStatus: 'passed',
    reviewOutputHash,
  }, null, 2)}\n`, 'utf8')
}

interface GateToolDefinitionForTest {
  args: Record<string, unknown>
  execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
}

let cachedToolDefinition: GateToolDefinitionForTest | undefined

async function getToolDefinition(): Promise<GateToolDefinitionForTest> {
  if (cachedToolDefinition) {
    return cachedToolDefinition
  }

  const { aeGateTool } = await import('../../src/tools/ae-gate.tool.js')
  cachedToolDefinition = aeGateTool as unknown as GateToolDefinitionForTest
  return cachedToolDefinition
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-gate 工具', () => {
  it('应该暴露 worktree 和结构化证据参数', async () => {
    const tool = await getToolDefinition()

    expect(tool.args).toHaveProperty('git_operation_args')
    expect(tool.args).toHaveProperty('git_authorization_evidence')
    expect(tool.args).toHaveProperty('review_evidence')
    expect(tool.args).toHaveProperty('worktree_decision')
  })

  it('应该把 snake_case 参数映射到服务层 evidence 输出', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'not_applicable',
      git_operations: [],
      git_operation_args: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as {
      evidence: {
        gitOperationArgs: string[][]
        worktreeDecision: string
      }
    }

    expect(result.evidence.gitOperationArgs).toEqual([])
    expect(result.evidence.worktreeDecision).toBe('rejected')
  })

  it('应该映射结构化授权和审查证据字段', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const commandArgs = ['git', 'commit', '-m', 'test']
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'not_run',
      review_evidence: { type: 'not_run_reason', reason: '测试工具映射' },
      git_operation_args: [commandArgs],
      git_authorization_evidence: [{
        authorization_source: 'user_confirmation',
        authorization_summary: '用户授权执行 git commit',
        authorization_trust: 'verified',
        covered_command_args: commandArgs,
        source_session_id: 'test-session',
        operation_worktree: root,
        target_worktree: root,
        branch: 'master',
        head: 'HEAD',
        authorized_at_or_message_ref: 'message-1',
        final_command_args: commandArgs,
      }],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as {
      evidence: {
        gitAuthorizationEvidence: Array<{ authorizationSource: string; sourceSessionId: string }>
        reviewEvidence?: { type: string; reason?: string }
      }
    }

    expect(result.evidence.gitAuthorizationEvidence[0]).toMatchObject({
      authorizationSource: 'user_confirmation',
      sourceSessionId: 'test-session',
    })
    expect(result.evidence.reviewEvidence).toMatchObject({ type: 'not_run_reason', reason: '测试工具映射' })
  })

  it('应该从上下文历史收集可信用户授权引用', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const commandArgs = ['git', 'commit', '-m', 'test']
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'not_run',
      review_evidence: { type: 'not_run_reason', reason: '测试工具映射' },
      git_authorization_evidence: [{
        authorization_source: 'user_confirmation',
        authorization_summary: '用户授权执行 git commit',
        authorization_trust: 'verified',
        covered_command_args: commandArgs,
        source_session_id: 'test-session',
        operation_worktree: root,
        target_worktree: root,
        branch: 'master',
        head: 'HEAD',
        authorized_at_or_message_ref: 'message-1',
        final_command_args: commandArgs,
      }],
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [
        { id: 'message-1', role: 'user', content: '我授权执行 git commit -m test' },
        { id: 'assistant-1', role: 'assistant', content: '准备执行' },
      ],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { evidenceSources: { gitAuthorization: string } }

    expect(result.evidenceSources.gitAuthorization).toBe('user_confirmation')
  })

  it('不应该把无关用户消息视为可信授权引用', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const commandArgs = ['git', 'commit', '-m', 'test']
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'not_run',
      review_evidence: { type: 'not_run_reason', reason: '测试工具映射' },
      git_authorization_evidence: [{
        authorization_source: 'user_confirmation',
        authorization_summary: '用户授权执行 git commit',
        authorization_trust: 'verified',
        covered_command_args: commandArgs,
        source_session_id: 'test-session',
        operation_worktree: root,
        target_worktree: root,
        branch: 'master',
        head: 'HEAD',
        authorized_at_or_message_ref: 'message-1',
        final_command_args: commandArgs,
      }],
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'message-1', role: 'user', content: '请继续修复这个问题' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { evidenceSources: { gitAuthorization: string } }

    expect(result.evidenceSources.gitAuthorization).toBe('tool_input_declared')
  })

  it('不应该把否定用户消息视为可信授权引用', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const commandArgs = ['git', 'commit', '-m', 'test']
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'not_run',
      review_evidence: { type: 'not_run_reason', reason: '测试工具映射' },
      git_authorization_evidence: [{
        authorization_source: 'user_confirmation',
        authorization_summary: '用户授权执行 git commit',
        authorization_trust: 'verified',
        covered_command_args: commandArgs,
        source_session_id: 'test-session',
        operation_worktree: root,
        target_worktree: root,
        branch: 'master',
        head: 'HEAD',
        authorized_at_or_message_ref: 'message-1',
        final_command_args: commandArgs,
      }],
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'message-1', role: 'user', content: '不要执行 git commit -m test，我没有授权' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { evidenceSources: { gitAuthorization: string } }

    expect(result.evidenceSources.gitAuthorization).toBe('tool_input_declared')
  })

  it('应该映射 report_path 审查证据字段', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/reviews/review.md',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: 'main',
        head: 'HEAD',
        status_summary: ' M src/index.ts',
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as {
      evidence: { reviewEvidence?: { type: string; reviewTrust?: string; reviewRunIdOrMessageRef?: string; statusSummary?: string; path?: string } }
    }

    expect(result.evidence.reviewEvidence).toMatchObject({
      type: 'report_path',
      reviewTrust: 'verified',
      reviewRunIdOrMessageRef: 'review-1',
      statusSummary: ' M src/index.ts',
      path: 'docs/ae/reviews/review.md',
    })
  })

  it('应该映射 tool_output 和 declared 审查证据字段', async () => {
    const root = createRepoRoot()
    const tool = await getToolDefinition()
    const baseArgs = {
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }
    const ctx = {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      abort: new AbortController().signal,
    }

    const toolOutput = JSON.parse(await tool.execute({
      ...baseArgs,
      review_evidence: {
        type: 'tool_output',
        review_trust: 'verified',
        review_run_id_or_message_ref: 'review-2',
        worktree: root,
        branch: 'main',
        head: 'HEAD',
        status_summary: '',
        summary: '审查通过',
      },
    }, ctx)) as { evidence: { reviewEvidence?: { type: string; reviewRunIdOrMessageRef?: string; summary?: string } } }
    const declared = JSON.parse(await tool.execute({
      ...baseArgs,
      review_evidence: { type: 'declared', summary: '仅声明', review_trust: 'declaration_only' },
    }, ctx)) as { evidence: { reviewEvidence?: { type: string; reviewTrust?: string; summary?: string } } }

    expect(toolOutput.evidence.reviewEvidence).toMatchObject({
      type: 'tool_output',
      reviewRunIdOrMessageRef: 'review-2',
      summary: '审查通过',
    })
    expect(declared.evidence.reviewEvidence).toMatchObject({
      type: 'declared',
      reviewTrust: 'declaration_only',
      summary: '仅声明',
    })
  })

  it('应该通过当前会话可信审查子代理的 tool_output 证据', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'tool_output',
        review_trust: 'verified',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
        summary: '审查通过',
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'task', subagent_type: 'correctness-reviewer', content: reviewOutput }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[]; evidenceSources: { review: string } }

    expect(result.status).toBe('pass')
    expect(result.blockers).toEqual([])
    expect(result.evidenceSources.review).toBe('observable_workspace')
  })

  it('应该通过结构化审查报告元数据放行有效报告路径', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    writeReviewReport(root, { reviewRunIdOrMessageRef: 'review-1', worktree: root, ...fingerprint })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', subagent_type: 'correctness-reviewer', content: reviewOutput }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('pass')
    expect(result.blockers).toEqual([])
  })

  it('应该采信 task 工具中明确审查子代理的结构化来源', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    writeReviewReport(root, {
      reviewRunIdOrMessageRef: 'review-1',
      worktree: root,
      ...fingerprint,
      reviewOutputHash: hashReviewOutput(reviewOutput),
    })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'task', subagent_type: 'security-reviewer', content: reviewOutput }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('pass')
    expect(result.blockers).toEqual([])
  })

  it('应该采信其他内置审查子代理的结构化来源', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    const reviewerTypes = [
      'adversarial-reviewer',
      'coherence-reviewer',
      'performance-reviewer',
      'reliability-reviewer',
      'standards-reviewer',
      'api-contract-reviewer',
      'data-migrations-reviewer',
      'agent-native-reviewer',
      'design-lens-reviewer',
      'feasibility-reviewer',
      'pattern-recognition-specialist',
      'previous-comments-reviewer',
      'product-lens-reviewer',
      'research-reviewer',
      'step-granularity-reviewer',
      'test-case-reviewer',
    ]
    const tool = await getToolDefinition()

    for (const reviewerType of reviewerTypes) {
      const reviewId = `review-${reviewerType}`
      writeReviewReport(root, {
        reviewRunIdOrMessageRef: reviewId,
        worktree: root,
        ...fingerprint,
        reviewOutputHash: hashReviewOutput(reviewOutput),
      })

      const output = await tool.execute({
        workflow: 'work',
        checkpoint: 'final',
        plan_path: 'docs/ae/plans/test-plan.md',
        validation_commands: ['npm run test'],
        review_status: 'passed',
        review_evidence: {
          type: 'report_path',
          review_trust: 'verified',
          path: `docs/ae/review/${reviewId}/metadata.json`,
          review_run_id_or_message_ref: reviewId,
          worktree: root,
          branch: fingerprint.branch,
          head: fingerprint.head,
          status_summary: fingerprint.statusSummary,
        },
        git_operations: [],
        worktree_decision: 'rejected',
        no_code_change_reason: '测试工具映射',
        write_proof: false,
      }, {
        metadata: () => undefined,
        worktree: root,
        directory: root,
        sessionID: 'test-session',
        history: [{ id: reviewId, role: 'tool', tool: 'task', subagent_type: reviewerType, content: reviewOutput }],
        abort: new AbortController().signal,
      })
      const result = JSON.parse(output) as { status: string; blockers: string[] }

      expect(result.status).toBe('pass')
      expect(result.blockers).toEqual([])
    }
  })

  it('应该采信 task_id 精确匹配的审查子代理来源', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    writeReviewReport(root, {
      reviewRunIdOrMessageRef: 'review-1',
      worktree: root,
      ...fingerprint,
      reviewOutputHash: hashReviewOutput(reviewOutput),
    })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'tool-call-1', task_id: 'review-1', role: 'tool', tool: 'task', subagent_type: 'security-reviewer', content: reviewOutput }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('pass')
    expect(result.blockers).toEqual([])
  })

  it('不应该把缺少结构化元数据的审查路径视为可信审查证据', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'tool-1', role: 'tool', content: 'ae:review 已生成审查运行 review-1，结论 passed' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('审查报告路径无效或不存在，不能作为可验证审查来源证据。')
  })

  it('不应该把非审查工具输出文本视为可信审查引用', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    writeReviewReport(root, { reviewRunIdOrMessageRef: 'review-1', worktree: root, ...fingerprint })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'read', content: 'ae:review 已生成审查运行 review-1，结论 passed' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('审查报告内容未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
  })

  it('不应该把普通 task 工具输出视为可信审查引用', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    writeReviewReport(root, { reviewRunIdOrMessageRef: 'review-1', worktree: root, ...fingerprint })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'task', content: '普通任务输出' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('审查报告内容未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
  })

  it('不应该把 task 工具的 name 字段视为审查子代理来源', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    writeReviewReport(root, { reviewRunIdOrMessageRef: 'review-1', worktree: root, ...fingerprint })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'task', name: 'security-reviewer', content: '普通任务输出' }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('审查报告内容未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
  })

  it('不应该把 name 字段伪装成 ae:review 工具来源', async () => {
    const root = createRepoRoot()
    const fingerprint = initGitRepo(root)
    const reviewOutput = createReviewOutput({ worktree: root, ...fingerprint })
    writeReviewReport(root, {
      reviewRunIdOrMessageRef: 'review-1',
      worktree: root,
      ...fingerprint,
      reviewOutputHash: hashReviewOutput(reviewOutput),
    })
    const tool = await getToolDefinition()

    const output = await tool.execute({
      workflow: 'work',
      checkpoint: 'final',
      plan_path: 'docs/ae/plans/test-plan.md',
      validation_commands: ['npm run test'],
      review_status: 'passed',
      review_evidence: {
        type: 'report_path',
        review_trust: 'verified',
        path: 'docs/ae/review/review-1/metadata.json',
        review_run_id_or_message_ref: 'review-1',
        worktree: root,
        branch: fingerprint.branch,
        head: fingerprint.head,
        status_summary: fingerprint.statusSummary,
      },
      git_operations: [],
      worktree_decision: 'rejected',
      no_code_change_reason: '测试工具映射',
      write_proof: false,
    }, {
      metadata: () => undefined,
      worktree: root,
      directory: root,
      sessionID: 'test-session',
      history: [{ id: 'review-1', role: 'tool', tool: 'task', name: 'ae:review', content: reviewOutput }],
      abort: new AbortController().signal,
    })
    const result = JSON.parse(output) as { status: string; blockers: string[] }

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('审查报告内容未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
  })
})
