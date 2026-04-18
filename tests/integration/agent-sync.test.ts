import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { syncAgentAssets } from '../../src/services/agent-sync.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

describe('agent-sync', () => {
  it('应该把已有 agent 真源同步到 runtime 目录', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-agent-sync-'))
    mkdirSync(join(root, 'agents', 'document-review'), { recursive: true })
    writeFileSync(join(root, 'agents', 'document-review', 'coherence-reviewer.md'), 'test')

    const manifest = createRuntimeAssetManifestFromRoot(root)
    await syncAgentAssets(manifest)

    const target = join(root, '.opencode', 'agents', 'ae', 'document-review', 'coherence-reviewer.md')
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('test')
  })
})
