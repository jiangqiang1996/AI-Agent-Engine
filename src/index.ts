import type {Config, Plugin} from '@opencode-ai/plugin'
import {createOpencodeClient} from '@opencode-ai/sdk/v2'
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
import {degradeMediaFileParts} from './services/media-degradation-service.js'
import {getCapabilityBySession} from './services/model-capability-cache.js'
import {chatMessageHook} from './hooks/media-fallback-chat-message.hook.js'
import {messagesTransformHook} from './hooks/media-fallback-messages-transform.hook.js'
import {createLocalDepsInjectionHook} from './hooks/local-deps-injection.hook.js'
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
    // 创建 v2 SDK client，复用 opencode 主进程的 serverUrl 和 directory
    // auth headers 与 opencode ServerAuth.headers() 逻辑一致：仅在有密码时注入
    const authPassword = process.env.OPENCODE_SERVER_PASSWORD
    const v2ClientConfig: Parameters<typeof createOpencodeClient>[0] = {
        baseUrl: input.serverUrl.toString(),
        directory: input.directory,
    }
    if (authPassword) {
        const authUsername = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode'
        v2ClientConfig.headers = {
            Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString('base64')}`,
        }
    }
    setGlobalClient(createOpencodeClient(v2ClientConfig))

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
                const caps = await getCapabilityBySession(input.sessionID)
                degradeMediaFileParts(output.parts, caps)
                dedupeCommandFileArgumentParts(output.parts)
            } catch {
                // 降级失败时不阻断命令执行
            }
        },
        'chat.message': chatMessageHook,
        'experimental.chat.messages.transform': messagesTransformHook,
        'tool.execute.after': createLocalDepsInjectionHook(input.worktree),
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
