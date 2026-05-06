import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import stripJsonComments from 'strip-json-comments'

import type { Config } from '@opencode-ai/plugin'
import { loadBuiltinOpencodeConfig, resolveBuiltinOpencodeConfigPaths } from '../../src/services/builtin-opencode-config-service.js'
import { registerMcp } from '../../src/services/mcp-registration.js'
import { createRuntimeAssetManifestFromRoot } from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-mcp-integration-'))
  tempRoots.push(root)
  return root
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

describe('mcp-registration 集成', () => {
  it('真实内置配置应该声明本地 MCP schema 且包含合法 mcp 节点', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const parsed = JSON.parse(stripJsonComments(readFileSync(manifest.builtinConfigFile, 'utf8'))) as Record<
      string,
      unknown
    >

    expect(parsed.$schema).toBe('./ae.schema.json')
    expect(parsed.mcp).toBeDefined()
  })

  it('应该从真实内置配置文件加载 context7 和 gh_grep', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const root = createTempRoot()
    const config = loadBuiltinOpencodeConfig({
      builtinConfigFile: manifest.builtinConfigFile,
      globalConfigFile: join(root, 'missing-global-ae.jsonc'),
      projectConfigFile: join(root, 'missing-project-ae.jsonc'),
    }).mcp ?? {}

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
    const root = createTempRoot()
    isolateHome(root)
    const config: { mcp: NonNullable<Config['mcp']> } = {
      mcp: {
        context7: {
          type: 'remote' as const,
          url: 'https://user.example/mcp',
          enabled: false,
        },
      },
    }

    registerMcp(config, manifest, root)

    expect(config.mcp.context7.enabled).toBe(false)
    expect(config.mcp.context7.type).toBe('remote')
    if (config.mcp.context7.type === 'remote') {
      expect(config.mcp.context7.url).toBe('https://user.example/mcp')
      expect(config.mcp.context7.timeout).toBeUndefined()
    }
    expect(config.mcp.gh_grep).toBeDefined()
  })

  it('真实内置配置应该能通过完整 builtin 配置服务加载', () => {
    const manifest = createRuntimeAssetManifestFromRoot(process.cwd())
    const root = createTempRoot()
    const paths = resolveBuiltinOpencodeConfigPaths(manifest, root)
    const config = loadBuiltinOpencodeConfig({
      ...paths,
      globalConfigFile: join(root, 'missing-global-ae.jsonc'),
    })

    expect(config.$schema).toBe('./ae.schema.json')
    expect(config.mcp?.context7).toBeDefined()
    expect(config.mcp?.gh_grep).toBeDefined()
  })
})
