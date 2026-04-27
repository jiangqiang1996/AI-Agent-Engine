import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveRecovery } from './recovery-service.js'
import { createRuntimeAssetManifestFromRoot } from './runtime-asset-manifest.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-recovery-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'docs', 'ae', 'brainstorms'), { recursive: true })
  mkdirSync(join(root, 'docs', 'ae', 'plans'), { recursive: true })
  mkdirSync(join(root, 'docs', 'ae', 'work'), { recursive: true })
  mkdirSync(join(root, 'docs', 'ae', 'review'), { recursive: true })
  return root
}

function writePlan(root: string, fileName: string, frontmatter: string): void {
  writeFileSync(
    join(root, 'docs', 'ae', 'plans', fileName),
    `---\n${frontmatter.trim()}\n---\n\n# 测试计划\n`,
    'utf8',
  )
}

function writeBrainstorm(root: string, fileName: string, frontmatter: string): void {
  writeFileSync(
    join(root, 'docs', 'ae', 'brainstorms', fileName),
    `---\n${frontmatter.trim()}\n---\n\n# 测试需求\n`,
    'utf8',
  )
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('recovery-service', () => {
  it('应该拒绝缺少 frontmatter type 的 plan 产物', () => {
    const root = createRepoRoot()
writePlan(root, 'missing-type.md', `
status: active
date: 2026-04-27
title: missing-type
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('frontmatter 无效')
  })

  it('应该拒绝 frontmatter type 与目录类型不一致的产物', () => {
    const root = createRepoRoot()
    writePlan(root, 'wrong-type.md', `
type: brainstorm
status: drafted
date: 2026-04-27
topic: source-topic
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('frontmatter 无效')
  })

  it('originFingerprint 不匹配时应该返回警告但不阻断恢复', () => {
    const root = createRepoRoot()
    writeBrainstorm(root, 'expected-source.md', `
type: brainstorm
status: drafted
date: 2026-04-27
topic: source-topic
`)
    writePlan(root, 'fingerprint-mismatch.md', `
type: plan
status: active
date: 2026-04-27
title: fingerprint-mismatch
origin: docs/ae/brainstorms/expected-source.md
originFingerprint: 2026-04-27-source-topic
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'expected-fingerprint',
    })

    expect(result.resolution).toBe('resolved')
    expect(result.path).toBe('docs/ae/plans/fingerprint-mismatch.md')
    expect(result.warnings?.[0]).toContain('originFingerprint 不匹配')
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该根据 origin 上游文档计算 originFingerprint 并返回不阻断警告', () => {
    const root = createRepoRoot()
    writeBrainstorm(root, 'source.md', `
type: brainstorm
status: drafted
date: 2026-04-27
topic: source-topic
`)
    writePlan(root, 'wrong-origin-fingerprint.md', `
type: plan
status: active
date: 2026-04-27
title: wrong-origin-fingerprint
origin: docs/ae/brainstorms/source.md
originFingerprint: wrong-fingerprint
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.path).toBe('docs/ae/plans/wrong-origin-fingerprint.md')
    expect(result.warnings?.[0]).toContain("期望 '2026-04-27-source-topic'")
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该支持根据上游 date 和 title 计算 originFingerprint', () => {
    const root = createRepoRoot()
    writePlan(root, 'source-plan.md', `
type: plan
status: active
date: 2026-04-27
title: Source Plan
`)
    writePlan(root, 'derived-plan.md', `
type: plan
status: active
date: 2026-04-28
title: derived-plan
origin: docs/ae/plans/source-plan.md
originFingerprint: 2026-04-27-source-plan
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('needs-selection')
    expect(result.candidates).toContain('docs/ae/plans/source-plan.md')
    expect(result.candidates).toContain('docs/ae/plans/derived-plan.md')
    expect(result.warnings).toBeUndefined()
  })

  it('读取缺失 origin 时 warning 不应该泄露仓库绝对路径', () => {
    const root = createRepoRoot()
    writePlan(root, 'missing-origin.md', `
type: plan
status: active
date: 2026-04-27
title: missing-origin
origin: docs/ae/brainstorms/missing.md
originFingerprint: 2026-04-27-missing
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.warnings?.[0]).toContain('文件不存在或不可读')
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该在过滤 supersededBy 前校验废弃产物 frontmatter', () => {
    const root = createRepoRoot()
    writePlan(root, 'invalid-superseded.md', `
type: plan
status: active
date: 2026-04-27
title: invalid-superseded
supersededBy: ../outside.md
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('frontmatter 无效')
  })
})
