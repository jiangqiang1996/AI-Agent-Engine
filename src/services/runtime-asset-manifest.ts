import { join, resolve } from 'node:path'

import { getAllAgentDefinitions, getPhaseOneEntries } from './ae-catalog.js'
import { resolveRepoRootFromModuleUrl } from '../utils/path-utils.js'

export interface RuntimeAssetManifest {
  repoRoot: string
  skillsDir: string
  rulesDir: string
  commandsDir: string
  agentsDir: string
  runtimeCommandDir: string
  runtimeAgentDir: string
  runtimePluginDir: string
  runtimeCommandFiles: Array<{ source: string; target: string }>
  runtimeAgentFiles: Array<{ source: string; target: string }>
}

export function createRuntimeAssetManifestFromRoot(repoRoot: string): RuntimeAssetManifest {
  const resolvedRoot = resolve(repoRoot)
  const runtimeCommandDir = join(resolvedRoot, '.opencode', 'commands')
  const runtimeAgentDir = join(resolvedRoot, '.opencode', 'agents', 'ae')

  return {
    repoRoot: resolvedRoot,
    skillsDir: join(resolvedRoot, 'skills'),
    rulesDir: join(resolvedRoot, 'rules'),
    commandsDir: join(resolvedRoot, 'commands'),
    agentsDir: join(resolvedRoot, 'agents'),
    runtimeCommandDir,
    runtimeAgentDir,
    runtimePluginDir: join(resolvedRoot, '.opencode', 'plugins'),
    runtimeCommandFiles: getPhaseOneEntries().map((entry) => ({
      source: join(resolvedRoot, entry.commandFile),
      target: join(runtimeCommandDir, `${entry.commandName}.md`),
    })),
    runtimeAgentFiles: getAllAgentDefinitions().map((agent) => ({
      source: join(resolvedRoot, agent.path),
      target: join(runtimeAgentDir, agent.stage, `${agent.name}.md`),
    })),
  }
}

export function createRuntimeAssetManifest(moduleUrl: string): RuntimeAssetManifest {
  return createRuntimeAssetManifestFromRoot(resolveRepoRootFromModuleUrl(moduleUrl))
}
