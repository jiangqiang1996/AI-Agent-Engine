import type { Config, PluginModule } from '@opencode-ai/plugin'

import { registerAgents } from './services/agent-registration.js'
import { buildCommandConfig, mergeBuiltinAndUserCommands } from './services/command-registration.js'
import { registerMcp } from './services/mcp-registration.js'
import {
  collectModelScenarioSources,
  resolveBuiltinOpencodeConfigPaths,
} from './services/builtin-opencode-config-service.js'
import { createModelScenarioRoutingContext } from './services/model-scenario-routing-service.js'
import { registerRulesInstructions } from './services/rules-instructions-service.js'
import { injectBuiltinRulesIntoSystem } from './services/rules-system-transform-service.js'
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
  mcp?: Config['mcp']
  instructions?: string[]
}

function resolveHostWorktree(input: unknown): string {
  const maybeInput = input as { worktree?: unknown }
  return typeof maybeInput.worktree === 'string' && maybeInput.worktree ? maybeInput.worktree : process.cwd()
}

function mergeCommandConfigWithRouting(
  config: RuntimeConfigShape,
  manifest: ReturnType<typeof createRuntimeAssetManifest>,
  hostWorktree: string,
): void {
  const routingContext = createModelScenarioRoutingContext(
    collectModelScenarioSources(resolveBuiltinOpencodeConfigPaths(manifest, hostWorktree)),
  )
  config.command = mergeBuiltinAndUserCommands(buildCommandConfig(manifest.commandsDir, routingContext), config.command)
  registerAgents(config, manifest, routingContext)
}

const plugin: PluginModule = {
  id: 'ae-server',
  server: async (input) => {
    const manifest = createRuntimeAssetManifest(import.meta.url)
    const hostWorktree = resolveHostWorktree(input)
    setGlobalClient(input.client)

    return {
      config: async (config) => {
        await registerSkillsPath(config as RuntimeConfigShape, manifest)
        mergeCommandConfigWithRouting(config as RuntimeConfigShape, manifest, hostWorktree)
        registerMcp(config as RuntimeConfigShape, manifest, hostWorktree)
        registerRulesInstructions(config as RuntimeConfigShape, manifest)
      },
      'experimental.chat.system.transform': async (_input, output) => {
        await injectBuiltinRulesIntoSystem(manifest, output)
      },
      tool: createToolRegistry(),
    }
  },
}

export default plugin
