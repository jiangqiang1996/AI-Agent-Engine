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
  const root = resolve(repoRoot)
  const runtimeAgentDir = join(root, '.opencode', 'agents', 'ae')

  return {
    repoRoot: root,
    skillsDir: join(root, 'skills'),
    rulesDir: join(root, 'rules'),
    commandsDir: join(root, 'commands'),
    toolsDir: join(root, 'tools'),
    agentsDir: join(root, 'agents'),
    runtimeAgentDir,
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: getAllAgentDefinitions().map((agent) => ({
      source: join(root, agent.path),
      target: join(runtimeAgentDir, agent.stage, `${agent.name}.md`),
    })),
  }
}

export function createRuntimeAssetManifest(moduleUrl: string): RuntimeAssetManifest {
  return createRuntimeAssetManifestFromRoot(resolveRepoRootFromModuleUrl(moduleUrl))
}
