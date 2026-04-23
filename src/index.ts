import type { PluginModule } from '@opencode-ai/plugin'

import { registerAgents } from './services/agent-registration.js'
import { buildCommandConfig } from './services/command-registration.js'
import { registerRulesInstructions } from './services/rules-instructions-service.js'
import { createRuntimeAssetManifest } from './services/runtime-asset-manifest.js'
import { registerSkillsPath } from './services/skills-path-service.js'
import { createToolRegistry } from './tools/index.js'
import { setGlobalClient } from './services/client-holder.js'

interface RuntimeConfigShape {
  command?: Record<string, {
    template: string
    description?: string
  }>
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: 'subagent' | 'primary' | 'all'
    [key: string]: unknown
  } | undefined>
  skills?: {
    paths?: string[]
  }
  instructions?: string[]
}

function mergeCommandConfig(config: RuntimeConfigShape, manifest = createRuntimeAssetManifest(import.meta.url)): void {
  config.command = {
    ...(config.command ?? {}),
    ...buildCommandConfig(manifest.commandsDir),
  }
}

const plugin: PluginModule = {
  id: 'ae-server',
  server: async (input) => {
    const manifest = createRuntimeAssetManifest(import.meta.url)
    setGlobalClient(input.client)

    return {
      config: async (config) => {
        registerSkillsPath(config as RuntimeConfigShape, manifest)
        mergeCommandConfig(config as RuntimeConfigShape, manifest)
        registerAgents(config as RuntimeConfigShape, manifest)
        registerRulesInstructions(config as RuntimeConfigShape, manifest)
      },
      tool: createToolRegistry(),
    }
  },
}

export default plugin
