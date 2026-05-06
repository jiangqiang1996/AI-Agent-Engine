import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { injectBuiltinRulesIntoSystem } from '../../src/services/rules-system-transform-service.js'
import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-rules-'))
  tempRoots.push(root)
  return root
}

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

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('rules-system-transform-service', () => {
  it('应该把内置规则内容注入 system prompt', async () => {
    const root = createRoot()
    mkdirSync(join(root, 'src', 'assets', 'rules', 'core'), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', 'rules', 'core', 'base.md'), '# 基础规则\n必须使用中文。')

    const output = { system: ['existing'] }

    await injectBuiltinRulesIntoSystem(createManifest(root), output)

    expect(output.system).toEqual([
      'existing',
      'Instructions from AE builtin rule: core/base.md\n# 基础规则\n必须使用中文。',
    ])
  })

  it('应该在规则目录不存在时保持 system prompt 不变', async () => {
    const root = createRoot()
    const output = { system: ['existing'] }

    await injectBuiltinRulesIntoSystem(createManifest(root), output)

    expect(output.system).toEqual(['existing'])
  })
})
