import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ARTIFACT_KIND } from '../../src/schemas/artifact-schema.js'
import { listArtifacts } from '../../src/services/artifact-store.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = join(tmpdir(), `ae-artifact-store-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  tempRoots.push(root)
  mkdirSync(join(root, 'ae', 'prds'), { recursive: true })
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('artifact-store', () => {
  it('应该读取 prd 顶层产物', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'ae', 'prds', 'feature-prd.md'), [
      '---',
      'type: prd',
      'status: drafted',
      'date: 2026-06-02',
      'topic: feature-topic',
      '---',
      '# Feature PRD',
    ].join('\n'))

    const manifest = createRuntimeAssetManifestFromRoot(root)
    const artifacts = listArtifacts(manifest, ARTIFACT_KIND.PRD)

    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.frontmatter.type).toBe('prd')
  })
})
