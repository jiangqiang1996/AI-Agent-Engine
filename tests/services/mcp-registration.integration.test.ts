import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import stripJsonComments from 'strip-json-comments'

import type { Config } from '@opencode-ai/plugin'
import { loadBuiltinMcpConfig, registerMcp } from '../../src/services/mcp-registration.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

describe('mcp-registration 集成', () => {
  it('真实内置配置应该声明本地 MCP schema 且只包含 mcp 节点', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const parsed = JSON.parse(stripJsonComments(readFileSync(manifest.builtinConfigFile, 'utf8'))) as Record<
      string,
      unknown
    >

    expect(parsed.$schema).toBe('./builtin-opencode.schema.json')
    expect(Object.keys(parsed).sort()).toEqual(['$schema', 'mcp'])
  })

  it('应该从真实内置配置文件加载 context7 和 gh_grep', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const config = loadBuiltinMcpConfig(manifest)

    expect(config.context7).toBeDefined()
    expect(config.gh_grep).toBeDefined()
    expect(config.context7.type).toBe('remote')
    expect(config.gh_grep.type).toBe('remote')
    if (config.context7.type === 'remote') {
      expect(config.context7.url).toBe('https://mcp.context7.com/mcp')
      expect(config.context7.enabled).toBe(true)
      expect(config.context7.timeout).toBe(5000)
    }
    if (config.gh_grep.type === 'remote') {
      expect(config.gh_grep.url).toBe('https://mcp.grep.app')
      expect(config.gh_grep.enabled).toBe(true)
      expect(config.gh_grep.timeout).toBe(5000)
    }
  })

  it('应该保留用户对内置 MCP 的禁用覆盖', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const config: { mcp: NonNullable<Config['mcp']> } = {
      mcp: {
        context7: {
          type: 'remote' as const,
          url: 'https://user.example/mcp',
          enabled: false,
        },
      },
    }

    registerMcp(config, manifest)

    expect(config.mcp.context7.enabled).toBe(false)
    expect(config.mcp.context7.type).toBe('remote')
    if (config.mcp.context7.type === 'remote') {
      expect(config.mcp.context7.url).toBe('https://user.example/mcp')
    }
    expect(config.mcp.gh_grep).toBeDefined()
  })
})
