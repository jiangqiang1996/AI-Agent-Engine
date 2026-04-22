import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

import { aeRecoveryTool } from './ae-recovery.tool.js'

function createToolContext(root: string) {
  return {
    sessionID: 'session',
    messageID: 'message',
    agent: 'ae:lfg',
    directory: root,
    worktree: root,
    abort: new AbortController().signal,
    metadata: () => undefined,
    ask: () => Effect.void,
  } as never
}

describe('ae-recovery.tool', () => {
  it('应该返回带 nextSkill 的 lfg 恢复结果', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-tool-lfg-'))
    const output = await aeRecoveryTool.execute(
      {
        phase: 'lfg',
      },
      createToolContext(root),
    )

    const parsed = JSON.parse(output as string) as { phase: string; nextSkill?: string }
    expect(parsed.phase).toBe('lfg')
    expect(typeof parsed.nextSkill).toBe('string')
  })

  it('应该接受 plan-review 作为恢复阶段', async () => {
    const output = await aeRecoveryTool.execute(
      {
        phase: 'plan-review',
      },
      createToolContext(process.cwd()),
    )

    const parsed = JSON.parse(output as string) as { phase: string }
    expect(parsed.phase).toBe('plan-review')
  })

  it('应该基于当前 worktree 恢复产物，而不是插件源码目录', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-tool-worktree-'))
    mkdirSync(join(root, 'docs', 'ae', 'plans'), { recursive: true })
    const planPath = join(root, 'docs', 'ae', 'plans', 'plan.md')
    writeFileSync(planPath, '---\ntitle: Plan\ntype: feat\nstatus: active\ndate: 2026-04-18\n---\nplan')

    const output = await aeRecoveryTool.execute(
      {
        phase: 'work',
      },
      createToolContext(root),
    )

    const parsed = JSON.parse(output as string) as { resolution: string; path?: string }
    expect(parsed.resolution).toBe('resolved')
    expect(parsed.path).toBe(planPath)
  })
})
