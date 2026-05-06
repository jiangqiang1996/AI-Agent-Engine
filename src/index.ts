import type { Config, PluginModule } from '@opencode-ai/plugin'

import { registerAgents } from './services/agent-registration.js'
import { buildCommandConfig, mergeBuiltinAndUserCommands } from './services/command-registration.js'
import { registerMcp } from './services/mcp-registration.js'
import {
  collectModelScenarioSources,
  resolveBuiltinOpencodeConfigPaths,
} from './services/builtin-opencode-config-service.js'
import {
  createModelScenarioRoutingContext,
  type UnresolvedModelReference,
} from './services/model-scenario-routing-service.js'
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

interface ToastClientShape {
  tui?: {
    showToast?: (args: {
      body: {
        variant?: 'success' | 'error' | 'warning' | 'info'
        title?: string
        message: string
        duration?: number
      }
    }) => Promise<unknown>
  }
}

function resolveHostWorktree(input: unknown): string {
  const maybeInput = input as { worktree?: unknown }
  return typeof maybeInput.worktree === 'string' && maybeInput.worktree ? maybeInput.worktree : process.cwd()
}

function mergeCommandConfigWithRouting(
  config: RuntimeConfigShape,
  manifest: ReturnType<typeof createRuntimeAssetManifest>,
  hostWorktree: string,
  client: ToastClientShape,
): void {
  const routingContext = createModelScenarioRoutingContext(
    collectModelScenarioSources(resolveBuiltinOpencodeConfigPaths(manifest, hostWorktree)),
  )
  config.command = mergeBuiltinAndUserCommands(buildCommandConfig(manifest.commandsDir, routingContext), config.command)
  registerAgents(config, manifest, routingContext)
  notifyUnresolvedModelReferences(client, routingContext.unresolvedReferences)
}

function notifyUnresolvedModelReferences(client: ToastClientShape, references: UnresolvedModelReference[]): void {
  if (!client.tui?.showToast || references.length === 0) {
    return
  }

  const examples = references.slice(0, 3)
    .map((reference) => `${reference.assetLabel}: ${reference.reference}`)
    .join('；')
  const omittedCount = references.length - 3
  const suffix = omittedCount > 0 ? `；另有 ${omittedCount} 项` : ''
  void client.tui.showToast({
    body: {
      variant: 'warning',
      title: 'AE 模型场景未配置',
      message: `有 ${references.length} 个内置资产声明的模型场景未配置，将使用 opencode 默认模型：${examples}${suffix}。`,
      duration: 6000,
    },
  }).catch(() => undefined)
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
        mergeCommandConfigWithRouting(
          config as RuntimeConfigShape,
          manifest,
          hostWorktree,
          input.client as ToastClientShape,
        )
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
