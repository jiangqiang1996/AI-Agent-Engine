import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getAllAgentDefinitions } from './ae-catalog.js'
import type { ModelScenarioRoutingContext } from './model-scenario-routing-service.js'
import { resolveModelReference } from './model-scenario-routing-service.js'
import { parseFrontmatter } from '../utils/frontmatter.js'

interface AgentConfigShape {
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: 'subagent' | 'primary' | 'all'
    [key: string]: unknown
  } | undefined>
}

type AgentConfigEntry = NonNullable<NonNullable<AgentConfigShape['agent']>[string]>

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
      description: parsed.data.description || agent.description,
      prompt: parsed.body.trim(),
      mode: 'subagent',
    }

    applyAgentModel(agentConfig, agent.name, parsed.data.model, routingContext)

    result[agent.name] = agentConfig
  }

  return result
}

function applyAgentModel(
  agentConfig: AgentConfigEntry,
  agentName: string,
  frontmatterModel?: string,
  routingContext?: ModelScenarioRoutingContext,
): void {
  if (!frontmatterModel) {
    return
  }

  const resolvedModel = resolveModelReference(routingContext, frontmatterModel, `@${agentName}`)
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
