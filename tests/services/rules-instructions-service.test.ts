import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerRulesInstructions } from '../../src/services/rules-instructions-service.js'
import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'
import { toPosixPath } from '../../src/utils/path-utils.js'

function createManifest(root: string): RuntimeAssetManifest {
  return {
    repoRoot: root,
    skillsDir: join(root, 'src', 'assets', 'skills'),
    rulesDir: join(root, 'src', 'assets', 'rules'),
    commandsDir: join(root, 'src', 'assets', 'commands'),
    builtinConfigFile: join(root, 'src', 'assets', 'config', 'ae.jsonc'),
    toolsDir: join(root, 'tools'),
    agentsDir: join(root, 'src', 'assets', 'agents'),
    runtimeAgentDir: join(root, '.opencode', 'agents', 'ae'),
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: [],
  }
}

describe('rules-instructions-service', () => {
  const globalRulesGlob = toPosixPath(join(homedir(), '.config', 'opencode', 'rules', '**', '*.md'))

  it('应该注入内置规则和项目级规则目录', () => {
    const config = { instructions: ['AGENTS.md'] }

    registerRulesInstructions(config, createManifest('/repo'))

    expect(config.instructions).toEqual([
      'AGENTS.md',
      '/repo/src/assets/rules/**/*.md',
      '.opencode/rules/**/*.md',
      globalRulesGlob,
    ])
  })

  it('应该避免重复注入规则路径', () => {
    const config = { instructions: ['.opencode/rules/**/*.md'] }

    registerRulesInstructions(config, createManifest('/repo'))

    expect(config.instructions).toEqual([
      '.opencode/rules/**/*.md',
      '/repo/src/assets/rules/**/*.md',
      globalRulesGlob,
    ])
  })

  it('应该使用 manifest 中的分发规则目录', () => {
    const config = { instructions: [] }
    const manifest = createManifest('/plugin')
    manifest.rulesDir = join('/plugin', 'dist', 'src', 'assets', 'rules')

    registerRulesInstructions(config, manifest)

    expect(config.instructions).toEqual([
      '/plugin/dist/src/assets/rules/**/*.md',
      '.opencode/rules/**/*.md',
      globalRulesGlob,
    ])
  })
})
