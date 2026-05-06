import { describe, expect, it } from 'vitest'

import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'
import { createModelScenarioRoutingContext, resolveModelScenario } from '../../src/services/model-scenario-routing-service.js'

describe('model-scenario-routing-service', () => {
  it('应该在项目级场景命中后返回模型和来源', () => {
    const context = createModelScenarioRoutingContext(new Map([
      ['quick', { scenario: 'quick', model: 'project/quick', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const result = resolveModelScenario(context, MODEL_SCENARIO.QUICK)

    expect(result).toMatchObject({
      scenario: MODEL_SCENARIO.QUICK,
      writeModel: true,
      model: 'project/quick',
      sourceLayer: '项目级',
    })
  })

  it('应该在场景缺失时继承 opencode 当前默认模型', () => {
    const context = createModelScenarioRoutingContext(new Map())

    const result = resolveModelScenario(context, MODEL_SCENARIO.DEEP)

    expect(result.writeModel).toBe(false)
    expect(result.model).toBeUndefined()
    expect(result.reason).toContain('继承 opencode 当前默认模型')
  })

  it('应该按原样透传模型字符串', () => {
    const context = createModelScenarioRoutingContext(new Map([
      ['vision', { scenario: 'vision', model: 'provider/model:latest', layer: '全局', path: '/home/config' }],
    ]))

    expect(resolveModelScenario(context, MODEL_SCENARIO.VISION).model).toBe('provider/model:latest')
  })
})
