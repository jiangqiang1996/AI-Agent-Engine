import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'
import { resolveRecovery } from '../../src/services/recovery-service.js'

describe('stage-handoff-matrix', () => {
  it('应该让 brainstorm 阶段保持在需求入口', () => {
    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(process.cwd()), 'brainstorm')
    expect(result.fallbackSkill).toBe('ae:brainstorm')
  })

  it('应该支持 plan-review 作为可恢复阶段', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-plan-review-handoff-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\ntitle: Plan Review\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: req-3\n---\nplan body')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'plan-review')
    expect(result.nextSkill).toBe('ae:plan-review')
  })

  it('应该让 lfg 无产物时回到 brainstorm', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-stage-handoff-empty-'))
    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'lfg')
    expect(result.fallbackSkill).toBe('ae:brainstorm')
  })
})
