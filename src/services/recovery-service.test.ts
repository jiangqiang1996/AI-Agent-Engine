import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { createRuntimeAssetManifestFromRoot } from './runtime-asset-manifest.js'
import { resolveRecovery } from './recovery-service.js'

describe('recovery-service', () => {
  it('应该在没有产物时回退到上游阶段', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-empty-'))
    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'lfg')

    expect(result.resolution).toBe('needs-upstream')
    expect(result.fallbackSkill).toBe('ae:brainstorm')
  })

  it('应该在存在多个候选时要求用户选择', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-many-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'a.md'), '---\ntitle: A\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: one\n---\nA')
    writeFileSync(join(root, 'docs', 'plans', 'b.md'), '---\ntitle: B\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: two\n---\nB')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')
    expect(result.resolution).toBe('needs-selection')
    expect(result.candidates).toHaveLength(2)
  })

  it('应该在上游指纹不匹配时阻断恢复', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-mismatch-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\ntitle: Plan\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: old\n---\nPlan')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'new',
    })

    expect(result.resolution).toBe('invalid-artifact')
  })

  it('应该把空产物视为异常', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-empty-body-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\noriginFingerprint: one\n---\n')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')
    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('产物为空')
  })

  it('应该在高优先级旧产物失配时回退到匹配的上游计划', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-fallback-upstream-'))
    mkdirSync(join(root, '.context', 'ae', 'work'), { recursive: true })
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, '.context', 'ae', 'work', 'run.md'), '---\nstatus: completed\noriginFingerprint: old\ntype: work\n---\nwork')
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\ntitle: Plan\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: new\n---\nplan')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'new',
    })

    expect(result.resolution).toBe('resolved')
    expect(result.artifactType).toBe('plan')
  })

  it('应该忽略已被 supersede 的损坏 work 产物并回退到有效计划', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-superseded-invalid-'))
    mkdirSync(join(root, '.context', 'ae', 'work'), { recursive: true })
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(
      join(root, '.context', 'ae', 'work', 'run.md'),
      '---\ntype: work\nstatus: completed\nsupersededBy: newer.md\n---\n',
    )
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\ntitle: Plan\ntype: feat\nstatus: active\ndate: 2026-04-18\n---\nplan')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.artifactType).toBe('plan')
  })

  it('应该忽略上游指纹不匹配的损坏 work 产物并回退到匹配计划', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-mismatch-invalid-work-'))
    mkdirSync(join(root, '.context', 'ae', 'work'), { recursive: true })
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(
      join(root, '.context', 'ae', 'work', 'run.md'),
      '---\ntype: work\nstatus: completed\noriginFingerprint: old\n---\n',
    )
    writeFileSync(
      join(root, 'docs', 'plans', 'plan.md'),
      '---\ntitle: Plan\ntype: feat\nstatus: active\ndate: 2026-04-18\noriginFingerprint: new\n---\nplan',
    )

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'new',
    })

    expect(result.resolution).toBe('resolved')
    expect(result.artifactType).toBe('plan')
  })

  it('应该把缺失关键 frontmatter 的计划视为无效产物', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-recovery-invalid-frontmatter-'))
    mkdirSync(join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(join(root, 'docs', 'plans', 'plan.md'), '---\nfoo: bar\n---\nplan')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')
    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('frontmatter 无效')
  })
})
