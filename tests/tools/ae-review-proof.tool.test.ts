import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { aeReviewProofTool } from '../../src/tools/ae-review-proof.tool.js'
import { hashReviewOutput } from '../../src/services/gate-service.js'

const tempRoots: string[] = []

function createSourceReviewOutput(evidence: { worktree: string; branch: string; head: string; statusSummary: string }): string {
  const normalizedWorktree = evidence.worktree.replaceAll('\\', '/')
  return JSON.stringify({
    reviewer: 'correctness',
    reviewStatus: 'passed',
    worktree: process.platform === 'win32' ? normalizedWorktree.toLowerCase() : normalizedWorktree,
    branch: evidence.branch,
    head: evidence.head,
    statusSummary: evidence.statusSummary,
    findings: [],
  }, null, 2)
}

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-review-proof-'))
  tempRoots.push(root)
  execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: root, stdio: 'ignore' })
  writeFileSync(join(root, 'README.md'), '# test\n', 'utf8')
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' })
  return root
}

function getGitFingerprint(root: string): { branch: string; head: string; statusSummary: string } {
  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  return { branch, head, statusSummary: '' }
}

function createToolContext(root: string): Parameters<typeof aeReviewProofTool.execute>[1] {
  return {
    metadata: () => undefined,
    ask: () => Effect.succeed(undefined),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    messageID: 'message-1',
    agent: 'test-agent',
    abort: new AbortController().signal,
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-review-proof 工具', () => {
  it('应该写入 metadata 并返回可由门禁复验的结构化输出', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root))

    expect(typeof result).toBe('object')
    const output = (result as { output: string }).output
    const metadataPath = join(root, 'ae', 'reviews', 'review-1', 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.generatedBy).toBe('ae:review')
    expect(metadata.reviewRunIdOrMessageRef).toBe('review-1')
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
    expect(output).toBe(sourceReviewOutput)
  })

  it('应该拒绝包含路径分隔符的运行 ID', async () => {
    const root = createRepoRoot()

    const result = await aeReviewProofTool.execute({
      review_run_id: '../review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: '{}',
    }, createToolContext(root))

    expect(result).toBe('审查运行 ID 只能包含字母、数字、点、下划线和短横线，且不能是 . 或 ..。')
  })

  it('应该拒绝纯点段运行 ID', async () => {
    const root = createRepoRoot()

    const result = await aeReviewProofTool.execute({
      review_run_id: '..',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: '{}',
    }, createToolContext(root))

    expect(result).toBe('审查运行 ID 只能包含字母、数字、点、下划线和短横线，且不能是 . 或 ..。')
  })

  it('应该拒绝 passed 结论包含阻断级发现', async () => {
    const root = createRepoRoot()

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [{ severity: 'high', title: '高风险问题' }],
      source_review_output: '{}',
    }, createToolContext(root))

    expect(result).toBe('review_status 为 passed 时不能包含 P0/P1/P2/critical/high/medium 级别发现。')
  })

  it('应该拒绝缺少可解析指纹的 source_review_output', async () => {
    const root = createRepoRoot()

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: '{}',
    }, createToolContext(root))

    expect(result).toBe('source_review_output 必须包含与当前 worktree 指纹和 review_status 匹配的真实结构化审查输出。')
  })
})
