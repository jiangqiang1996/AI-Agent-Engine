import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { runGate } from '../../src/services/gate-service.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-gate-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'docs', 'ae', 'brainstorms'), { recursive: true })
  mkdirSync(join(root, 'docs', 'ae', 'plans'), { recursive: true })
  return root
}

function writePlan(root: string): void {
  writeFileSync(join(root, 'docs', 'ae', 'plans', 'test-plan.md'), '# 测试计划\n', 'utf8')
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function runGateSync(root: string, input: Parameters<typeof runGate>[1]) {
  return Effect.runSync(runGate(root, input))
}

describe('门禁服务', () => {
  it('应该阻断缺少计划路径的实现前门禁', () => {
    const root = createRepoRoot()

    const result = runGateSync(root, {
      workflow: 'lfg',
      checkpoint: 'before_work',
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('缺少计划路径，无法证明执行前已完成计划阶段。')
  })

  it('应该阻断缺少验证命令的最终门禁', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      reviewStatus: 'not_applicable',
      gitOperations: [],
      noCodeChangeReason: '仅更新流程规则，无运行时代码变更',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('缺少验证命令记录，不能证明没有漏验证。')
    expect(result.missingEvidence).toContain('验证命令记录')
    expect(result.nextSteps).toContain('补充本次实际运行的验证命令；没有可运行验证时，在最终交付中明确降级为未验证。')
  })

  it('应该阻断未授权 Git 写操作', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'not_applicable',
      gitOperations: ['git commit -m "test"'],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('检测到 Git 写操作记录，但缺少可引用的用户授权证据。')
    expect(result.evidenceSources.gitAuthorization).toBe('not_provided')
  })

  it('应该阻断仅凭工具输入声明的 Git 授权', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'not_applicable',
      gitOperations: ['git commit -m "test"'],
      userAuthorizedGitWrite: true,
      noCodeChangeReason: '测试场景',
      notes: '用户口头允许提交',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('user_authorized_git_write 仅是工具输入声明，当前门禁不能单独据此放行 Git 写操作。')
    expect(result.evidenceSources.gitAuthorization).toBe('tool_input_declared')
  })

  it('应该允许 ae:work 裸提示词在说明后通过最终门禁', () => {
    const root = createRepoRoot()

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      validationCommands: ['npm run typecheck'],
      reviewStatus: 'not_applicable',
      gitOperations: [],
      noCodeChangeReason: '简单规则更新，无需计划文档',
      notes: '裸提示词小任务',
      writeProof: false,
    })

    expect(result.status).toBe('pass')
    expect(result.warnings).toContain('本次 ae:work 未提供计划路径；仅适用于简单裸提示词或已在 notes 中说明的任务。')
    expect(result.warnings).toContain('validation_commands 当前只记录代理声明的命令列表；除非附带可引用执行结果，否则不能单独证明验证已成功执行。')
    expect(result.evidenceSources.validation).toBe('tool_input_declared')
    expect(result.evidenceSources.workExecution).toBe('tool_input_declared')
  })

  it('应该为通过的最终门禁写入证明文件', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'lfg',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run typecheck', 'npm run test'],
      reviewStatus: 'passed',
      gitOperations: [],
      noCodeChangeReason: '测试用例中无真实代码变更',
    })

    expect(result.status).toBe('pass')
    expect(result.proofPath).toMatch(/^docs\/ae\/gates\//)
    expect(result.proofPath ? existsSync(join(root, result.proofPath)) : false).toBe(true)

    const proof = JSON.parse(readFileSync(join(root, result.proofPath!), 'utf8')) as {
      summary?: string
      missingEvidence?: string[]
      nextSteps?: string[]
      evidenceSources?: Record<string, string>
    }

    expect(proof.summary).toContain('门禁通过')
    expect(proof.missingEvidence).toEqual([])
    expect(proof.nextSteps).toEqual([])
    expect(proof.evidenceSources).toMatchObject({
      validation: 'tool_input_declared',
      gitAuthorization: 'not_provided',
      workExecution: 'tool_input_declared',
    })
  })

  it('应该阻断进入审查前缺少验证命令的 LFG 门禁', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'lfg',
      checkpoint: 'before_review',
      planPath: 'docs/ae/plans/test-plan.md',
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('进入代码审查前缺少验证命令记录，不能证明实现已验证。')
    expect(result.summary).toContain('门禁阻断')
  })

  it('应该阻断仓库外计划路径', () => {
    const root = createRepoRoot()

    const result = runGateSync(root, {
      workflow: 'lfg',
      checkpoint: 'before_work',
      planPath: '../outside-plan.md',
    })

    expect(result.status).toBe('block')
    expect(result.blockers.join('\n')).toContain('路径必须是仓库相对路径且位于当前工作区内')
    expect(result.blockers.join('\n')).not.toContain(root)
    expect(result.missingEvidence).toContain('有效的计划文档路径')
  })

  it('应该阻断空验证命令', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['   '],
      reviewStatus: 'not_applicable',
      gitOperations: [],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('缺少验证命令记录，不能证明没有漏验证。')
  })

  it('应该阻断 ae:work 失败审查状态', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'failed',
      gitOperations: [],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('ae:work 最终门禁检测到审查失败，不能交付。')
    expect(result.evidenceSources.review).toBe('tool_input_declared')
  })

  it('应该识别更多 Git 写操作变体', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'not_applicable',
      gitOperations: ['git -C . clean -fd'],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('block')
    expect(result.blockers).toContain('检测到 Git 写操作记录，但缺少可引用的用户授权证据。')
  })

  it('应该在无代码变更但有说明时保留声明证据来源', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run typecheck'],
      reviewStatus: 'not_applicable',
      gitOperations: [],
      noCodeChangeReason: '仅更新文档约束',
      writeProof: false,
    })

    expect(result.status).toBe('pass')
    expect(result.evidenceSources.workExecution).toBe('tool_input_declared')
    expect(result.warnings).toContain('no_code_change_reason 属于声明证据；它可以解释为何没有代码变更，但不能替代可观察的实现或验证结果。')
  })

  it('应该在未提供浏览器测试状态时标记为未提供证据', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'not_applicable',
      gitOperations: [],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('pass')
    expect(result.evidence.browserTestStatus).toBe('not_applicable')
    expect(result.evidenceSources.browserTest).toBe('not_provided')
  })

  it('应该在显式提供浏览器测试状态时标记为声明证据', () => {
    const root = createRepoRoot()
    writePlan(root)

    const result = runGateSync(root, {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'docs/ae/plans/test-plan.md',
      validationCommands: ['npm run test'],
      reviewStatus: 'not_applicable',
      browserTestStatus: 'passed',
      gitOperations: [],
      noCodeChangeReason: '测试场景',
      writeProof: false,
    })

    expect(result.status).toBe('pass')
    expect(result.evidenceSources.browserTest).toBe('tool_input_declared')
  })
})
