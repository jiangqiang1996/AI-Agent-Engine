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

const COMMAND_SCENARIOS: Record<string, ModelScenario> = {
  [COMMAND.BRAINSTORM]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PRD]: MODEL_SCENARIO.STANDARD,
  [COMMAND.DESIGN]: MODEL_SCENARIO.DEEP,
  [COMMAND.PLAN]: MODEL_SCENARIO.DEEP,
  [COMMAND.REFACTOR]: MODEL_SCENARIO.DEEP,
  [COMMAND.AGENT_CREATOR]: MODEL_SCENARIO.STANDARD,
  [COMMAND.WORK]: MODEL_SCENARIO.DEEP,
  [COMMAND.WORK_REPORT]: MODEL_SCENARIO.STANDARD,
  [COMMAND.MY_CODE_CHANGES]: MODEL_SCENARIO.STANDARD,
  [COMMAND.MERGE_BRANCH]: MODEL_SCENARIO.DEEP,
  [COMMAND.REVIEW]: MODEL_SCENARIO.DEEP,
  [COMMAND.CHROME_DEVTOOLS]: MODEL_SCENARIO.VISION,
  [COMMAND.WEB_FORGE]: MODEL_SCENARIO.DEEP,
  [COMMAND.COURSE_AUTO_PLAYER]: MODEL_SCENARIO.VISION,
  [COMMAND.HANDOFF]: MODEL_SCENARIO.STANDARD,
  [COMMAND.TASK_LOOP]: MODEL_SCENARIO.DEEP,
  [COMMAND.SQL]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SWAGGER_PARSER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.API_TESTER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SLIDES_OUTLINE]: MODEL_SCENARIO.DEEP,
  [COMMAND.PPTX_FROM_OUTLINE]: MODEL_SCENARIO.DEEP,
  [COMMAND.HTML_BUNDLE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.LIBREOFFICE]: MODEL_SCENARIO.QUICK,

  [COMMAND.IMAGE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.AUDIO]: MODEL_SCENARIO.STANDARD,
  [COMMAND.VIDEO]: MODEL_SCENARIO.STANDARD,
  [COMMAND.GRAPH_BUILD]: MODEL_SCENARIO.STANDARD,
  [COMMAND.GRAPH_QUERY]: MODEL_SCENARIO.QUICK,
  [COMMAND.PROJECT_EXPLORE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SAVE_EXPERIENCE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PROMPT_OPTIMIZE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SKILL_CREATOR]: MODEL_SCENARIO.STANDARD,
  [COMMAND.STATIC_SERVER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.DOCX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PDF]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PPTX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.XLSX]: MODEL_SCENARIO.STANDARD,
  [COMMAND.HELP]: MODEL_SCENARIO.QUICK,
  [COMMAND.GRILL]: MODEL_SCENARIO.DEEP,
  [COMMAND.INSTALL]: MODEL_SCENARIO.STANDARD,
  [COMMAND.UNINSTALL]: MODEL_SCENARIO.STANDARD,
}

export function getCommandModelScenario(commandName: string): ModelScenario | undefined {
  return COMMAND_SCENARIOS[commandName]
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
    const content = readFileSync(fullPath, 'utf8')
    const parsed = parseFrontmatter(content)
    const modelReference = getFrontmatterString(parsed.data, 'model')
    const scenario = modelReference?.startsWith('$') ? modelReference.slice(1) : modelReference
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
