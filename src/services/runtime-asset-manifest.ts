import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getAllAgentDefinitions } from './ae-catalog.js'
import { resolveRepoRootFromModuleUrl } from '../utils/path-utils.js'

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
    source: join(agentsDir, agent.stage, `${agent.name}.md`),
    target: join(runtimeAgentDir, agent.stage, `${agent.name}.md`),
  }))
}

function resolveRuntimeAssetsDir(repoRoot: string, moduleDir: string): string {
  const candidates = [
    join(moduleDir, 'assets'),
    join(repoRoot, 'dist', 'src', 'assets'),
    join(repoRoot, 'src', 'assets'),
  ]

  return candidates.find((dir) => existsSync(dir)) ?? candidates[1]
}

export function createRuntimeAssetManifestFromRoot(repoRoot: string): RuntimeAssetManifest {
  const root = resolve(repoRoot)
  const runtimeAgentDir = join(root, '.opencode', 'agents', 'ae')
  const agentsDir = join(root, 'src', 'assets', 'agents')

  return {
    repoRoot: root,
    skillsDir: join(root, 'src', 'assets', 'skills'),
    rulesDir: join(root, 'src', 'assets', 'rules'),
    commandsDir: join(root, 'src', 'assets', 'commands'),
    builtinConfigFile: join(root, 'src', 'assets', 'config', 'builtin-opencode.jsonc'),
    toolsDir: join(root, 'tools'),
    agentsDir,
    runtimeAgentDir,
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: buildRuntimeAgentFiles(agentsDir, runtimeAgentDir),
  }
}

export function createRuntimeAssetManifest(moduleUrl: string): RuntimeAssetManifest {
  const root = resolveRepoRootFromModuleUrl(moduleUrl)
  const moduleDir = dirname(fileURLToPath(moduleUrl))
  const runtimeAgentDir = join(root, '.opencode', 'agents', 'ae')
  const assetsDir = resolveRuntimeAssetsDir(root, moduleDir)
  const agentsDir = join(assetsDir, 'agents')

  return {
    repoRoot: root,
    skillsDir: join(assetsDir, 'skills'),
    rulesDir: join(assetsDir, 'rules'),
    commandsDir: join(assetsDir, 'commands'),
    builtinConfigFile: join(assetsDir, 'config', 'builtin-opencode.jsonc'),
    toolsDir: join(root, 'tools'),
    agentsDir,
    runtimeAgentDir,
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: buildRuntimeAgentFiles(agentsDir, runtimeAgentDir),
  }
}
