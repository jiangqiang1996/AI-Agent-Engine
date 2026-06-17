import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getAllAgentDefinitions } from './ae-catalog.js'
import { resolvePluginRootFromModuleUrl } from '../utils/path-utils.js'

const ASSET_DIRS = {
  SKILLS: 'skills',
  RULES: 'rules',
  COMMANDS: 'commands',
  CONFIG: 'config',
  AGENTS: 'agents',
  ASSETS: 'assets',
} as const

const RUNTIME_DIRS = {
  OPENCODE: '.opencode',
  AGENTS: 'agents',
  PLUGINS: 'plugins',
  AE: 'ae',
} as const

const CONFIG_FILENAME = 'ae.jsonc'

/** 插件运行时资产清单，包含技能、规则、命令、代理等目录路径和代理文件映射。 */
export interface RuntimeAssetManifest {
  repoRoot: string
  skillsDir: string
  rulesDir: string
  commandsDir: string
  builtinConfigFile: string
  toolsDir: string
  agentsDir: string
  runtimeAgentDir: string
  runtimePluginDir: string
  runtimeAgentFiles: Array<{ source: string; target: string }>
}

function buildRuntimeAgentFiles(agentsDir: string, runtimeAgentDir: string): Array<{ source: string; target: string }> {
  return getAllAgentDefinitions().map((agent) => ({
    source: join(agentsDir, agent.path),
    target: join(runtimeAgentDir, agent.path),
  }))
}

function resolveRuntimeAssetsDir(repoRoot: string, moduleDir: string): string {
  const candidates = [
    join(moduleDir, ASSET_DIRS.ASSETS),
    join(repoRoot, 'dist', 'src', ASSET_DIRS.ASSETS),
    join(repoRoot, 'src', ASSET_DIRS.ASSETS),
  ]

  return candidates.find((dir) => existsSync(dir)) ?? candidates[1]
}

function resolveAssetsDirFromRoot(repoRoot: string): string {
  const candidates = [
    join(repoRoot, 'dist', 'src', ASSET_DIRS.ASSETS),
    join(repoRoot, 'src', ASSET_DIRS.ASSETS),
  ]

  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]
}

/**
 * 基于仓库根目录创建运行时资产清单（适用于 postbuild 等已知 `dist` 布局的场景）。
 * 优先查找 `dist/src/assets`，回退到 `src/assets`。
 */
export function createRuntimeAssetManifestFromRoot(repoRoot: string): RuntimeAssetManifest {
  const root = resolve(repoRoot)
  const runtimeAgentDir = join(root, RUNTIME_DIRS.OPENCODE, RUNTIME_DIRS.AGENTS, RUNTIME_DIRS.AE)
  const assetsDir = resolveAssetsDirFromRoot(root)
  const agentsDir = join(assetsDir, ASSET_DIRS.AGENTS)

  return {
    repoRoot: root,
    skillsDir: join(assetsDir, ASSET_DIRS.SKILLS),
    rulesDir: join(assetsDir, ASSET_DIRS.RULES),
    commandsDir: join(assetsDir, ASSET_DIRS.COMMANDS),
    builtinConfigFile: join(assetsDir, ASSET_DIRS.CONFIG, CONFIG_FILENAME),
    toolsDir: join(root, 'tools'),
    agentsDir,
    runtimeAgentDir,
    runtimePluginDir: join(root, RUNTIME_DIRS.OPENCODE, RUNTIME_DIRS.PLUGINS),
    runtimeAgentFiles: buildRuntimeAgentFiles(agentsDir, runtimeAgentDir),
  }
}

/**
 * 基于模块 URL 创建运行时资产清单（适用于插件运行时加载场景）。
 * 优先查找模块同级的 `assets` 目录，再回退到 `dist/src/assets` 和 `src/assets`。
 */
export function createRuntimeAssetManifest(moduleUrl: string): RuntimeAssetManifest {
  const root = resolvePluginRootFromModuleUrl(moduleUrl)
  const moduleDir = dirname(fileURLToPath(moduleUrl))
  const runtimeAgentDir = join(root, RUNTIME_DIRS.OPENCODE, RUNTIME_DIRS.AGENTS, RUNTIME_DIRS.AE)
  const assetsDir = resolveRuntimeAssetsDir(root, moduleDir)
  const agentsDir = join(assetsDir, ASSET_DIRS.AGENTS)

  return {
    repoRoot: root,
    skillsDir: join(assetsDir, ASSET_DIRS.SKILLS),
    rulesDir: join(assetsDir, ASSET_DIRS.RULES),
    commandsDir: join(assetsDir, ASSET_DIRS.COMMANDS),
    builtinConfigFile: join(assetsDir, ASSET_DIRS.CONFIG, CONFIG_FILENAME),
    toolsDir: join(root, 'tools'),
    agentsDir,
    runtimeAgentDir,
    runtimePluginDir: join(root, RUNTIME_DIRS.OPENCODE, RUNTIME_DIRS.PLUGINS),
    runtimeAgentFiles: buildRuntimeAgentFiles(agentsDir, runtimeAgentDir),
  }
}
