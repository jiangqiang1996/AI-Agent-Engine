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

function loadAgentPrompt(agentsDir: string, relativePath: string): string {
  const content = readFileSync(join(agentsDir, relativePath), 'utf8')
  const parsed = parseFrontmatter(content)
  return parsed.body.trim()
}

export function buildAgentConfig(manifest: RuntimeAssetManifest): NonNullable<AgentConfigShape['agent']> {
  const result: NonNullable<AgentConfigShape['agent']> = {}
  const repoRoot = manifest.repoRoot

  for (const agent of getAllAgentDefinitions()) {
    const fullPath = join(repoRoot, agent.path)
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
    ...(config.agent ?? {}),
    ...buildAgentConfig(manifest),
  }
}
