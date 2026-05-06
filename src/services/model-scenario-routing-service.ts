import type { BuiltinOpencodeConfigLayerName, ModelScenarioSource } from './builtin-opencode-config-service.js'
import type { ModelScenario } from '../schemas/model-scenario-schema.js'

export interface ModelScenarioRoutingContext {
  sources: Map<string, ModelScenarioSource>
}

export interface ModelScenarioResolution {
  scenario: ModelScenario
  writeModel: boolean
  model?: string
  sourceLayer?: BuiltinOpencodeConfigLayerName
  sourcePath?: string
  reason: string
}

export function createModelScenarioRoutingContext(
  sources: Map<string, ModelScenarioSource>,
): ModelScenarioRoutingContext {
  return { sources }
}

export function resolveModelScenario(
  context: ModelScenarioRoutingContext,
  scenario: ModelScenario,
): ModelScenarioResolution {
  const source = context.sources.get(scenario)
  if (!source) {
    return {
      scenario,
      writeModel: false,
      reason: `场景 ${scenario} 未配置，继承 opencode 当前默认模型`,
    }
  }

  return {
    scenario,
    writeModel: true,
    model: source.model,
    sourceLayer: source.layer,
    sourcePath: source.path,
    reason: `命中${source.layer} modelScenarios.${scenario}`,
  }
}
