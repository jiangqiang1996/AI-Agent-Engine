import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ARTIFACT_KIND } from '../../src/schemas/artifact-schema.js'
import { listArtifacts } from '../../src/services/artifact-store.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = join(tmpdir(), `ae-artifact-store-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  tempRoots.push(root)
  mkdirSync(root, { recursive: true })
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('artifact-store', () => {
  it('应该从 ae/designs 读取顶层 design 产物', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'ae', 'designs'), { recursive: true })
    writeFileSync(join(root, 'ae', 'designs', 'main.md'), [
      '---',
      'type: design',
      'status: drafted',
      'date: 2026-05-22',
      'title: design',
      '---',
      '# 设计',
    ].join('\n'), 'utf8')

    const artifacts = listArtifacts(createRuntimeAssetManifestFromRoot(root), ARTIFACT_KIND.DESIGN)

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ type: ARTIFACT_KIND.DESIGN })
    expect(artifacts[0]?.frontmatter.title).toBe('design')
  })

  it('应该拒绝把分片类型作为顶层产物扫描', () => {
    const root = createTempRoot()

    expect(() => listArtifacts(createRuntimeAssetManifestFromRoot(root), ARTIFACT_KIND.DESIGN_SHARD)).toThrow(
      '产物类型 design-shard 不作为顶层 AE 产物扫描',
    )
  })
})
