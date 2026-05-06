import { describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX } from '../../src/schemas/ae-asset-schema.js'
import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'
import { getAllAgentDefinitions, getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from '../../src/services/ae-catalog.js'
import {
  getAgentModelScenario,
  getAssetModelRoutingEntries,
  getCommandModelScenario,
} from '../../src/services/asset-model-routing-catalog.js'

describe('asset-model-routing-catalog', () => {
  it('应该为所有内置命令和派生命令提供路由状态', () => {
    const entries = getAssetModelRoutingEntries().filter((entry) => entry.type === 'command')
    const routedNames = new Set(entries.map((entry) => entry.name))

    for (const command of [...getPhaseOneEntries(), ...getPhaseOnePoEntries(), ...getPhaseOnePaEntries()]) {
      expect(routedNames.has(command.commandName)).toBe(true)
    }
  })

  it('应该让提示词优化派生命令继承基础命令场景', () => {
    expect(getCommandModelScenario(`${COMMAND.PLAN}${PO_SUFFIX}`)).toBe(getCommandModelScenario(COMMAND.PLAN))
    expect(getCommandModelScenario(`${COMMAND.WORK}${PA_SUFFIX}`)).toBe(getCommandModelScenario(COMMAND.WORK))
  })

  it('复杂规划和审查命令不应该落到 quick', () => {
    for (const command of [COMMAND.PLAN, COMMAND.WORK, COMMAND.REVIEW]) {
      expect(getCommandModelScenario(command)).toBe(MODEL_SCENARIO.DEEP)
    }
  })

  it('视觉相关命令和代理应该引用 vision 场景', () => {
    expect(getCommandModelScenario(COMMAND.TEST_BROWSER)).toBe(MODEL_SCENARIO.VISION)
    expect(getCommandModelScenario(COMMAND.FRONTEND_DESIGN)).toBe(MODEL_SCENARIO.VISION)
    expect(getAgentModelScenario('figma-design-sync')).toBe(MODEL_SCENARIO.VISION)
  })

  it('应该为所有内置代理提供路由状态', () => {
    for (const agent of getAllAgentDefinitions()) {
      expect(getAgentModelScenario(agent.name)).toBeDefined()
    }
  })
})
