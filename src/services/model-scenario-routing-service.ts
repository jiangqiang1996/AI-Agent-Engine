import type { BuiltinOpencodeConfigLayerName, ModelScenarioSource } from './builtin-opencode-config-service.js'
import { MODEL_SCENARIO, type ModelScenario } from '../schemas/model-scenario-schema.js'

export interface UnresolvedModelReference {
  reference: string
  assetLabel: string
  source: 'builtin' | 'configured'
}

export interface ModelScenarioRoutingContext {
  sources: Map<string, ModelScenarioSource>
  unresolvedReferences: UnresolvedModelReference[]
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
  return { sources, unresolvedReferences: [] }
}

export function resolveModelScenario(
  context: ModelScenarioRoutingContext,
  scenario: ModelScenario,
): ModelScenarioResolution {
  const scenarioSource = context.sources.get(scenario)
  if (!scenarioSource) {
    return {
      scenario,
      writeModel: false,
      reason: `场景 ${scenario} 未配置，继承 opencode 当前默认模型`,
    }
  }

  return {
    scenario,
    writeModel: true,
    model: scenarioSource.model,
    sourceLayer: scenarioSource.layer,
    sourcePath: scenarioSource.path,
    reason: `命中${scenarioSource.layer} modelScenarios.${scenario}`,
  }
}

/**
 * 获取目标场景配置的模型标识。
 *
 * 命中时返回模型字符串（如 "anthropic/claude-3-5-sonnet"）；
 * 未配置或 context 缺失时返回 undefined，由调用方继承 opencode 当前默认模型。
 *
 * 适用于运行时按场景取模型（如 ae:image 工具按 vision 场景取模型识别图片）。
 */
export function getModelByScenario(
  context: ModelScenarioRoutingContext | undefined,
  scenario: ModelScenario,
): string | undefined {
  if (!context) return undefined
  const resolved = resolveModelScenario(context, scenario)
  return resolved.writeModel ? resolved.model : undefined
}

/**
 * 解析 frontmatter 中的模型引用
 * `$name` 优先按 modelScenarios 变量解析；未命中时，内置稳定场景回退默认模型，自定义场景则原样透传引用。
 */
export function resolveModelReference(
  context: ModelScenarioRoutingContext | undefined,
  reference: string | undefined,
): string | undefined {
  if (!reference) {
    return undefined
  }

  if (!reference.startsWith('$')) {
    return reference
  }

  const scenario = reference.slice(1)
  const resolved = context?.sources.get(scenario)?.model
  if (resolved) {
    return resolved
  }

  if (
    scenario === MODEL_SCENARIO.QUICK
    || scenario === MODEL_SCENARIO.STANDARD
    || scenario === MODEL_SCENARIO.DEEP
    || scenario === MODEL_SCENARIO.VISION
    || scenario === MODEL_SCENARIO.AUDIO
    || scenario === MODEL_SCENARIO.VIDEO
  ) {
    return undefined
  }

  return reference
}
