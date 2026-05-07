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

describe('mcp-registration', () => {
  it('应该读取 JSONC 配置中的 mcp 节点', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "$schema": "./ae.schema.json",
  // comment
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`)

    const config = loadBuiltinMcpConfig(createManifest(root), root)

    expect(config.context7.type).toBe('remote')
    if (config.context7.type === 'remote') {
      expect(config.context7.url).toBe('https://mcp.context7.com/mcp')
    }
  })

  it('opencode 既有同名 MCP 应该整条优先且不继承 builtin 字段', () => {
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

  it('registerMcp 应该把内置默认值并入用户配置且同名用户配置整条优先', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "$schema": "./ae.schema.json",
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

    registerMcp(config, createManifest(root), root)

    expect(config.mcp.context7).toEqual({
      type: 'remote',
      url: 'https://override.example/mcp',
      enabled: false,
    })
    expect(config.mcp.gh_grep).toEqual({
      type: 'remote',
      url: 'https://mcp.grep.app',
      enabled: true,
    })
  })

  it('应该消费三层 builtin 合并结果', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, '.opencode'), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true,
      "timeout": 5000
    }
  }
}`)
    writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "mcp": {
    "context7": {
      "enabled": false
    }
  }
}`)
    const config: { mcp?: Config['mcp'] } = {}

    registerMcp(config, createManifest(root), root)

    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
      enabled: false,
      timeout: 5000,
    })
  })

  it('即使临时目录存在 opencode.json 也不读取磁盘 opencode 配置', () => {
    const root = createRepoRoot()
    writeFileSync(join(root, 'opencode.json'), `{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://opencode-file.example/mcp",
      "enabled": false
    }
  }
}`)
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp",
      "enabled": true
    }
  }
}`)
    const config: { mcp?: Config['mcp'] } = {}

    registerMcp(config, createManifest(root), root)

    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
      enabled: true,
    })
  })

  it('项目级 builtin-opencode 应该允许新增远程 MCP', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, '.opencode'), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}`)
    writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "mcp": {
    "attacker": { "type": "remote", "url": "https://attacker.example/mcp" }
  }
}`)
    const config: { mcp?: Config['mcp'] } = {}

    registerMcp(config, createManifest(root), root)

    expect(config.mcp?.attacker).toEqual({ type: 'remote', url: 'https://attacker.example/mcp' })
  })

  it('项目级 builtin-opencode 覆盖已有 MCP 后仍必须得到有效最终配置', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, '.opencode'), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" }
  }
}`)
    writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "mcp": {
    "context7": { "type": "local" }
  }
}`)
    const config: { mcp?: Config['mcp'] } = {}

    expect(() => registerMcp(config, createManifest(root), root)).toThrow(
      /local MCP "context7" 必须声明 command/,
    )
  })

  it('项目级 builtin-opencode 应该允许覆盖已有 MCP 的连接端点', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, '.opencode'), { recursive: true })
    writeFileSync(join(root, 'src', 'assets', 'config', 'ae.jsonc'), `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp", "enabled": true }
  }
}`)
    writeFileSync(join(root, '.opencode', 'ae.jsonc'), `{
  "mcp": {
    "context7": { "url": "https://project.example/mcp" }
  }
}`)
    const config: { mcp?: Config['mcp'] } = {}

    registerMcp(config, createManifest(root), root)

    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://project.example/mcp',
      enabled: true,
    })
  })
})
