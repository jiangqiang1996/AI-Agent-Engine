import type { Config } from '@opencode-ai/plugin'

import {
  loadBuiltinMcpConfigFromPaths,
  resolveBuiltinOpencodeConfigPaths,
} from './builtin-opencode-config-service.js'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

type McpConfig = NonNullable<Config['mcp']>

interface McpConfigShape {
  mcp?: Config['mcp']
}

/**
 * 读取三层 builtin-opencode JSONC 配置合并后的 MCP 节点。
 */
export function loadBuiltinMcpConfig(manifest: RuntimeAssetManifest, worktree: string): McpConfig {
  return loadBuiltinMcpConfigFromPaths(resolveBuiltinOpencodeConfigPaths(manifest, worktree))
}

/**
 * 合并内置 MCP 默认值与用户已有配置。
 * opencode 既有配置优先级最高；同名项整条采用用户配置，不继承内置字段。
 */
export function mergeBuiltinAndUserMcp(builtinMcp: McpConfig, userMcp: Config['mcp'] | undefined): McpConfig {
  if (!userMcp) {
    return { ...builtinMcp }
  }

  const merged: McpConfig = { ...builtinMcp }

  for (const [name, userEntry] of Object.entries(userMcp)) {
    merged[name] = userEntry
  }

  return merged
}

/**
 * 将内置 MCP 默认配置注册到 opencode 运行时配置。
 */
export function registerMcp(
  config: McpConfigShape,
  manifest: RuntimeAssetManifest,
  worktree: string,
): void {
  config.mcp = mergeBuiltinAndUserMcp(loadBuiltinMcpConfig(manifest, worktree), config.mcp)
}
