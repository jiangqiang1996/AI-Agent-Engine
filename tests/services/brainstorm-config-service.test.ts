import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveBrainstormModels } from '../../src/services/brainstorm-config-service.js'
import { setBrainstormConfig } from '../../src/services/brainstorm-config-holder.js'
import { setModelScenarioRoutingContext } from '../../src/services/model-scenario-holder.js'
import { createModelScenarioRoutingContext } from '../../src/services/model-scenario-routing-service.js'
import type { ModelScenarioSource } from '../../src/services/builtin-opencode-config-service.js'
import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'

function makeSource(scenario: string, model: string, layer: '插件内置' | '全局' | '项目级' = '项目级'): ModelScenarioSource {
  return { scenario, model, layer, path: `/repo/${layer}.jsonc` }
}

describe('brainstorm-config-service', () => {
  beforeEach(() => {
    setBrainstormConfig(undefined)
    setModelScenarioRoutingContext(createModelScenarioRoutingContext(new Map()))
    vi.clearAllMocks()
  })

  describe('resolveBrainstormModels', () => {
    it('应该优先使用 brainstorm 配置中的模型', () => {
      setBrainstormConfig(['anthropic/claude-3-5-sonnet', 'openai/gpt-4o'])

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['anthropic/claude-3-5-sonnet', 'openai/gpt-4o'])
      expect(result.source).toBe('brainstorm 配置')
    })

    it('应该对 brainstorm 配置中的重复模型去重', () => {
      setBrainstormConfig(['anthropic/claude', 'anthropic/claude', 'openai/gpt-4o'])

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['anthropic/claude', 'openai/gpt-4o'])
    })

    it('应该将 brainstorm 模型数量限制为 3 个', () => {
      setBrainstormConfig(['p/m1', 'p/m2', 'p/m3', 'p/m4'])

      const result = resolveBrainstormModels()

      expect(result.models).toHaveLength(3)
      expect(result.models).toEqual(['p/m1', 'p/m2', 'p/m3'])
    })

    it('brainstorm 配置为空数组时应降级到 modelScenarios.deep', () => {
      const sources = new Map<string, ModelScenarioSource>([
        [MODEL_SCENARIO.DEEP, makeSource(MODEL_SCENARIO.DEEP, 'anthropic/deep-model')],
      ])
      setModelScenarioRoutingContext(createModelScenarioRoutingContext(sources))

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['anthropic/deep-model'])
      expect(result.source).toBe('modelScenarios.deep fallback')
    })

    it('brainstorm 和 deep 均未配置时应返回空数组让 opencode 动态路由', () => {
      const result = resolveBrainstormModels()

      expect(result.models).toEqual([])
      expect(result.source).toContain('opencode 动态模型')
    })

    it('brainstorm 配置为 undefined 时应降级到 deep', () => {
      const sources = new Map<string, ModelScenarioSource>([
        [MODEL_SCENARIO.DEEP, makeSource(MODEL_SCENARIO.DEEP, 'provider/x', '全局')],
      ])
      setModelScenarioRoutingContext(createModelScenarioRoutingContext(sources))

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['provider/x'])
      expect(result.source).toBe('modelScenarios.deep fallback')
    })

    it('brainstorm 配置只有一个模型时应正常使用', () => {
      setBrainstormConfig(['anthropic/sonnet'])

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['anthropic/sonnet'])
      expect(result.source).toBe('brainstorm 配置')
    })

    it('brainstorm 配置优先级应高于 modelScenarios.deep', () => {
      const sources = new Map<string, ModelScenarioSource>([
        [MODEL_SCENARIO.DEEP, makeSource(MODEL_SCENARIO.DEEP, 'provider/deep')],
      ])
      setModelScenarioRoutingContext(createModelScenarioRoutingContext(sources))
      setBrainstormConfig(['provider/brainstorm-model'])

      const result = resolveBrainstormModels()

      expect(result.models).toEqual(['provider/brainstorm-model'])
      expect(result.source).toBe('brainstorm 配置')
    })
  })

  describe('brainstorm-config-holder', () => {
    it('setBrainstormConfig 传入 undefined 应清空配置', () => {
      setBrainstormConfig(['p/m1'])
      setBrainstormConfig(undefined)

      const result = resolveBrainstormModels()
      expect(result.models).toEqual([])
    })
  })
})
