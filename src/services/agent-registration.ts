import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getAllAgentDefinitions } from './ae-catalog.js'
import { getAgentModelScenario } from './asset-model-routing-catalog.js'
import type { ModelScenarioRoutingContext } from './model-scenario-routing-service.js'
import { resolveModelScenario } from './model-scenario-routing-service.js'
import { parseFrontmatter } from '../utils/frontmatter.js'

interface AgentConfigShape {
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: 'subagent' | 'primary' | 'all'
    [key: string]: unknown
  } | undefined>
}

export function buildAgentConfig(
  manifest: RuntimeAssetManifest,
  routingContext?: ModelScenarioRoutingContext,
): NonNullable<AgentConfigShape['agent']> {
  const result: NonNullable<AgentConfigShape['agent']> = {}

  for (const agent of getAllAgentDefinitions()) {
    const fullPath = join(manifest.agentsDir, agent.stage, `${agent.name}.md`)
    const content = readFileSync(fullPath, 'utf8')
    const parsed = parseFrontmatter(content)

    const agentConfig: NonNullable<AgentConfigShape['agent']>[string] = {
      description: parsed.data.description || agent.description,
      prompt: parsed.body.trim(),
      mode: 'subagent',
    }

    const scenario = getAgentModelScenario(agent.name)
    if (routingContext && scenario) {
      const resolved = resolveModelScenario(routingContext, scenario)
      if (resolved.writeModel) {
        agentConfig.model = resolved.model
      }
    }

    result[agent.name] = agentConfig
  }

  return result
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
