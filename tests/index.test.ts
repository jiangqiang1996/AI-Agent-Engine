import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  writeFileSync(join(root, '.opencode', 'builtin-opencode.jsonc'), `{
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
  writeFileSync(join(root, '.opencode', 'builtin-opencode.jsonc'), `{
  "modelScenarios": {
    "quick": "project/quick",
    "deep": "project/deep",
    "vision": "project/vision"
  }
}`)
}

async function runConfigHook(input: unknown): Promise<RuntimeConfigShape> {
  const server = await plugin.server(input as Parameters<typeof plugin.server>[0])
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

  it('缺少 input.worktree 时应该受控降级到 process.cwd()', async () => {
    const originalCwd = process.cwd()
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())
    writeBuiltinConfig(hostRoot)

    try {
      process.chdir(hostRoot)
      const config = await runConfigHook({ client: {} })

      expect(config.mcp?.context7).toEqual({
        type: 'remote',
        url: 'https://mcp.context7.com/mcp',
        enabled: false,
        timeout: 1234,
      })
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('应该通过 server config 注册 catalog 命令和磁盘命令', async () => {
    const hostRoot = createTempRoot()
    isolateHome(createTempRoot())

    const config = await runConfigHook({ worktree: hostRoot, client: {} })

    expect(config.command?.['ae-lfg']?.template).toContain('ae:lfg')
    expect(config.command?.['ae-commit']?.template).toContain('智能提交当前变更文件')
  })

  it('零配置时不应该为内置命令和代理写入 model', async () => {
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
})
