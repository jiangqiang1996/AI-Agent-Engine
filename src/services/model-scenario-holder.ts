import type { ModelScenarioRoutingContext } from './model-scenario-routing-service.js'

let _context: ModelScenarioRoutingContext | null = null

export function setModelScenarioRoutingContext(context: ModelScenarioRoutingContext): void {
  _context = context
}

export function getModelScenarioRoutingContext(): ModelScenarioRoutingContext | null {
  return _context
}
