import type { WorkflowDefinition } from '../services/orchestrator/types.js'
import { taskLoopWorkflow } from './task-loop.js'

const registry = new Map<string, WorkflowDefinition<unknown, unknown>>()

function registerBuiltIn<I, S>(workflow: WorkflowDefinition<I, S>): void {
  registry.set(workflow.name, workflow as WorkflowDefinition<unknown, unknown>)
}

export function getBuiltInWorkflow(name: string): WorkflowDefinition<unknown, unknown> | undefined {
  return registry.get(name)
}

registerBuiltIn(taskLoopWorkflow)
