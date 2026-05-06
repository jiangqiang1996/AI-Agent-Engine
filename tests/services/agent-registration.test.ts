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

  it('未声明 frontmatter model 时不应该为内置 agent 注入 model', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildAgentConfig(createManifest(root), routingContext)

    expect(config['demo-reviewer']?.model).toBeUndefined()
  })

  it('应该将 agent frontmatter model 变量解析为 modelScenarios 中的模型', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'model: $reviewer', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['reviewer', { scenario: 'reviewer', model: 'provider/reviewer', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildAgentConfig(createManifest(root), routingContext)

    expect(config['demo-reviewer']?.model).toBe('provider/reviewer')
  })

  it('应该保留 agent frontmatter 中的真实模型标识', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'model: provider/explicit-model', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildAgentConfig(createManifest(root), routingContext)

    expect(config['demo-reviewer']?.model).toBe('provider/explicit-model')
  })

  it('agent frontmatter model 变量未配置时应该原样透传', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'model: $reviewer', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map())

    const config = buildAgentConfig(createManifest(root), routingContext)

    expect(config['demo-reviewer']?.model).toBe('$reviewer')
  })

  it('用户同名 agent model 应最终覆盖场景注入 model', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))
    const config = { agent: { 'demo-reviewer': { model: 'user/model' } } }

    registerAgents(config, createManifest(root), routingContext)

    expect(config.agent['demo-reviewer'].model).toBe('user/model')
  })

  it('用户同名 agent model 应最终覆盖 frontmatter model', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'model: $reviewer', '---', 'builtin prompt'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['reviewer', { scenario: 'reviewer', model: 'provider/reviewer', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))
    const config = { agent: { 'demo-reviewer': { model: 'user/model' } } }

    registerAgents(config, createManifest(root), routingContext)

    expect(config.agent['demo-reviewer'].model).toBe('user/model')
  })
})
