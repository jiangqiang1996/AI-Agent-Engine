import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getAllAgentDefinitions } from './ae-catalog.js'
import { parseFrontmatter } from '../utils/frontmatter.js'

interface AgentConfigShape {
  agent?: Record<string, {
    description?: string
    prompt?: string
    mode?: 'subagent' | 'primary' | 'all'
    [key: string]: unknown
  } | undefined>
}

export function buildAgentConfig(manifest: RuntimeAssetManifest): NonNullable<AgentConfigShape['agent']> {
  const result: NonNullable<AgentConfigShape['agent']> = {}

  for (const agent of getAllAgentDefinitions()) {
    const fullPath = join(manifest.agentsDir, agent.stage, `${agent.name}.md`)
    const content = readFileSync(fullPath, 'utf8')
    const parsed = parseFrontmatter(content)

    result[agent.name] = {
      description: parsed.data.description || agent.description,
      prompt: parsed.body.trim(),
      mode: 'subagent',
    }
  }

  return result
}

export function registerAgents(config: AgentConfigShape, manifest: RuntimeAssetManifest): void {
  config.agent = {
    ...buildAgentConfig(manifest),
    ...(config.agent ?? {}),
  }
}
