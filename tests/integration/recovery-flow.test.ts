import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'
import { resolveRecovery } from '../../src/services/recovery-service.js'

describe('recovery-flow', () => {
  it('应该在没有产物时回退到 ae:brainstorm', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-flow-empty-'))
    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'lfg')
    expect(result.fallbackSkill).toBe('ae:brainstorm')
  })

  it('应该在单一候选时自动恢复', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-flow-one-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'one.md'), '---\ntitle: One\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: req-1\n---\nplan')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'req-1',
    })

    expect(result.resolution).toBe('resolved')
  })

  it('应该在仅有 requirements 文档时把 lfg 恢复到文档审查阶段', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-flow-requirements-only-'))
    mkdirSync(join(root, 'docs', 'brainstorms'), { recursive: true })
    writeFileSync(join(root, 'docs', 'brainstorms', 'req.md'), '---\ndate: 2026-04-18\ntopic: ae-phase-one\noriginFingerprint: req-1\n---\nrequirements')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'lfg')
    expect(result.resolution).toBe('resolved')
    expect(result.resumePhase).toBe('document-review')
    expect(result.nextSkill).toBe('ae:document-review')
  })

  it('应该优先从 .context/ae/work 恢复工作阶段', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-flow-work-context-'))
    mkdirSync(join(root, '.context', 'ae', 'work'), { recursive: true })
    writeFileSync(join(root, '.context', 'ae', 'work', 'run.md'), '---\ntype: work\nstatus: completed\noriginFingerprint: req-2\n---\nwork run')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'req-2',
    })

    expect(result.resolution).toBe('resolved')
    expect(result.artifactType).toBe('work')
    expect(result.nextSkill).toBe('ae:work')
  })
})
