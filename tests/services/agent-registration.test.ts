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
      path: 'review/demo-reviewer.md',
    },
  ],
}))

const tempRoots: string[] = []
type TestAgentConfig = {
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: 'subagent' | 'primary' | 'all'
    [key: string]: unknown
  } | undefined>
}

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
  vi.unstubAllEnvs()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function isolateHome(root: string): void {
  vi.stubEnv('HOME', root)
  vi.stubEnv('USERPROFILE', root)
}

describe('agent-registration', () => {
  it('应该从 agent markdown 构建内置配置', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'mode: primary', '---', 'agent prompt body'].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']).toEqual({
      description: 'markdown description',
      prompt: 'agent prompt body',
      mode: 'primary',
    })
  })

  it('应该保留 OpenCode 支持的 agent frontmatter 配置', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      [
        '---',
        'description: markdown description',
        'mode: subagent',
        'temperature: 0.1',
        'top_p: 0.8',
        'steps: 5',
        'disable: false',
        'hidden: true',
        'color: accent',
        'tools:',
        '  write: false',
        'permission:',
        '  bash:',
        '    "*": ask',
        '---',
        'agent prompt body',
      ].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']).toEqual({
      description: 'markdown description',
      prompt: 'agent prompt body',
      mode: 'subagent',
      temperature: 0.1,
      top_p: 0.8,
      steps: 5,
      disable: false,
      hidden: true,
      color: 'accent',
      tools: {
        write: false,
      },
      permission: {
        bash: {
          '*': 'ask',
        },
      },
    })
  })

  it('应该允许 agent frontmatter prompt 覆盖 Markdown 正文提示词', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'prompt: ./prompt.md', '---', 'agent prompt body'].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']?.prompt).toBe('./prompt.md')
  })

  it('agent frontmatter 未声明 mode 时应该默认使用 subagent', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', '---', 'agent prompt body'].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']?.mode).toBe('subagent')
  })

  it('agent frontmatter 带 BOM 时也应该读取 mode', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['\uFEFF---', 'description: markdown description', 'mode: primary', '---', 'agent prompt body'].join('\n'),
    )

    const config = buildAgentConfig(createManifest(root))

    expect(config['demo-reviewer']).toMatchObject({
      mode: 'primary',
      prompt: 'agent prompt body',
    })
  })

  it('agent frontmatter mode 不合法时应该失败', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: markdown description', 'mode: invalid', '---', 'agent prompt body'].join('\n'),
    )

    expect(() => buildAgentConfig(createManifest(root))).toThrow('frontmatter mode 不合法')
  })

  it('用户同名 agent 应覆盖插件内置 agent', () => {
    const root = createTempRoot()
    isolateHome(createTempRoot())
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

    registerAgents(config, createManifest(root), root, false)

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'user description',
      prompt: 'user prompt',
      mode: 'primary',
      temperature: 0.1,
    })
  })

  it('项目级动态 agent 应覆盖已有同名动态 agent', () => {
    const root = createTempRoot()
    isolateHome(createTempRoot())
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: project dynamic description', '---', 'project dynamic prompt'].join('\n'),
    )
    const config = {
      agent: {
        'demo-reviewer': {
          description: 'global dynamic description',
          prompt: 'global dynamic prompt',
          mode: 'subagent' as const,
        },
      },
    }

    registerAgents(config, createManifest(root), root, true)

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'project dynamic description',
      prompt: 'project dynamic prompt',
      mode: 'subagent',
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

    registerAgents(config, createManifest(root), root, false, routingContext)

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

    registerAgents(config, createManifest(root), root, false, routingContext)

    expect(config.agent['demo-reviewer'].model).toBe('user/model')
  })

  it('项目级 agent 文件应该最终覆盖已有同名 agent 配置', () => {
    const root = createTempRoot()
    isolateHome(createTempRoot())
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    mkdirSync(join(root, '.opencode', 'agents'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: builtin description', '---', 'builtin prompt'].join('\n'),
    )
    writeFileSync(
      join(root, '.opencode', 'agents', 'demo-reviewer.md'),
      ['---', 'description: project description', 'mode: primary', '---', 'project prompt'].join('\n'),
    )
    const config = {
      agent: {
        'demo-reviewer': {
          description: 'global description',
          prompt: 'global prompt',
          mode: 'subagent' as const,
        },
        'other-agent': {
          prompt: 'other prompt',
        },
      },
    }

    registerAgents(config, createManifest(root), root, false)

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'project description',
      prompt: 'project prompt',
      mode: 'primary',
    })
    expect(config.agent['other-agent']).toEqual({
      prompt: 'other prompt',
    })
  })

  it('全局直接 agent 应该覆盖项目级动态 agent', () => {
    const root = createTempRoot()
    const home = createTempRoot()
    isolateHome(home)
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    mkdirSync(join(home, '.config', 'opencode', 'agents'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: project dynamic description', '---', 'project dynamic prompt'].join('\n'),
    )
    writeFileSync(
      join(home, '.config', 'opencode', 'agents', 'demo-reviewer.md'),
      ['---', 'description: global direct description', 'mode: primary', '---', 'global direct prompt'].join('\n'),
    )
    const config: TestAgentConfig = { agent: {} }

    registerAgents(config, createManifest(root), root, true)

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'global direct description',
      prompt: 'global direct prompt',
      mode: 'primary',
    })
  })

  it('项目级直接 agent 应该覆盖全局直接 agent', () => {
    const root = createTempRoot()
    const home = createTempRoot()
    isolateHome(home)
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    mkdirSync(join(root, '.opencode', 'agents'), { recursive: true })
    mkdirSync(join(home, '.config', 'opencode', 'agents'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'assets', 'agents', 'review', 'demo-reviewer.md'),
      ['---', 'description: project dynamic description', '---', 'project dynamic prompt'].join('\n'),
    )
    writeFileSync(
      join(home, '.config', 'opencode', 'agents', 'demo-reviewer.md'),
      ['---', 'description: global direct description', '---', 'global direct prompt'].join('\n'),
    )
    writeFileSync(
      join(root, '.opencode', 'agents', 'demo-reviewer.md'),
      ['---', 'description: project direct description', 'mode: primary', '---', 'project direct prompt'].join('\n'),
    )
    const config: TestAgentConfig = { agent: {} }

    registerAgents(config, createManifest(root), root, true)

    expect(config.agent?.['demo-reviewer']).toEqual({
      description: 'project direct description',
      prompt: 'project direct prompt',
      mode: 'primary',
    })
  })
})
