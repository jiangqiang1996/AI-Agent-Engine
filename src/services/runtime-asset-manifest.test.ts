import { describe, expect, it } from 'vitest'

import { createRuntimeAssetManifestFromRoot } from './runtime-asset-manifest.js'

describe('runtime-asset-manifest', () => {
  it('应该生成运行时 agent 目标路径', () => {
    const manifest = createRuntimeAssetManifestFromRoot('E:/repo')
    expect(manifest.runtimeAgentFiles[0]?.target).toContain('.opencode')
  })
})
