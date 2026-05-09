import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getAllAgentDefinitions } from './ae-catalog.js'
import type { ModelScenarioRoutingContext } from './model-scenario-routing-service.js'
import { resolveModelReference } from './model-scenario-routing-service.js'
import { getFrontmatterString, parseFrontmatter } from '../utils/frontmatter.js'

interface AgentConfigShape {
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: AgentMode
    [key: string]: unknown
  } | undefined>
}

type AgentMode = 'subagent' | 'primary' | 'all'
type AgentConfigEntry = NonNullable<NonNullable<AgentConfigShape['agent']>[string]>
const VALID_AGENT_MODES = new Set<AgentMode>(['primary', 'subagent', 'all'])

export function buildAgentConfig(
  manifest: RuntimeAssetManifest,
  routingContext?: ModelScenarioRoutingContext,
): NonNullable<AgentConfigShape['agent']> {
  const result: NonNullable<AgentConfigShape['agent']> = {}

  for (const agent of getAllAgentDefinitions()) {
    const fullPath = join(manifest.agentsDir, agent.stage, `${agent.name}.md`)
    const content = readFileSync(fullPath, 'utf8')
    const parsed = parseFrontmatter(content)

    const agentConfig: AgentConfigEntry = {
      ...parsed.data,
      description: getFrontmatterString(parsed.data, 'description') || agent.description,
      prompt: getFrontmatterString(parsed.data, 'prompt') ?? parsed.body.trim(),
      mode: resolveAgentMode(getFrontmatterString(parsed.data, 'mode'), agent.name),
    }

    applyAgentModel(agentConfig, getFrontmatterString(parsed.data, 'model'), routingContext)

    result[agent.name] = agentConfig
  }

  return result
}

function resolveAgentMode(frontmatterMode: string | undefined, agentName: string): AgentMode {
  if (!frontmatterMode) {
    return 'subagent'
  }

  if (VALID_AGENT_MODES.has(frontmatterMode as AgentMode)) {
    return frontmatterMode as AgentMode
  }

  throw new Error(`agent ${agentName} frontmatter mode 不合法: ${frontmatterMode}`)
}

function applyAgentModel(
  agentConfig: AgentConfigEntry,
  frontmatterModel?: string,
  routingContext?: ModelScenarioRoutingContext,
): void {
  if (!frontmatterModel) {
    return
  }

  const resolvedModel = resolveModelReference(routingContext, frontmatterModel)
  if (resolvedModel) {
    agentConfig.model = resolvedModel
  }
}

export function registerAgents(
  config: AgentConfigShape,
  manifest: RuntimeAssetManifest,
  routingContext?: ModelScenarioRoutingContext,
): void {
  config.agent = {
    ...buildAgentConfig(manifest, routingContext),
    ...(config.agent ?? {}),
  }
}
