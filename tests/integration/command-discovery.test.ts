import { describe, expect, it } from 'vitest'

import { buildCommandConfig, createTuiCommands } from '../../src/services/command-registration.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

describe('command-discovery', () => {
  it('应该让原生命令配置与 TUI 命令数量一致', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const config = buildCommandConfig(manifest.commandsDir)
    const commands = createTuiCommands()

    expect(Object.keys(config)).toHaveLength(commands.length)
    expect(Object.keys(config)).toContain('ae-lfg')
  })
})
