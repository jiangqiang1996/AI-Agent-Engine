import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { registerRulesInstructions } from '../../src/services/rules-instructions-service.js'
import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'

function createManifest(root: string): RuntimeAssetManifest {
  return {
    repoRoot: root,
    moduleDir: join(root, 'plugins'),
    installRoot: root,
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
  it('应该注入内置规则、安装目录规则和项目级规则目录', () => {
    const config = { instructions: ['AGENTS.md'] }

    registerRulesInstructions(config, createManifest('/repo'))

    // installRoot = /repo，basename = repo，推断为 .repo
    expect(config.instructions).toEqual([
      'AGENTS.md',
      '/repo/src/assets/rules/**/*.md',
      '/repo/rules/**/*.md',
      '.repo/rules/**/*.md',
    ])
  })

  it('应该避免重复注入规则路径', () => {
    const config = { instructions: ['.repo/rules/**/*.md'] }

    registerRulesInstructions(config, createManifest('/repo'))

    expect(config.instructions).toEqual([
      '.repo/rules/**/*.md',
      '/repo/src/assets/rules/**/*.md',
      '/repo/rules/**/*.md',
    ])
  })

  it('应该使用 manifest 中的分发规则目录', () => {
    const config = { instructions: [] }
    const manifest = createManifest('/plugin')
    manifest.rulesDir = join('/plugin', 'dist', 'src', 'assets', 'rules')

    registerRulesInstructions(config, manifest)

    expect(config.instructions).toEqual([
      '/plugin/dist/src/assets/rules/**/*.md',
      '/plugin/rules/**/*.md',
      '.plugin/rules/**/*.md',
    ])
  })

  it('标准 opencode 布局应推断项目级目录为 .opencode', () => {
    const manifest = createManifest('/root/opencode')
    const config = { instructions: [] }

    registerRulesInstructions(config, manifest)

    expect(config.instructions).toContain('.opencode/rules/**/*.md')
  })

  it('定制版 codefree-o 全局布局应推断项目级目录为 .codefree-o', () => {
    const manifest = createManifest('/root/.config/codefree-o')
    const config = { instructions: [] }

    registerRulesInstructions(config, manifest)

    expect(config.instructions).toContain('.codefree-o/rules/**/*.md')
  })

  it('定制版 .codefree-o 全局布局应推断项目级目录为 .codefree-o', () => {
    const manifest = createManifest('/root/.codefree-o/.config')
    const config = { instructions: [] }

    registerRulesInstructions(config, manifest)

    expect(config.instructions).toContain('.codefree-o/rules/**/*.md')
  })

  it('项目级安装时 installRoot 与 worktree 重合仍注入三层 glob', () => {
    const worktree = '/project'
    const manifest = createManifest(join(worktree, '.opencode'))

    expect(manifest.installRoot).toBe(join(worktree, '.opencode'))
  })
})
