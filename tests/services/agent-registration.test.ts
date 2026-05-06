import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'
import { buildAgentConfig, registerAgents } from '../../src/services/agent-registration.js'
import { createModelScenarioRoutingContext } from '../../src/services/model-scenario-routing-service.js'

vi.mock('../../src/services/ae-catalog.js', () => ({
  getAllAgentDefinitions: () => [
    {
      name: 'demo-reviewer',
      stage: 'review',
      description: 'catalog description',
    },
  ],
}))

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-agent-'))
  tempRoots.push(root)
  return root
}

function createManifest(root: string): RuntimeAssetManifest {
  return {
    repoRoot: root,
    skillsDir: join(root, 'src', 'assets', 'skills'),
    rulesDir: join(root, 'src', 'assets', 'rules'),
    commandsDir: join(root, 'src', 'assets', 'commands'),
    builtinConfigFile: join(root, 'src', 'assets', 'config', 'builtin-opencode.jsonc'),
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

describe('agent-registration', () => {
  it('应该从 agent markdown 构建内置配置', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'agent prompt body'].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']).toEqual({
      description: 'markdown description',
      prompt: 'agent prompt body',
      mode: 'subagent',
    })
  })

  it('用户同名 agent 应覆盖插件内置 agent', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'builtin prompt'].join('\n'),
    )

    const config: {
      agent?: Record<string, {
        description?: string
        prompt?: string
        mode?: 'subagent' | 'primary' | 'all'
        [key: string]: unknown
      } | undefined>
    } = {
      agent: {
        'demo-reviewer': {
          description: 'user description',
          prompt: 'user prompt',
          mode: 'primary',
          temperature: 0.1,
        },
      },
    }

    registerAgents(config, createManifest(root))

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'user description',
      prompt: 'user prompt',
      mode: 'primary',
      temperature: 0.1,
    })
  })

  it('应该根据模型场景为内置 agent 注入 model', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/builtin-opencode.jsonc' }],
    ]))

    const config = buildAgentConfig(createManifest(root), routingContext)

    expect(config['demo-reviewer']?.model).toBe('provider/deep')
  })

  it('用户同名 agent model 应最终覆盖场景注入 model', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/builtin-opencode.jsonc' }],
    ]))
    const config = { agent: { 'demo-reviewer': { model: 'user/model' } } }

    registerAgents(config, createManifest(root), routingContext)

    expect(config.agent['demo-reviewer'].model).toBe('user/model')
  })
})
