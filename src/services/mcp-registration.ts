import { readFileSync } from 'node:fs'

import type { Config } from '@opencode-ai/plugin'
import stripJsonComments from 'strip-json-comments'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

type McpConfig = NonNullable<Config['mcp']>

interface BuiltinMcpConfigFile {
  $schema?: string
  mcp?: McpConfig
}

interface McpConfigShape {
  mcp?: Config['mcp']
}

/**
 * 读取内置 opencode JSONC 配置文件中的 MCP 节点。
 * 配置结构由文件中的本地 `$schema` 校验，运行时只读取 `mcp` 节点。
 */
export function loadBuiltinMcpConfig(manifest: RuntimeAssetManifest): McpConfig {
  const filePath = manifest.builtinConfigFile
  const raw = readFileSync(filePath, 'utf8')

  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonComments(raw))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`内置 opencode 配置解析失败: ${filePath} (${message})`)
  }

  if (!parsed || typeof parsed !== 'object') {
    return {}
  }

  return ((parsed as BuiltinMcpConfigFile).mcp ?? {})
}

/**
 * 合并内置 MCP 默认值与用户已有配置。
 * 内置配置优先级最低；同名同类型浅合并，同名跨类型整条替换为用户配置。
 */
export function mergeBuiltinAndUserMcp(builtinMcp: McpConfig, userMcp: Config['mcp'] | undefined): McpConfig {
  if (!userMcp) {
    return { ...builtinMcp }
  }

  const merged: McpConfig = { ...builtinMcp }

  for (const [name, userEntry] of Object.entries(userMcp)) {
    const builtinEntry = merged[name]
    if (!builtinEntry || builtinEntry.type !== userEntry.type) {
      merged[name] = userEntry
      continue
    }

    merged[name] = {
      ...builtinEntry,
      ...userEntry,
    }
  }

  return merged
}

/**
 * 将内置 MCP 默认配置注册到 opencode 运行时配置。
 */
export function registerMcp(config: McpConfigShape, manifest: RuntimeAssetManifest): void {
  config.mcp = mergeBuiltinAndUserMcp(loadBuiltinMcpConfig(manifest), config.mcp)
}
