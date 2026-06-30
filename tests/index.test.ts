import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import { afterEach, describe, expect, it, vi } from 'vitest'

import plugin from '../src/index.js'

const tempRoots: string[] = []

interface RuntimeConfigShape {
  command?: Config['command']
  agent?: Record<string, { model?: string; [key: string]: unknown } | undefined>
  mcp?: Config['mcp']
}

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-plugin-index-'))
  tempRoots.push(root)
  return root
}

function writeBuiltinConfig(root: string): void {
  mkdirSync(join(root, '.opencode'), { recursive: true })
  writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "mcp": {
    "context7": {
      "enabled": false,
      "timeout": 1234
    }
  }
}`)
}

function writeModelScenariosConfig(root: string): void {
  mkdirSync(join(root, '.opencode'), { recursive: true })
  writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "modelScenarios": {
    "quick": "project/quick",
    "standard": "project/standard",
    "deep": "project/deep",
    "vision": "project/vision"
  }
}`)
}

async function runConfigHook(input: unknown): Promise<RuntimeConfigShape> {
  const server = await plugin(input as Parameters<typeof plugin>[0])
  const config: RuntimeConfigShape = {}
  await server.config?.(config as never)
  return config
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

describe('插件入口', () => {
  it('应该使用 input.worktree 解析项目级 builtin-opencode 配置', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    writeBuiltinConfig(hostRoot)

    const config = await runConfigHook({ worktree: hostRoot, client: {} })

    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
      enabled: false,
      timeout: 1234,
    })
  })

  it('应该通过 server config 注册 catalog 命令和磁盘命令', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())

    const config = await runConfigHook({ worktree: hostRoot, client: {} })

    expect(config.command?.['ae-work']?.template).toContain('ae:work')
    expect(config.command?.['ae-commit']?.template).toContain('智能提交当前变更')
    expect(config.command?.['ae-commit']?.subtask).toBe(false)
  })

  it('项目级磁盘命令应该在 server config 中最终覆盖同名已有命令', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    mkdirSync(join(hostRoot, '.opencode', 'commands'), { recursive: true })
    writeFileSync(
      join(hostRoot, '.opencode', 'commands', 'ae-commit.md'),
      ['---', 'description: project commit', '---', 'project commit template'].join('\n'),
    )
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      command: {
        'ae-commit': {
          template: 'global commit template',
          description: 'global commit',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.command?.['ae-commit']).toEqual({
      template: 'project commit template',
      description: 'project commit',
    })
    expect(config.command?.['ae-work']?.template).toContain('ae:work')
  })

  it('项目级磁盘命令在 server config 中应该解析 frontmatter model 变量', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    writeModelScenariosConfig(hostRoot)
    mkdirSync(join(hostRoot, '.opencode', 'commands'), { recursive: true })
    writeFileSync(
      join(hostRoot, '.opencode', 'commands', 'ae-commit.md'),
      ['---', 'description: project commit', 'model: $quick', '---', 'project commit template'].join('\n'),
    )
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {}

    await server.config?.(config as never)

    expect(config.command?.['ae-commit']).toEqual({
      template: 'project commit template',
      description: 'project commit',
      model: 'project/quick',
    })
  })

  it('项目级安装的插件动态命令应该覆盖已有同名动态命令', async () => {
    const hostRoot = `${process.cwd()}${sep}`
    isolateHome(createTempRoot())
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      command: {
        'ae-plan': {
          template: 'global dynamic plan',
          description: 'global dynamic plan',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.command?.['ae-plan']?.template).toContain('ae:plan')
  })

  it('插件位于 worktree 父目录下但不在项目插件目录时不应该被判定为项目级安装', async () => {
    const hostRoot = dirname(process.cwd())
    isolateHome(createTempRoot())
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      command: {
        'ae-plan': {
          template: 'global dynamic plan',
          description: 'global dynamic plan',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.command?.['ae-plan']).toEqual({
      template: 'global dynamic plan',
      description: 'global dynamic plan',
    })
  })

  it('项目级 agent 文件应该在 server config 中最终覆盖同名已有 agent', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    mkdirSync(join(hostRoot, '.opencode', 'agents'), { recursive: true })
    writeFileSync(
      join(hostRoot, '.opencode', 'agents', 'correctness-reviewer.md'),
      ['---', 'description: project reviewer', 'mode: primary', '---', 'project reviewer prompt'].join('\n'),
    )
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      agent: {
        'correctness-reviewer': {
          description: 'global reviewer',
          prompt: 'global reviewer prompt',
          mode: 'subagent',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.agent?.['correctness-reviewer']).toEqual({
      description: 'project reviewer',
      prompt: 'project reviewer prompt',
      mode: 'primary',
    })
  })

  it('项目级安装的插件动态 agent 应该覆盖已有同名动态 agent', async () => {
    const hostRoot = `${process.cwd()}${sep}`
    isolateHome(createTempRoot())
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      agent: {
        'correctness-reviewer': {
          description: 'global reviewer',
          prompt: 'global reviewer prompt',
          mode: 'subagent',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.agent?.['correctness-reviewer']?.prompt).not.toBe('global reviewer prompt')
    expect(config.agent?.['correctness-reviewer']?.description).not.toBe('global reviewer')
    expect(config.agent?.['correctness-reviewer']?.mode).toBe('subagent')
  })

  it('零配置时应该让内置命令和代理继承默认模型', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())

    const config = await runConfigHook({ worktree: hostRoot, client: {} })

    expect(config.command?.['ae-plan']?.model).toBeUndefined()
    expect(config.agent?.['correctness-reviewer']?.model).toBeUndefined()
  })

  it('应该根据项目级 modelScenarios 为内置命令和代理写入 model', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    writeModelScenariosConfig(hostRoot)

    const config = await runConfigHook({ worktree: hostRoot, client: {} })

    expect(config.command?.['ae-help']?.model).toBe('project/quick')
    expect(config.command?.['ae-plan']?.model).toBe('project/deep')
    expect(config.agent?.['correctness-reviewer']?.model).toBe('project/deep')
  })

  it.each([
    { label: '用户配置命令和代理', commandKey: 'ae-custom', agentKey: 'custom-agent', isOverride: false },
    { label: '用户覆盖内置命令和代理', commandKey: 'ae-plan', agentKey: 'correctness-reviewer', isOverride: true },
  ] as const)('模型场景变量未配置时应该原样透传（$label）', async ({ commandKey, agentKey, isOverride }) => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    if (!isOverride) {
      writeModelScenariosConfig(hostRoot)
    }
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      command: {
        [commandKey]: { template: `${commandKey} template`, model: '$missing' },
      },
      agent: {
        [agentKey]: { model: '$missing' },
      },
    }

    await server.config?.(config as never)

    expect(config.command?.[commandKey]?.model).toBe('$missing')
    expect(config.agent?.[agentKey]?.model).toBe('$missing')
  })

  it('用户配置的不带 $ 模型常量名应该直接透传且不记录为缺失场景变量', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    writeModelScenariosConfig(hostRoot)
    const server = await plugin({ worktree: hostRoot, client: {} } as never)
    const config: RuntimeConfigShape = {
      command: {
        'ae-custom': {
          template: 'custom template',
          model: 'missing-model-constant',
        },
      },
      agent: {
        'custom-agent': {
          model: 'another-model-constant',
        },
      },
    }

    await server.config?.(config as never)

    expect(config.command?.['ae-custom']?.model).toBe('missing-model-constant')
    expect(config.agent?.['custom-agent']?.model).toBe('another-model-constant')
  })
})
