import { AGENT, AUTO_SUFFIX, COMMAND } from '../schemas/ae-asset-schema.js'
import { MODEL_SCENARIO, type ModelScenario } from '../schemas/model-scenario-schema.js'
import { getAllAgentDefinitions, getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from './ae-catalog.js'

export type ModelRoutingAssetType = 'agent' | 'command'

export type ModelRoutingApplyMode = 'direct' | 'inherit-default'

export interface AssetModelRoutingEntry {
  type: ModelRoutingAssetType
  name: string
  scenario?: ModelScenario
  applyMode: ModelRoutingApplyMode
  reason: string
}

const COMMAND_SCENARIOS: Record<string, ModelScenario> = {
  [COMMAND.IDEATE]: MODEL_SCENARIO.STANDARD,
  [COMMAND.BRAINSTORM]: MODEL_SCENARIO.STANDARD,
  [COMMAND.DOCUMENT_REVIEW]: MODEL_SCENARIO.DEEP,
  [COMMAND.PLAN]: MODEL_SCENARIO.DEEP,
  [COMMAND.REFACTOR]: MODEL_SCENARIO.DEEP,
  [COMMAND.WORK]: MODEL_SCENARIO.DEEP,
  [COMMAND.MERGE_BRANCH]: MODEL_SCENARIO.DEEP,
  [COMMAND.REVIEW]: MODEL_SCENARIO.DEEP,
  [COMMAND.LFG]: MODEL_SCENARIO.DEEP,
  [COMMAND.SETUP]: MODEL_SCENARIO.STANDARD,
  [COMMAND.TEST_BROWSER]: MODEL_SCENARIO.VISION,
  [COMMAND.FRONTEND_DESIGN]: MODEL_SCENARIO.VISION,
  [COMMAND.HANDOFF]: MODEL_SCENARIO.STANDARD,
  [COMMAND.PROMPT_OPTIMIZE]: MODEL_SCENARIO.QUICK,
  [`${COMMAND.PROMPT_OPTIMIZE}${AUTO_SUFFIX}`]: MODEL_SCENARIO.QUICK,
  [COMMAND.TASK_LOOP]: MODEL_SCENARIO.DEEP,
  [COMMAND.SQL]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SWAGGER_PARSER]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SAVE_RULES]: MODEL_SCENARIO.STANDARD,
  [COMMAND.SAVE_SESSION_FLOW]: MODEL_SCENARIO.STANDARD,
  [COMMAND.ASSET_DEBUG]: MODEL_SCENARIO.STANDARD,
  [COMMAND.HELP]: MODEL_SCENARIO.QUICK,
  [COMMAND.UPDATE]: MODEL_SCENARIO.STANDARD,
}

const AGENT_SCENARIOS: Record<string, ModelScenario> = {
  [AGENT.REPO_RESEARCH_ANALYST]: MODEL_SCENARIO.STANDARD,
  [AGENT.WEB_RESEARCHER]: MODEL_SCENARIO.STANDARD,
  [AGENT.DESIGN_ITERATOR]: MODEL_SCENARIO.VISION,
  [AGENT.FIGMA_DESIGN_SYNC]: MODEL_SCENARIO.VISION,
}

export function getCommandModelScenario(commandName: string): ModelScenario | undefined {
  if (commandName.endsWith('-po') || commandName.endsWith('-pa')) {
    return COMMAND_SCENARIOS[commandName.slice(0, -3)]
  }
  return COMMAND_SCENARIOS[commandName]
}

export function getAgentModelScenario(agentName: string): ModelScenario | undefined {
  return AGENT_SCENARIOS[agentName] ?? MODEL_SCENARIO.DEEP
}

export function getAssetModelRoutingEntries(): AssetModelRoutingEntry[] {
  const entries: AssetModelRoutingEntry[] = []
  for (const command of [...getPhaseOneEntries(), ...getPhaseOnePoEntries(), ...getPhaseOnePaEntries()]) {
    const scenario = getCommandModelScenario(command.commandName)
    entries.push({
      type: 'command',
      name: command.commandName,
      scenario,
      applyMode: scenario ? 'direct' : 'inherit-default',
      reason: scenario ? `内置命令声明 ${scenario} 场景` : '未声明场景，继承 opencode 当前默认模型',
    })
  }

  for (const agent of getAllAgentDefinitions()) {
    const scenario = getAgentModelScenario(agent.name)
    entries.push({
      type: 'agent',
      name: agent.name,
      scenario,
      applyMode: 'direct',
      reason: `内置代理声明 ${scenario} 场景`,
    })
  }

  return entries
}
