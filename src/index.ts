import type {Config, Plugin} from '@opencode-ai/plugin'
import {join, resolve} from 'node:path'

import {isInsideRoot} from './utils/path-utils.js'

import {registerAgents} from './services/agent-registration.js'
import {
    buildCommandConfig,
    mergeDynamicCommands,
    mergeProjectCommandOverrides,
} from './services/command-registration.js'
import {registerMcp} from './services/mcp-registration.js'
import {
    collectModelScenarioSources,
    collectBrainstormSources,
    resolveBuiltinOpencodeConfigPaths,
} from './services/builtin-opencode-config-service.js'
import {createModelScenarioRoutingContext, resolveModelReference,} from './services/model-scenario-routing-service.js'
import { setModelScenarioRoutingContext } from './services/model-scenario-holder.js'
import { setBrainstormConfig } from './services/brainstorm-config-holder.js'
import {registerRulesInstructions} from './services/rules-instructions-service.js'
import {injectBuiltinRulesIntoSystem} from './services/rules-system-transform-service.js'
import {createRuntimeAssetManifest} from './services/runtime-asset-manifest.js'
import {registerSkillsPath} from './services/skills-path-service.js'
import {createToolRegistry} from './tools/index.js'
import {setGlobalClient} from './services/client-holder.js'
import {dedupeCommandFileArgumentParts} from './services/command-file-argument-dedupe-service.js'
import {convertUnsupportedFilePartsToPath} from './services/command-file-argument-path-service.js'
import {getCapabilitiesBySession} from './services/model-capability-cache.js'
import {chatMessageHook} from './hooks/media-fallback-chat-message.hook.js'
import {messagesTransformHook} from './hooks/media-fallback-messages-transform.hook.js'

interface RuntimeConfigShape {
    command?: Record<string, {
        template: string
        description?: string
        model?: string
        [key: string]: unknown
    }>
    agent?: Record<string, {
        description?: string
        prompt?: string
        mode?: 'subagent' | 'primary' | 'all'
        model?: string
        [key: string]: unknown
    } | undefined>
    skills?: {
        paths?: string[]
    }
    mcp?: Config['mcp']
    instructions?: string[]
}

function isProjectPluginInstall(manifest: ReturnType<typeof createRuntimeAssetManifest>, hostWorktree: string): boolean {
    const pluginRoot = resolve(manifest.repoRoot)
    const worktree = resolve(hostWorktree)

    return isSamePath(pluginRoot, worktree) || isInsideRoot(join(worktree, '.opencode', 'plugins'), pluginRoot)
}

function isSamePath(left: string, right: string): boolean {
    return normalizePath(left) === normalizePath(right)
}

function normalizePath(value: string): string {
    return resolve(value).replace(/\\/g, '/').toLowerCase()
}

function mergeCommandConfigWithRouting(
    config: RuntimeConfigShape,
    manifest: ReturnType<typeof createRuntimeAssetManifest>,
    hostWorktree: string,
): void {
    const configPaths = resolveBuiltinOpencodeConfigPaths(manifest, hostWorktree)
    const routingContext = createModelScenarioRoutingContext(
        collectModelScenarioSources(configPaths),
    )
    setModelScenarioRoutingContext(routingContext)
    setBrainstormConfig(collectBrainstormSources(configPaths))
    const dynamicHasPriority = isProjectPluginInstall(manifest, hostWorktree)
    config.command = mergeProjectCommandOverrides(
        mergeDynamicCommands(buildCommandConfig(manifest.commandsDir, routingContext), config.command, dynamicHasPriority),
        hostWorktree,
        routingContext,
    )
    registerAgents(config, manifest, hostWorktree, dynamicHasPriority, routingContext)
    resolveConfiguredModelReferences(config, routingContext)
}

function resolveConfiguredModelReferences(
    config: RuntimeConfigShape,
    routingContext: ReturnType<typeof createModelScenarioRoutingContext>,
): void {
    for (const [commandName, command] of Object.entries(config.command ?? {})) {
        if (!command.model) {
            continue
        }
        const resolvedModel = resolveModelReference(routingContext, command.model)
        if (resolvedModel) {
            command.model = resolvedModel
        } else {
            delete command.model
        }
    }

    for (const [agentName, agent] of Object.entries(config.agent ?? {})) {
        if (!agent?.model) {
            continue
        }
        const resolvedModel = resolveModelReference(routingContext, agent.model)
        if (resolvedModel) {
            agent.model = resolvedModel
        } else {
            delete agent.model
        }
    }
}

const plugin: Plugin = async (input) => {
    const manifest = createRuntimeAssetManifest(import.meta.url)
    const hostWorktree = input.worktree
    setGlobalClient(input.client)

    return {
        config: async (config) => {
            await registerSkillsPath(config as RuntimeConfigShape, manifest, hostWorktree)
            mergeCommandConfigWithRouting(
                config as RuntimeConfigShape,
                manifest,
                hostWorktree,
            )
            registerMcp(config as RuntimeConfigShape, manifest, hostWorktree)
            registerRulesInstructions(config as RuntimeConfigShape, manifest)
        },
        'experimental.chat.system.transform': async (_input, output) => {
            await injectBuiltinRulesIntoSystem(manifest, output)
        },
        'command.execute.before': async (input, output) => {
            try {
                const caps = await getCapabilitiesBySession(input.sessionID)
                convertUnsupportedFilePartsToPath(output.parts, caps)
                dedupeCommandFileArgumentParts(output.parts)
            } catch {
                // 降级失败时不阻断命令执行
            }
        },
        'chat.message': chatMessageHook,
        'experimental.chat.messages.transform': messagesTransformHook,
        tool: createToolRegistry(),
    }
}

export default plugin
