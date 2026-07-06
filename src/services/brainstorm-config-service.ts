import type { BrainstormConfig } from './builtin-opencode-config-service.js'
import { getBrainstormConfig } from './brainstorm-config-holder.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { MODEL_SCENARIO } from '../schemas/model-scenario-schema.js'

export interface ResolvedBrainstormModels {
  /** 最终生效的模型列表；空数组表示不指定模型，由 opencode 动态路由 */
  models: string[]
  /** 解析来源描述 */
  source: string
}

/**
 * 解析头脑风暴最终生效的模型列表。
 *
 * 优先级：
 * 1. ae.jsonc brainstorm（字符串数组）→ 直接使用
 * 2. 未配置 → fallback 到 modelScenarios.deep
 * 3. deep 也未配置 → 空数组（不指定模型，由 opencode 动态路由）
 */
export function resolveBrainstormModels(): ResolvedBrainstormModels {
  const config = getBrainstormConfig()
  if (config && config.length > 0) {
    const deduped = [...new Set(config)].slice(0, 3)
    return { models: deduped, source: 'brainstorm 配置' }
  }

  const routingContext = getModelScenarioRoutingContext() ?? undefined
  const deepModel = getModelByScenario(routingContext, MODEL_SCENARIO.DEEP)
  if (deepModel) {
    return { models: [deepModel], source: 'modelScenarios.deep fallback' }
  }

  return { models: [], source: 'opencode 动态模型（未配置 brainstorm 和 modelScenarios.deep）' }
}
