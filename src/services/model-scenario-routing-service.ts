import type { BuiltinOpencodeConfigLayerName, ModelScenarioSource } from './builtin-opencode-config-service.js'
import type { ModelScenario } from '../schemas/model-scenario-schema.js'

export interface UnresolvedModelReference {
  reference: string
  assetLabel: string
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

/**
 * 解析 frontmatter 中的模型引用
 * 含 `/` 的引用按 opencode 真实模型标识透传，其余引用按 modelScenarios 变量解析。
 */
export function resolveModelReference(
  context: ModelScenarioRoutingContext | undefined,
  reference: string | undefined,
  assetLabel?: string,
): string | undefined {
  if (!reference) {
    return undefined
  }

  if (reference.includes('/')) {
    return reference
  }

  const resolved = context?.sources.get(reference)?.model
  if (!resolved && context && assetLabel) {
    context.unresolvedReferences.push({ reference, assetLabel })
  }

  return resolved
}
