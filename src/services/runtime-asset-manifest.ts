import { join, resolve } from 'node:path'

import { getAllAgentDefinitions } from './ae-catalog.js'
import { resolveRepoRootFromModuleUrl } from '../utils/path-utils.js'

export interface RuntimeAssetManifest {
  repoRoot: string
  skillsDir: string
  rulesDir: string
  commandsDir: string
  toolsDir: string
  agentsDir: string
  runtimeAgentDir: string
  runtimePluginDir: string
  runtimeAgentFiles: Array<{ source: string; target: string }>
}

export function createRuntimeAssetManifestFromRoot(repoRoot: string): RuntimeAssetManifest {
  const resolvedRoot = resolve(repoRoot)
  const runtimeAgentDir = join(resolvedRoot, '.opencode', 'agents', 'ae')

  return {
    repoRoot: resolvedRoot,
    skillsDir: join(resolvedRoot, 'skills'),
    rulesDir: join(resolvedRoot, 'rules'),
    commandsDir: join(resolvedRoot, 'commands'),
    toolsDir: join(resolvedRoot, 'tools'),
    agentsDir: join(resolvedRoot, 'agents'),
    runtimeAgentDir,
    runtimePluginDir: join(resolvedRoot, '.opencode', 'plugins'),
    runtimeAgentFiles: getAllAgentDefinitions().map((agent) => ({
      source: join(resolvedRoot, agent.path),
      target: join(runtimeAgentDir, agent.stage, `${agent.name}.md`),
    })),
  }
}

export function createRuntimeAssetManifest(moduleUrl: string): RuntimeAssetManifest {
  return createRuntimeAssetManifestFromRoot(resolveRepoRootFromModuleUrl(moduleUrl))
}
