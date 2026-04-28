import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import { afterEach, describe, expect, it } from 'vitest'

import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'
import { loadBuiltinMcpConfig, mergeBuiltinAndUserMcp, registerMcp } from '../../src/services/mcp-registration.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-mcp-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'src', 'assets', 'config'), { recursive: true })
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

describe('mcp-registration', () => {
  it('应该读取 JSONC 配置中的 mcp 节点', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'src', 'assets', 'config', 'builtin-opencode.jsonc'), `{
  "$schema": "./builtin-opencode.schema.json",
  // comment
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`)

    const config = loadBuiltinMcpConfig(createManifest(root))

    expect(config.context7.type).toBe('remote')
    if (config.context7.type === 'remote') {
      expect(config.context7.url).toBe('https://mcp.context7.com/mcp')
    }
  })

  it('同名且 type 相同时应该做字段级浅合并', () => {
    const merged = mergeBuiltinAndUserMcp(
      {
        context7: {
          type: 'remote',
          url: 'https://mcp.context7.com/mcp',
          enabled: true,
          timeout: 5000,
        },
      },
      {
        context7: {
          type: 'remote',
          url: 'https://user.example/mcp',
          enabled: false,
        },
      },
    )

    expect(merged.context7).toEqual({
      type: 'remote',
      url: 'https://user.example/mcp',
      enabled: false,
      timeout: 5000,
    })
  })

  it('同名但 type 变化时应该整条替换', () => {
    const merged = mergeBuiltinAndUserMcp(
      {
        context7: {
          type: 'remote',
          url: 'https://mcp.context7.com/mcp',
          enabled: true,
          timeout: 5000,
        },
      },
      {
        context7: {
          type: 'local',
          command: ['node', 'server.js'],
          enabled: false,
        },
      },
    )

    expect(merged.context7).toEqual({
      type: 'local',
      command: ['node', 'server.js'],
      enabled: false,
    })
  })

  it('registerMcp 应该把内置默认值并入用户配置', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'src', 'assets', 'config', 'builtin-opencode.jsonc'), `{
  "$schema": "./builtin-opencode.schema.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true,
      "timeout": 5000
    },
    "gh_grep": {
      "type": "remote",
      "url": "https://mcp.grep.app",
      "enabled": true
    }
  }
}`)

    const config: { mcp: NonNullable<Config['mcp']> } = {
      mcp: {
        context7: {
          type: 'remote' as const,
          url: 'https://override.example/mcp',
          enabled: false,
        },
      },
    }

    registerMcp(config, createManifest(root))

    expect(config.mcp.context7).toEqual({
      type: 'remote',
      url: 'https://override.example/mcp',
      enabled: false,
      timeout: 5000,
    })
    expect(config.mcp.gh_grep).toEqual({
      type: 'remote',
      url: 'https://mcp.grep.app',
      enabled: true,
    })
  })
})
