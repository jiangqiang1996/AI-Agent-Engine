import type {Config, Plugin, Hooks} from '@opencode-ai/plugin'
import {join, resolve, basename, dirname} from 'node:path'

import {isInsideRoot, isSamePath} from './utils/path-utils.js'

import {registerAgents} from './services/agent-registration.js'
import {
    buildCommandConfig,
    mergeDynamicCommands,
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
import {degradeMediaFileParts} from './services/media-degradation-service.js'
import {getCapabilityBySession} from './services/model-capability-cache.js'
import {chatMessageHook} from './hooks/media-fallback-chat-message.hook.js'
import {messagesTransformHook} from './hooks/media-fallback-messages-transform.hook.js'
import {createLocalDepsInjectionHook} from './hooks/local-deps-injection.hook.js'
import {createMdReadEnhancementHook} from './hooks/md-read-enhancement.hook.js'
import {dispatchSessionEvent, extractSessionID} from './services/event-bus.js'

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
    const pluginModuleDir = resolve(manifest.moduleDir)
    const worktree = resolve(hostWorktree)

    if (isSamePath(pluginRoot, worktree)) {
        return true
    }

    if (basename(pluginModuleDir) !== 'plugins') {
        return false
    }

    const pluginsParent = dirname(pluginModuleDir)
    return isSamePath(dirname(pluginsParent), worktree)
}

function mergeCommandConfigWithRouting(
    config: RuntimeConfigShape,
    manifest: ReturnType<typeof createRuntimeAssetManifest>,
    hostWorktree: string,
): void {
    const isProjectInstall = isProjectPluginInstall(manifest, hostWorktree)
    const configPaths = resolveBuiltinOpencodeConfigPaths(manifest, hostWorktree)
    const routingContext = createModelScenarioRoutingContext(
        collectModelScenarioSources(configPaths),
    )
    setModelScenarioRoutingContext(routingContext)
    setBrainstormConfig(collectBrainstormSources(configPaths))
    const dynamicHasPriority = isProjectInstall
    config.command = mergeDynamicCommands(buildCommandConfig(manifest.commandsDir, routingContext), config.command, dynamicHasPriority)
    registerAgents(config, manifest, dynamicHasPriority, routingContext)
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

/**
 * 组合多个 tool.execute.after hook，按顺序执行。
 * 前一个 hook 对 output 的修改会传递给后一个 hook。
 */
function createComposedAfterHook(
    ...hooks: Array<NonNullable<Hooks['tool.execute.after']>>
): NonNullable<Hooks['tool.execute.after']> {
    return async (input, output) => {
        for (const hook of hooks) {
            try {
                await hook(input, output)
            } catch (error) {
                console.warn('[ae] composed after hook 执行失败:', error)
            }
        }
    }
}

const plugin: Plugin = async (input) => {
    const manifest = createRuntimeAssetManifest(import.meta.url)
    const hostWorktree = input.worktree
    // 直接复用 opencode 主进程注入的 client，确保进程内/HTTP 两种模式下均可正常通信
    setGlobalClient(input.client)

    return {
        config: async (config) => {
            await registerSkillsPath(config as RuntimeConfigShape, manifest)
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
                const caps = await getCapabilityBySession(input.sessionID)
                degradeMediaFileParts(output.parts, caps)
                dedupeCommandFileArgumentParts(output.parts)
            } catch {
                // 降级失败时不阻断命令执行
            }
        },
        'chat.message': chatMessageHook,
        'experimental.chat.messages.transform': messagesTransformHook,
        'tool.execute.after': createComposedAfterHook(
            createLocalDepsInjectionHook(input.worktree),
            createMdReadEnhancementHook(),
        ),
        event: async (eventInput) => {
            const sessionID = extractSessionID({
                type: eventInput.event.type,
                properties: eventInput.event.properties as Record<string, unknown>,
            })
            if (sessionID) {
                dispatchSessionEvent({
                    type: eventInput.event.type,
                    sessionID,
                    properties: eventInput.event.properties as Record<string, unknown>,
                    raw: eventInput.event,
                })
            }
        },
        tool: createToolRegistry(),
    }
}

export default plugin
