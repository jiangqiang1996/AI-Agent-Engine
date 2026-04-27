import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { runGate } from './gate-service.js'

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
    expect(result.blockers).toContain('检测到 Git 写操作记录，但未声明用户已授权。')
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
    expect(result.blockers).toContain('检测到 Git 写操作记录，但未声明用户已授权。')
  })
})
