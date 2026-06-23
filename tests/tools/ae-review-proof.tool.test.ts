import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { aeReviewProofTool, hashReviewOutput } from '../../src/tools/ae-review-proof.tool.js'

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
  const tempRoot = mkdtempSync(join(tmpdir(), 'ae-review-proof-'))
  execFileSync('git', ['init'], { cwd: tempRoot, stdio: 'ignore' })
  // 使用 git 解析的 toplevel 作为仓库根路径，确保与工具内部 collectCurrentWorktreeFingerprint
  // 通过 `git rev-parse --show-toplevel` 获取的路径一致；避免 Windows 短路径(如 ADMINI~1)与
  // 长路径不匹配导致指纹校验失败
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: tempRoot, encoding: 'utf8' }).trim()
  tempRoots.push(tempRoot)
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

function createToolContext(
  root: string,
  sourceReviewOutput?: string,
  sourceReviewRef = 'review-1',
): Parameters<typeof aeReviewProofTool.execute>[1] {
  return {
    metadata: () => undefined,
    ask: () => Promise.resolve(),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    messageID: 'message-1',
    agent: 'test-agent',
    history: sourceReviewOutput ? [{
      id: sourceReviewRef,
      role: 'tool',
      tool: 'ae:review',
      content: sourceReviewOutput,
    }] : [],
    abort: new AbortController().signal,
  } as Parameters<typeof aeReviewProofTool.execute>[1]
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (process.platform === 'win32' && (code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY')) {
        continue
      }
      throw error
    }
  }
})

describe('ae-review-proof 工具', () => {
  it('应该写入 metadata 并返回结构化审查证明输出', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-1'))

    expect(typeof result).toBe('object')
    const output = (result as { output: string }).output
    const metadataPath = join(root, 'ae', 'reviews', 'review-1', 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.generatedBy).toBe('ae:review')
    expect(metadata.proofKind).toBe('ae-review-proof')
    expect(metadata.reviewRunIdOrMessageRef).toBe('review-1')
    expect(metadata.sourceReviewRef).toBe('review-1')
    expect(metadata.hasBlockingFinding).toBe(false)
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
    expect(output).toBe(sourceReviewOutput)
  })

  it('应该把可选 targetCoverage 写入 metadata 且不影响输出哈希', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const targetCoverage = { requirements: { status: 'covered', reviewers: ['requirements-reviewer'] } }

    await aeReviewProofTool.execute({
      review_run_id: 'review-target-coverage',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      targetCoverage,
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-target-coverage'))

    const metadataPath = join(root, 'ae', 'reviews', 'review-target-coverage', 'metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.targetCoverage).toEqual(targetCoverage)
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
  })

  it('应该记录独立的原始审查来源 ref', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-run-1',
      source_review_ref: 'task-review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'task-review-1'))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'proof-run-1', 'metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.reviewRunIdOrMessageRef).toBe('proof-run-1')
    expect(metadata.sourceReviewRef).toBe('task-review-1')
    expect((result as { metadata?: Record<string, unknown> }).metadata?.sourceReviewRef).toBe('task-review-1')
  })

  it('应该接受 ae:review 命令触发的 task 子代理输出包裹', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const wrappedReviewOutput = `task_id: task-review-1 (for resuming to continue this task if needed)\n\n<task_result>\n${sourceReviewOutput}\n</task_result>`

    const ctx = {
      ...createToolContext(root),
      history: [{
        task_id: 'task-review-1',
        role: 'tool',
        command: 'ae:review',
        subagent_type: 'correctness-reviewer',
        content: wrappedReviewOutput,
      }],
    } as Parameters<typeof aeReviewProofTool.execute>[1]

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-run-1',
      source_review_ref: 'task-review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, ctx)

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'proof-run-1', 'metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.sourceReviewRef).toBe('task-review-1')
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
    expect((result as { output: string }).output).toBe(sourceReviewOutput)
  })

  it('应该接受仅通过 name 标记的 ae:review 工具输出', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const ctx = {
      ...createToolContext(root),
      history: [{
        id: 'review-name-1',
        role: 'tool',
        name: 'ae:review',
        content: sourceReviewOutput,
      }],
    } as Parameters<typeof aeReviewProofTool.execute>[1]

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-name-1',
      source_review_ref: 'review-name-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, ctx)

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'proof-name-1', 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
  })

  it('应该接受审查子代理常见的 review_status 和 HEAD 字段', async () => {
    const root = createRepoRoot()
    const fingerprint = getGitFingerprint(root)
    const sourceReviewOutput = JSON.stringify({
      review_status: 'passed',
      worktree: process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root,
      branch: fingerprint.branch,
      HEAD: fingerprint.head,
      statusSummary: fingerprint.statusSummary,
      findings: [],
      summary: '审查通过',
    }, null, 2)

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-subagent-style',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-subagent-style'))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'review-subagent-style', 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
  })

  it('应该接受 ae:review Markdown 结构化文本输出', async () => {
    const root = createRepoRoot()
    const fingerprint = getGitFingerprint(root)
    const worktree = process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root
    const sourceReviewOutput = [
      '## 审查结果',
      '- **Review Status:** failed',
      `- **Worktree:** ${worktree}`,
      `- **Branch:** ${fingerprint.branch}`,
      `- **HEAD:** ${fingerprint.head}`,
      '- **Status Summary:** clean',
      'Mode: autofix',
      'Domain: document',
      '',
      '### P1 -- 应该修复',
      '- P1 非代码产物验证与门禁模型缺口。Evidence: 待定问题仍将验证与门禁证据推迟到规划。',
    ].join('\n')

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-markdown-output',
      review_status: 'failed',
      summary: '审查失败',
      findings: [{ severity: 'P1', title: '非代码产物验证与门禁模型缺口' }],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-markdown-output'))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'review-markdown-output', 'metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.reviewStatus).toBe('failed')
    expect(metadata.hasBlockingFinding).toBe(true)
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
  })

  it.each(['clean', 'no changes', 'no output'])('应该将 JSON 输出中的 %s statusSummary 视为干净工作区', async (statusSummary) => {
    const root = createRepoRoot()
    const fingerprint = getGitFingerprint(root)
    const sourceReviewOutput = JSON.stringify({
      reviewStatus: 'passed',
      worktree: process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root,
      branch: fingerprint.branch,
      head: fingerprint.head,
      statusSummary,
      findings: [],
      summary: '审查通过',
    }, null, 2)

    const result = await aeReviewProofTool.execute({
      review_run_id: `review-json-${statusSummary.replaceAll(' ', '-')}-status`,
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, `review-json-${statusSummary.replaceAll(' ', '-')}-status`))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', `review-json-${statusSummary.replaceAll(' ', '-')}-status`, 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
  })

  it('应该拒绝 passed Markdown 输出中的标题式阻断发现', async () => {
    const root = createRepoRoot()
    const fingerprint = getGitFingerprint(root)
    const worktree = process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root
    const sourceReviewOutput = [
      '## 审查结果',
      'Review Status: passed',
      `Worktree: ${worktree}`,
      `Branch: ${fingerprint.branch}`,
      `HEAD: ${fingerprint.head}`,
      'Status Summary: clean',
      '',
      '### P1 -- 应该修复',
      '| Severity | Finding |',
      '| --- | --- |',
      '| P1 | 阻断问题 |',
    ].join('\n')

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-markdown-passed-with-p1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-markdown-passed-with-p1'))

    expect(result).toBe('source_review_output 必须包含与当前 worktree 指纹和 review_status 匹配的真实结构化审查输出。')
  })

  it('应该接受带 porcelain 前导空格的 statusSummary', async () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'README.md'), '# changed\n', 'utf8')
    const fingerprint = getGitFingerprint(root)
    const sourceReviewOutput = JSON.stringify({
      reviewStatus: 'passed',
      worktree: process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root,
      branch: fingerprint.branch,
      head: fingerprint.head,
      statusSummary: ' M README.md',
      findings: [],
      summary: '审查通过',
    }, null, 2)

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-spaced-status',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-spaced-status'))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'review-spaced-status', 'metadata.json')
    expect(existsSync(metadataPath)).toBe(true)
  })

  it('应该允许 failed 结论携带阻断级发现并写入 metadata', async () => {
    const root = createRepoRoot()
    const fingerprint = getGitFingerprint(root)
    const sourceReviewOutput = JSON.stringify({
      reviewStatus: 'failed',
      worktree: process.platform === 'win32' ? root.replaceAll('\\', '/').toLowerCase() : root,
      branch: fingerprint.branch,
      head: fingerprint.head,
      statusSummary: fingerprint.statusSummary,
      findings: [{ severity: 'high', title: '高风险问题' }],
      summary: '审查失败',
    }, null, 2)

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-failed',
      review_status: 'failed',
      summary: '审查失败',
      findings: [{ severity: 'high', title: '高风险问题' }],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'review-failed'))

    expect(typeof result).toBe('object')
    const metadataPath = join(root, 'ae', 'reviews', 'review-failed', 'metadata.json')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>

    expect(metadata.reviewStatus).toBe('failed')
    expect(metadata.reviewOutputHash).toBe(hashReviewOutput(sourceReviewOutput))
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

  it('应该拒绝不在当前会话历史中的 source_review_output', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-missing-history',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root))

    expect(result).toBe('source_review_output 必须来自当前会话历史中匹配 source_review_ref 的真实 ae:review 或审查子代理输出。')
  })

  it('应该拒绝 source_review_ref 与历史审查输出不匹配', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-run-2',
      source_review_ref: 'task-review-2',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, createToolContext(root, sourceReviewOutput, 'task-review-other'))

    expect(result).toBe('source_review_output 必须来自当前会话历史中匹配 source_review_ref 的真实 ae:review 或审查子代理输出。')
  })

  it('应该拒绝已删除审查子代理的历史输出', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const ctx = {
      ...createToolContext(root),
      history: [{
        task_id: 'task-review-deleted-agent',
        role: 'tool',
        command: 'ae:review',
        subagent_type: 'pattern-recognition-specialist',
        content: sourceReviewOutput,
      }],
    } as Parameters<typeof aeReviewProofTool.execute>[1]

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-deleted-agent',
      source_review_ref: 'task-review-deleted-agent',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, ctx)

    expect(result).toBe('source_review_output 必须来自当前会话历史中匹配 source_review_ref 的真实 ae:review 或审查子代理输出。')
  })

  it('应该接受 review-domain 退化路径的历史输出', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const ctx = {
      ...createToolContext(root),
      history: [{
        task_id: 'task-review-domain',
        role: 'tool',
        command: 'ae:review',
        subagent_type: 'review-domain',
        content: sourceReviewOutput,
      }],
    } as Parameters<typeof aeReviewProofTool.execute>[1]

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-review-domain',
      source_review_ref: 'task-review-domain',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, ctx)

    expect(typeof result).toBe('object')
  })

  it('应该拒绝只在历史包裹外层出现的 source_review_output', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const wrappedReviewOutput = `${sourceReviewOutput}\n<task_result>{"reviewStatus":"failed"}</task_result>`
    const ctx = {
      ...createToolContext(root),
      history: [{ task_id: 'task-review-1', role: 'tool', command: 'ae:review', content: wrappedReviewOutput }],
    } as Parameters<typeof aeReviewProofTool.execute>[1]

    const result = await aeReviewProofTool.execute({
      review_run_id: 'proof-run-outer-only',
      source_review_ref: 'task-review-1',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, ctx)

    expect(result).toBe('source_review_output 必须来自当前会话历史中匹配 source_review_ref 的真实 ae:review 或审查子代理输出。')
  })

  it('ask 缺失时应该返回明确授权错误', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })
    const context = createToolContext(root, sourceReviewOutput, 'review-no-ask')
    delete (context as { ask?: unknown }).ask

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-no-ask',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, context)

    expect(result).toContain('当前环境没有 ask 能力')
  })

  it('ask 拒绝时应该返回授权失败原因', async () => {
    const root = createRepoRoot()
    const sourceReviewOutput = createSourceReviewOutput({ worktree: root, ...getGitFingerprint(root) })

    const result = await aeReviewProofTool.execute({
      review_run_id: 'review-denied',
      review_status: 'passed',
      summary: '审查通过',
      findings: [],
      source_review_output: sourceReviewOutput,
    }, {
      ...createToolContext(root, sourceReviewOutput, 'review-denied'),
      ask: () => Promise.reject(new Error('denied')),
    })

    expect(result).toContain('未获得文件授权：denied')
  })
})
