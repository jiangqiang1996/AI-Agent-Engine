import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { getDefaultEntry } from '../../src/services/ae-catalog.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'
import { resolveRecovery } from '../../src/services/recovery-service.js'

describe('phase-one-primary-journey', () => {
  it('应该把 ae:lfg 作为默认入口', () => {
    expect(getDefaultEntry().commandName).toBe('ae-lfg')
  })

  it('应该在无产物时回到 brainstorm，以形成主链路起点', () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-primary-journey-empty-'))
    const result = resolveRecovery(createRuntimeAssetManifestFromRoot(root), 'lfg')
    expect(result.fallbackSkill).toBe('ae:brainstorm')
  })
})
