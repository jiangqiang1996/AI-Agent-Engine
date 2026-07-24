import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { COMMAND } from '../schemas/ae-asset-schema.js'
import { MODEL_SCENARIO, type ModelScenario } from '../schemas/model-scenario-schema.js'
import { getAllAgentDefinitions, getPhaseOneEntries } from './ae-catalog.js'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getFrontmatterString, parseFrontmatter } from '../utils/frontmatter.js'

export type ModelRoutingAssetType = 'agent' | 'command'

export type ModelRoutingApplyMode = 'direct' | 'inherit-default'

export interface AssetModelRoutingEntry {
  type: ModelRoutingAssetType
  name: string
  scenario?: string
  applyMode: ModelRoutingApplyMode
  reason: string
}

const VALID_SCENARIOS = new Set<string>(Object.values(MODEL_SCENARIO))

const COMMAND_SCENARIOS = {
  [COMMAND.BRAINSTORM]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PRD]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PRD_UPDATE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.DESIGN]: MODEL_SCENARIO.DEEP,
  [COMMAND.DESIGN_UPDATE]: MODEL_SCENARIO.DEEP,
  [COMMAND.AGENT_CREATOR]: MODEL_SCENARIO.STANDARD,
  [COMMAND.WORK]: MODEL_SCENARIO.DEEP,
  [COMMAND.WORK_REPORT]: MODEL_SCENARIO.STANDARD,
  [COMMAND.MY_CODE_CHANGES]: MODEL_SCENARIO.STANDARD,
  [COMMAND.MERGE_BRANCH]: MODEL_SCENARIO.DEEP,
  [COMMAND.REVIEW]: MODEL_SCENARIO.DEEP,
  [COMMAND.PLAYWRIGHT]: MODEL_SCENARIO.VISION,
  [COMMAND.PROTOTYPE_PREVIEW]: MODEL_SCENARIO.STANDARD,
  [COMMAND.HANDOFF]: MODEL_SCENARIO.STANDARD,
  [COMMAND.TASK_LOOP]: MODEL_SCENARIO.DEEP,
  [COMMAND.SQL]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SWAGGER_PARSER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.API_TESTER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SLIDES_OUTLINE]: MODEL_SCENARIO.DEEP,
  [COMMAND.IMAGE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.AUDIO]: MODEL_SCENARIO.STANDARD,
  [COMMAND.VIDEO]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PROJECT_EXPLORE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SAVE_EXPERIENCE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PROMPT_OPTIMIZE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SKILL_CREATOR]: MODEL_SCENARIO.STANDARD,
  [COMMAND.DOCX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PDF]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PPTX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.XLSX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.GRILL]: MODEL_SCENARIO.DEEP,
  [COMMAND.OFFICECLI]: MODEL_SCENARIO.STANDARD,
  [COMMAND.OCR]: MODEL_SCENARIO.DEEP,
} satisfies Record<string, ModelScenario>

const COMMAND_VALUES = new Set<string>(Object.values(COMMAND))
const COMMAND_SCENARIO_ENTRIES = Object.entries(COMMAND_SCENARIOS)
const MISSING_SCENARIOS = COMMAND_VALUES.size - COMMAND_SCENARIO_ENTRIES.length
if (MISSING_SCENARIOS > 0) {
  const covered = new Set(COMMAND_SCENARIO_ENTRIES.map(([k]) => k))
  const missing = [...COMMAND_VALUES].filter((v) => !covered.has(v))
  throw new Error(`COMMAND_SCENARIOS 缺少以下命令的场景映射: ${missing.join(', ')}`)
}

export function getCommandModelScenario(commandName: string): ModelScenario | undefined {
  return (COMMAND_SCENARIOS as Record<string, ModelScenario>)[commandName]
}

function resolveAgentScenario(modelReference: string | undefined): string | undefined {
  if (!modelReference) {
    return undefined
  }
  const scenario = modelReference.startsWith('$') ? modelReference.slice(1) : modelReference
  return VALID_SCENARIOS.has(scenario) ? scenario : undefined
}

export function getAssetModelRoutingEntries(manifest?: RuntimeAssetManifest): AssetModelRoutingEntry[] {
  const entries: AssetModelRoutingEntry[] = []
  for (const command of getPhaseOneEntries()) {
    const scenario = getCommandModelScenario(command.commandName)
    entries.push({
      type: 'command',
      name: command.commandName,
      scenario,
      applyMode: scenario ? 'direct' : 'inherit-default',
      reason: scenario ? `内置命令声明 ${scenario} 场景` : '未声明场景，继承 opencode 当前默认模型',
    })
  }

  if (!manifest) {
    return entries
  }

  for (const agent of getAllAgentDefinitions()) {
    const fullPath = join(manifest.agentsDir, agent.path)
    let modelReference: string | undefined
    try {
      const content = readFileSync(fullPath, 'utf8')
      const parsed = parseFrontmatter(content)
      modelReference = getFrontmatterString(parsed.data, 'model')
    } catch {
      modelReference = undefined
    }
    const scenario = resolveAgentScenario(modelReference)
    entries.push({
      type: 'agent',
      name: agent.name,
      scenario,
      applyMode: scenario ? 'direct' : 'inherit-default',
      reason: modelReference
        ? `内置代理 frontmatter 声明 ${modelReference} 模型引用`
        : '未声明模型引用，继承 opencode 当前默认模型',
    })
  }

  return entries
}
