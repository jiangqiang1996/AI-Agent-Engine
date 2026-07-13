import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveRecovery } from '../../src/services/recovery-service.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'
import { SKILL } from '../../src/schemas/ae-asset-schema.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-recovery-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'ae', 'prds'), { recursive: true })
  mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
  mkdirSync(join(root, 'ae', 'work'), { recursive: true })
  mkdirSync(join(root, 'ae', 'review'), { recursive: true })
  return root
}

function writeDesign(root: string, fileName: string, frontmatter: string): void {
  writeFileSync(
    join(root, 'ae', 'designs', fileName),
    `---\n${frontmatter.trim()}\n---\n\n# 测试设计\n`,
    'utf8',
  )
}


function writePrd(root: string, fileName: string, frontmatter: string): void {
  writeFileSync(
    join(root, 'ae', 'prds', fileName),
    `---\n${frontmatter.trim()}\n---\n\n# 测试需求\n`,
    'utf8',
  )
}

function writeLegacyDesign(root: string, fileName: string): void {
  mkdirSync(join(root, 'docs', 'ae', 'designs'), { recursive: true })
  writeFileSync(
    join(root, 'docs', 'ae', 'designs', fileName),
    '---\ntype: design\nstatus: active\ndate: 2026-04-27\ntitle: legacy-design\n---\n\n# 旧设计\n',
    'utf8',
  )
}

function writeLegacyPrd(root: string, fileName: string): void {
  mkdirSync(join(root, 'docs', 'ae', 'prds'), { recursive: true })
  writeFileSync(
    join(root, 'docs', 'ae', 'prds', fileName),
    '---\ntype: prd\nstatus: drafted\ndate: 2026-04-27\ntopic: legacy-prd\n---\n\n# 旧需求\n',
    'utf8',
  )
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('recovery-service', () => {
  it('应该拒绝缺少 frontmatter type 的 design 产物', () => {
    const root = createRepoRoot()
writeDesign(root, 'missing-type.md', `
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
    writeDesign(root, 'wrong-type.md', `
type: prd
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
    writePrd(root, 'expected-source.md', `
type: prd
status: drafted
date: 2026-04-27
topic: source-topic
`)
    writeDesign(root, 'fingerprint-mismatch.md', `
type: design
status: active
date: 2026-04-27
title: fingerprint-mismatch
origin: ae/prds/expected-source.md
originFingerprint: 2026-04-27-source-topic
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work', {
      expectedOriginFingerprint: 'expected-fingerprint',
    })

    expect(result.resolution).toBe('resolved')
    expect(result.path).toBe('ae/designs/fingerprint-mismatch.md')
    expect(result.warnings?.[0]).toContain('originFingerprint 不匹配')
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该根据 origin 上游文档计算 originFingerprint 并返回不阻断警告', () => {
    const root = createRepoRoot()
    writePrd(root, 'source.md', `
type: prd
status: drafted
date: 2026-04-27
topic: source-topic
`)
    writeDesign(root, 'wrong-origin-fingerprint.md', `
type: design
status: active
date: 2026-04-27
title: wrong-origin-fingerprint
origin: ae/prds/source.md
originFingerprint: wrong-fingerprint
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.path).toBe('ae/designs/wrong-origin-fingerprint.md')
    expect(result.warnings?.[0]).toContain("期望 '2026-04-27-source-topic'")
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该支持根据上游 date 和 title 计算 originFingerprint', () => {
    const root = createRepoRoot()
    writeDesign(root, 'source-design.md', `
type: design
status: active
date: 2026-04-27
title: Source Design
`)
    writeDesign(root, 'derived-design.md', `
type: design
status: active
date: 2026-04-28
title: derived-design
origin: ae/designs/source-design.md
originFingerprint: 2026-04-27-source-design
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('needs-selection')
    expect(result.candidates).toContain('ae/designs/source-design.md')
    expect(result.candidates).toContain('ae/designs/derived-design.md')
    expect(result.warnings).toBeUndefined()
  })

  it('读取缺失 origin 时 warning 不应该泄露仓库绝对路径', () => {
    const root = createRepoRoot()
    writeDesign(root, 'missing-origin.md', `
type: design
status: active
date: 2026-04-27
title: missing-origin
origin: ae/prds/missing.md
originFingerprint: 2026-04-27-missing
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.warnings?.[0]).toContain('文件不存在或不可读')
    expect(result.warnings?.[0]).not.toContain(root)
  })

  it('应该在过滤 supersededBy 前校验废弃产物 frontmatter', () => {
    const root = createRepoRoot()
    writeDesign(root, 'invalid-superseded.md', `
type: design
status: active
date: 2026-04-27
title: invalid-superseded
supersededBy: ../outside.md
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).toBe('invalid-artifact')
    expect(result.reason).toContain('frontmatter 无效')
  })

  it('review 阶段命中 design 产物时应该恢复到 ae:review 文档域', () => {
    const root = createRepoRoot()
    writeDesign(root, 'review-design.md', `
type: design
status: active
date: 2026-04-27
title: review-design
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'review')

    expect(result.resolution).toBe('resolved')
    expect(result.nextSkill).toBe(SKILL.REVIEW)
    expect(result.nextArguments).toBe('domain=document ae/designs/review-design.md')
    expect(result.nextCommand).toBe(`${SKILL.REVIEW} domain=document ae/designs/review-design.md`)
  })

  it('review 阶段命中多个 design 产物时不应返回可直接执行的无路径命令', () => {
    const root = createRepoRoot()
    writeDesign(root, 'first-design.md', `
type: design
status: active
date: 2026-04-27
title: first-design
`)
    writeDesign(root, 'second-design.md', `
type: design
status: active
date: 2026-04-28
title: second-design
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'review')

    expect(result.resolution).toBe('needs-selection')
    expect(result.nextSkill).toBe(SKILL.REVIEW)
    expect(result.nextArguments).toBeUndefined()
    expect(result.nextCommand).toBeUndefined()
  })

  it('应该只在当前 worktree 根目录内恢复设计产物', () => {
    const rootA = createRepoRoot()
    const rootB = createRepoRoot()
    writeDesign(rootA, 'a-design.md', `
type: design
status: active
date: 2026-04-27
title: a-design
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(rootB), 'work')

    expect(result.resolution).not.toBe('resolved')
    expect(JSON.stringify(result)).not.toContain(rootA)
    expect(JSON.stringify(result)).not.toContain('a-design.md')
  })

  it('不应该从旧 docs/ae 设计路径恢复产物', () => {
    const root = createRepoRoot()
    writeLegacyDesign(root, 'legacy-design.md')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'work')

    expect(result.resolution).not.toBe('resolved')
    expect(JSON.stringify(result)).not.toContain('docs/ae/designs/legacy-design.md')
  })

  it('不应该从旧 docs/ae 需求路径恢复产物', () => {
    const root = createRepoRoot()
    writeLegacyPrd(root, 'legacy-prd.md')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'review')

    expect(result.resolution).not.toBe('resolved')
    expect(JSON.stringify(result)).not.toContain('docs/ae/prds/legacy-prd.md')
  })

  it('当前 worktree 有自己的设计时不跨其他 worktree 恢复', () => {
    const rootA = createRepoRoot()
    const rootB = createRepoRoot()
    writeDesign(rootA, 'a-design.md', `
type: design
status: active
date: 2026-04-27
title: a-design
`)
    writeDesign(rootB, 'b-design.md', `
type: design
status: active
date: 2026-04-28
title: b-design
`)

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(rootB), 'work')

    expect(result.resolution).toBe('resolved')
    expect(result.path).toBe('ae/designs/b-design.md')
    expect(JSON.stringify(result)).not.toContain(rootA)
    expect(JSON.stringify(result)).not.toContain('a-design.md')
  })

  it('仅有 A 到 B 启动证明时不把证明当作设计产物恢复', () => {
    const rootB = createRepoRoot()
    mkdirSync(join(rootB, 'ae'), { recursive: true })
    writeFileSync(join(rootB, 'ae', 'worktree-startup-proof.md'), [
      '# A 到 B 启动证明',
      '',
      'source_session_id: session-a',
      'target_worktree: B',
    ].join('\n'), 'utf8')

    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(rootB), 'work')

    expect(result.resolution).not.toBe('resolved')
    expect(JSON.stringify(result)).not.toContain('worktree-startup-proof.md')
  })
})
