import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  collectEffectiveConfigObjectEntries,
  collectModelScenarioSources,
  loadBuiltinMcpConfigFromPaths,
  loadBuiltinOpencodeConfig,
  mergeBuiltinOpencodeConfig,
  resolveBuiltinOpencodeConfigPaths,
} from '../../src/services/builtin-opencode-config-service.js'
import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-builtin-opencode-'))
  tempRoots.push(root)
  return root
}

function createManifest(root: string): RuntimeAssetManifest {
  return {
    repoRoot: root,
    skillsDir: join(root, 'dist', 'src', 'assets', 'skills'),
    rulesDir: join(root, 'dist', 'src', 'assets', 'rules'),
    commandsDir: join(root, 'dist', 'src', 'assets', 'commands'),
    builtinConfigFile: join(root, 'dist', 'src', 'assets', 'config', 'ae.jsonc'),
    toolsDir: join(root, 'tools'),
    agentsDir: join(root, 'dist', 'src', 'assets', 'agents'),
    runtimeAgentDir: join(root, '.opencode', 'agents', 'ae'),
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: [],
  }
}

function writeConfig(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('builtin-opencode-config-service', () => {
  it('应该读取包含注释的 JSONC 完整对象', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "$schema": "./ae.schema.json",
  // comment
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "https://mcp.context7.com/mcp"
    }
  },
  "future": { "enabled": true }
}`)

    const config = loadBuiltinOpencodeConfig({
      builtinConfigFile,
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile: join(root, 'missing-project.jsonc'),
    })

    expect(config.$schema).toBe('./ae.schema.json')
    expect(config.future).toEqual({ enabled: true })
    expect(config.mcp?.context7.type).toBe('remote')
  })

  it('应该把空对象和只有 $schema 的配置视为合法空配置', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, '{}')
    writeConfig(projectConfigFile, '{ "$schema": "./project.schema.json" }')

    const config = loadBuiltinOpencodeConfig({
      builtinConfigFile,
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile,
    })

    expect(config).toEqual({ $schema: './project.schema.json' })
    expect(loadBuiltinMcpConfigFromPaths({
      builtinConfigFile,
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile,
    })).toEqual({})
  })

  it('应该在空文件、只有注释、非对象 JSON 和语法错误时返回明确错误', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')

    writeConfig(builtinConfigFile, '{}')
    writeConfig(globalConfigFile, '')
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /全局 builtin-opencode 配置解析失败/,
    )

    writeConfig(globalConfigFile, '// comment only')
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /全局 builtin-opencode 配置解析失败/,
    )

    for (const nonObjectJson of ['[]', 'null', '"value"', '1', 'true']) {
      writeConfig(globalConfigFile, nonObjectJson)
      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /全局 builtin-opencode 配置必须是 JSON 对象/,
      )
    }

    writeConfig(globalConfigFile, '{}')
    writeConfig(projectConfigFile, '{')
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /项目级 builtin-opencode 配置解析失败/,
    )
  })

  it('应该按项目级、全局、插件内置优先级递归合并字段', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "feature": { "enabled": false, "nested": { "a": 1, "b": 1 }, "list": [1] },
  "value": "builtin",
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "enabled": true, "timeout": 5000 }
  }
}`)
    writeConfig(globalConfigFile, `{
  "feature": { "nested": { "b": 2 }, "list": [2] },
  "value": { "from": "global" },
  "mcp": {
    "context7": { "type": "remote", "url": "https://global.example/mcp" }
  }
}`)
    writeConfig(projectConfigFile, `{
  "feature": { "enabled": true, "nested": { "c": 3 } },
  "value": null
}`)

    const config = loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })

    expect(config.feature).toEqual({ enabled: true, nested: { a: 1, b: 2, c: 3 }, list: [2] })
    expect(config.value).toBeNull()
    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://global.example/mcp',
      enabled: true,
      timeout: 5000,
    })
  })

  it('应该在 builtin 三层内部对同名不同 type MCP 整条替换', () => {
    const merged = mergeBuiltinOpencodeConfig(
      {
        mcp: {
          context7: { type: 'remote', url: 'https://builtin.example/mcp', timeout: 5000 },
        },
      },
      {
        mcp: {
          context7: { type: 'local', command: ['node', 'server.js'] },
        },
      },
    )

    expect(merged.mcp?.context7).toEqual({ type: 'local', command: ['node', 'server.js'] })
  })

  it('应该只对顶层 mcp 使用 MCP 专用合并规则', () => {
    const merged = mergeBuiltinOpencodeConfig(
      {
        future: {
          mcp: {
            context7: { type: 'remote', url: 'https://builtin.example/mcp', timeout: 5000 },
          },
        },
      },
      {
        future: {
          mcp: {
            context7: { type: 'local', command: ['node', 'server.js'] },
          },
        },
      },
    )

    expect(merged.future).toEqual({
      mcp: {
        context7: {
          type: 'local',
          url: 'https://builtin.example/mcp',
          timeout: 5000,
          command: ['node', 'server.js'],
        },
      },
    })
  })

  it('应该在项目级和全局缺失时降级到插件内置配置', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    writeConfig(builtinConfigFile, '{ "mcp": { "context7": { "type": "remote", "url": "https://builtin.example/mcp" } } }')

    const config = loadBuiltinOpencodeConfig({
      builtinConfigFile,
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile: join(root, 'missing-project.jsonc'),
    })

    expect(config.mcp?.context7).toEqual({ type: 'remote', url: 'https://builtin.example/mcp' })
  })

  it('应该按项目级、全局、插件内置优先级合并 modelScenarios', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, '{ "modelScenarios": { "quick": "builtin/quick", "deep": "builtin/deep" } }')
    writeConfig(globalConfigFile, '{ "modelScenarios": { "quick": "global/quick", "standard": "global/standard" } }')
    writeConfig(projectConfigFile, '{ "modelScenarios": { "quick": "project/quick", "custom": "project/custom" } }')

    const paths = { builtinConfigFile, globalConfigFile, projectConfigFile }
    const config = loadBuiltinOpencodeConfig(paths)
    const sources = collectModelScenarioSources(paths)

    expect(config.modelScenarios).toEqual({
      quick: 'project/quick',
      deep: 'builtin/deep',
      standard: 'global/standard',
      custom: 'project/custom',
    })
    expect(sources.get('quick')).toMatchObject({ model: 'project/quick', layer: '项目级' })
    expect(sources.get('standard')).toMatchObject({ model: 'global/standard', layer: '全局' })
    expect(sources.get('deep')).toMatchObject({ model: 'builtin/deep', layer: '插件内置' })
  })

  it('应该通过公共入口获取对象属性的最终生效值和来源', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, '{ "modelScenarios": { "quick": "builtin/quick", "deep": "builtin/deep" } }')
    writeConfig(globalConfigFile, '{ "modelScenarios": { "quick": "global/quick", "standard": "global/standard" } }')
    writeConfig(projectConfigFile, '{ "modelScenarios": { "quick": "project/quick" } }')

    const entries = collectEffectiveConfigObjectEntries(
      { builtinConfigFile, globalConfigFile, projectConfigFile },
      'modelScenarios',
    )

    expect(entries.get('quick')).toMatchObject({ value: 'project/quick', layer: '项目级', path: projectConfigFile })
    expect(entries.get('standard')).toMatchObject({ value: 'global/standard', layer: '全局', path: globalConfigFile })
    expect(entries.get('deep')).toMatchObject({ value: 'builtin/deep', layer: '插件内置', path: builtinConfigFile })
  })

  it('应该校验 modelScenarios 必须是非空字符串映射', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')

    for (const invalid of ['[]', 'null', '"model"', '1', 'true']) {
      writeConfig(builtinConfigFile, `{ "modelScenarios": ${invalid} }`)
      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /modelScenarios 必须是 JSON 对象/,
      )
    }

    for (const invalid of ['""', '"   "', '" provider/model"', '"provider/model "', '1', 'false', '{}', '[]']) {
      writeConfig(builtinConfigFile, `{ "modelScenarios": { "quick": ${invalid} } }`)
      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /modelScenarios.quick 必须是非空字符串模型标识/,
      )
    }
  })

  it('应该允许全局和项目级配置新增 MCP', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, '{}')
    writeConfig(globalConfigFile, `{
  "mcp": {
    "global_default": { "type": "remote", "url": "https://global.example/mcp" }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.global_default)
      .toEqual({ type: 'remote', url: 'https://global.example/mcp' })

    writeConfig(projectConfigFile, `{
  "mcp": {
    "project_only": { "type": "remote", "url": "https://project.example/mcp" }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.project_only)
      .toEqual({ type: 'remote', url: 'https://project.example/mcp' })

    writeConfig(projectConfigFile, `{
  "mcp": {
    "project_remote_inferred": { "url": "https://project.example/inferred" }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.project_remote_inferred)
      .toEqual({ type: 'remote', url: 'https://project.example/inferred' })

    writeConfig(projectConfigFile, `{
  "mcp": {
    "project_local": { "type": "local", "command": ["node", "server.js"] }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.project_local)
      .toEqual({ type: 'local', command: ['node', 'server.js'] })

    writeConfig(projectConfigFile, `{
  "mcp": {
    "project_local_inferred": { "command": ["node", "server.js"] }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.project_local_inferred)
      .toEqual({ type: 'local', command: ['node', 'server.js'] })
  })

  it('应该校验最终 MCP 配置必须包含 type 对应的必要字段', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')

    writeConfig(builtinConfigFile, '{ "mcp": { "invalid_remote": { "type": "remote" } } }')
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /remote MCP "invalid_remote" 必须声明 url/,
    )

    writeConfig(builtinConfigFile, '{ "mcp": { "invalid_local": { "type": "local" } } }')
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /local MCP "invalid_local" 必须声明 command/,
    )
  })

  it('应该允许项目级 MCP 覆盖连接配置', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "enabled": true }
  }
}`)

    writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "url": "https://project.example/mcp", "headers": { "X-AE-Test": "1" } }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.context7)
      .toEqual({
        type: 'remote',
        url: 'https://project.example/mcp',
        enabled: true,
        headers: { 'X-AE-Test': '1' },
      })
  })

  it('应该允许项目级 MCP 显式切换 type 并整体替换配置', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "enabled": true }
  }
}`)

    writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "type": "local", "command": ["node", "server.js"] }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.context7)
      .toEqual({ type: 'local', command: ['node', 'server.js'] })
  })

  it('应该允许项目级覆盖 enabled 字段', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "enabled": true }
  }
}`)

    writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "enabled": false }
  }
}`)
    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.context7)
      .toMatchObject({ enabled: false })

    writeConfig(globalConfigFile, `{
  "mcp": {
    "context7": { "enabled": false }
  }
}`)
    writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "enabled": true }
  }
}`)

    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.context7)
      .toMatchObject({ enabled: true })

    for (const value of ['"true"', '1', '{}']) {
      writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "enabled": ${value} }
  }
}`)

      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /builtin-opencode MCP "context7" 的 enabled 必须是 boolean/,
      )
    }
  })

  it('应该校验最终 MCP enabled 和 timeout 字段类型与范围', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')

    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "enabled": "true" }
  }
}`)
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /builtin-opencode MCP "context7" 的 enabled 必须是 boolean/,
    )

    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "timeout": "1000" }
  }
}`)
    expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
      /builtin-opencode MCP "context7" 的 timeout 必须是 1000-120000 之间的整数毫秒/,
    )

    for (const timeout of ['-1', '0', '999', '1000.5', '120001']) {
      writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "timeout": ${timeout} }
  }
}`)

      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /builtin-opencode MCP "context7" 的 timeout 必须是 1000-120000 之间的整数毫秒/,
      )
    }

    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "timeout": 1000 }
  }
}`)
    expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.context7)
      .toMatchObject({ timeout: 1000 })
  })

  it('应该阻断项目级 MCP 使用异常 timeout 覆盖已有条目', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, '.opencode', 'ae.jsonc')
    writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "https://builtin.example/mcp", "timeout": 5000 }
  }
}`)

    for (const timeout of ['-1', '0', '999', '120001']) {
      writeConfig(projectConfigFile, `{
  "mcp": {
    "context7": { "timeout": ${timeout} }
  }
}`)

      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /builtin-opencode MCP "context7" 的 timeout 必须是 1000-120000 之间的整数毫秒/,
      )
    }
  })

  it('应该阻断 remote MCP 使用无效 URL 结构或内嵌凭证', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')

    for (const url of [
      'file:///tmp/server',
      'https://user:pass@example.com/mcp',
    ]) {
      writeConfig(builtinConfigFile, `{
  "mcp": {
    "context7": { "type": "remote", "url": "${url}" }
  }
}`)

      expect(() => loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile })).toThrow(
        /builtin-opencode remote MCP "context7" 的 url/,
      )
    }
  })

  it('应该允许用户配置任意 http 或 https remote MCP 主机', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    const globalConfigFile = join(root, 'global.jsonc')
    const projectConfigFile = join(root, 'project.jsonc')
    for (const [name, url] of [
      ['localhost', 'http://localhost:3000/mcp'],
      ['unspecified_ipv4', 'http://0.0.0.0/mcp'],
      ['loopback', 'http://127.0.0.1:3000/mcp'],
      ['private_ip', 'http://10.0.0.1/mcp'],
      ['private_172', 'http://172.16.0.1/mcp'],
      ['private_192', 'https://192.168.1.1/mcp'],
      ['carrier_nat', 'http://100.64.0.1/mcp'],
      ['benchmark', 'http://198.18.0.1/mcp'],
      ['metadata_ip', 'http://169.254.169.254/latest/meta-data'],
      ['metadata_host', 'http://metadata.google.internal/computeMetadata/v1'],
      ['localhost_subdomain', 'http://api.localhost/mcp'],
      ['ipv6_loopback', 'http://[::1]/mcp'],
      ['ipv6_unspecified', 'http://[::]/mcp'],
      ['ipv6_unique_local', 'http://[fc00::1]/mcp'],
      ['ipv6_unique_local_fd', 'http://[fd00::1]/mcp'],
      ['ipv6_link_local', 'http://[fe80::1]/mcp'],
      ['ipv6_link_local_mid', 'http://[fe90::1]/mcp'],
      ['ipv6_link_local_end', 'http://[febf::1]/mcp'],
      ['ipv4_mapped_ipv6', 'http://[::ffff:127.0.0.1]/mcp'],
      ['ipv4_mapped_ipv6_hex_loopback', 'http://[::ffff:7f00:1]/mcp'],
      ['ipv4_mapped_ipv6_hex_carrier_nat', 'http://[::ffff:6440:1]/mcp'],
      ['ipv4_mapped_ipv6_hex_benchmark', 'http://[::ffff:c612:1]/mcp'],
    ]) {
      writeConfig(builtinConfigFile, `{
  "mcp": {
    "${name}": { "type": "remote", "url": "${url}" }
  }
}`)

      expect(loadBuiltinOpencodeConfig({ builtinConfigFile, globalConfigFile, projectConfigFile }).mcp?.[name])
        .toEqual({ type: 'remote', url })
    }
  })

  it('应该把插件内置文件缺失视为插件内置配置错误', () => {
    const root = createTempRoot()

    expect(() => loadBuiltinOpencodeConfig({
      builtinConfigFile: join(root, 'missing-builtin.jsonc'),
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile: join(root, 'missing-project.jsonc'),
    })).toThrow(/插件内置 builtin-opencode 配置文件不存在/)
  })

  it('应该把插件内置文件解析失败视为插件内置配置错误', () => {
    const root = createTempRoot()
    const builtinConfigFile = join(root, 'ae.jsonc')
    writeConfig(builtinConfigFile, '{')

    expect(() => loadBuiltinOpencodeConfig({
      builtinConfigFile,
      globalConfigFile: join(root, 'missing-global.jsonc'),
      projectConfigFile: join(root, 'missing-project.jsonc'),
    })).toThrow(/插件内置 builtin-opencode 配置解析失败/)
  })

  it('应该从宿主 worktree 解析项目级配置且不复用 manifest.repoRoot', () => {
    const pluginRoot = createTempRoot()
    const hostRoot = createTempRoot()
    const manifest = createManifest(pluginRoot)

    const paths = resolveBuiltinOpencodeConfigPaths(manifest, hostRoot)

    expect(paths.builtinConfigFile).toBe(join(pluginRoot, 'dist', 'src', 'assets', 'config', 'ae.jsonc'))
    expect(paths.projectConfigFile).toBe(join(hostRoot, '.opencode', 'ae.jsonc'))
  })

  it('桥接安装场景应该区分插件内置配置和宿主项目配置', () => {
    const pluginRoot = createTempRoot()
    const hostRoot = createTempRoot()
    const manifest = createManifest(pluginRoot)
    const paths = resolveBuiltinOpencodeConfigPaths(manifest, hostRoot)
    writeConfig(paths.builtinConfigFile, '{ "mcp": { "context7": { "type": "remote", "url": "https://builtin.example/mcp" } } }')
    writeConfig(paths.projectConfigFile, '{ "mcp": { "context7": { "enabled": false } } }')

    const config = loadBuiltinOpencodeConfig(paths)

    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://builtin.example/mcp',
      enabled: false,
    })
  })

  it('应该通过解析路径读取真实全局 builtin-opencode 配置', () => {
    const pluginRoot = createTempRoot()
    const hostRoot = createTempRoot()
    const homeRoot = createTempRoot()
    vi.stubEnv('USERPROFILE', homeRoot)
    vi.stubEnv('HOME', homeRoot)
    const paths = resolveBuiltinOpencodeConfigPaths(createManifest(pluginRoot), hostRoot)
    writeConfig(paths.builtinConfigFile, '{ "mcp": { "context7": { "type": "remote", "url": "https://builtin.example/mcp" } } }')
    writeConfig(paths.globalConfigFile, '{ "mcp": { "global_default": { "type": "remote", "url": "https://global.example/mcp" } } }')
    writeConfig(paths.projectConfigFile, '{ "mcp": { "context7": { "enabled": false } } }')

    const config = loadBuiltinOpencodeConfig(paths)

    expect(paths.globalConfigFile).toBe(join(homeRoot, '.config', 'opencode', 'ae.jsonc'))
    expect(config.mcp?.global_default).toEqual({ type: 'remote', url: 'https://global.example/mcp' })
    expect(config.mcp?.context7).toEqual({
      type: 'remote',
      url: 'https://builtin.example/mcp',
      enabled: false,
    })
  })
})
