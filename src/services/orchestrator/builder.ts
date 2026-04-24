import type { z } from 'zod'
import type {
  Ctx,
  Node,
  FnNode,
  PromptNode,
  WhenNode,
  LoopNode,
  ParallelNode,
  ForEachNode,
  GateNode,
  AskNode,
  DelegateNode,
  WorkflowDefinition,
} from './types.js'

// ─── 工作流定义 ───

export function defineWorkflow<I, S>(config: {
  name: string
  input: z.ZodType<I>
  init: (input: I) => S
  flow: Node<I, S>[]
}): WorkflowDefinition<I, S> {
  return {
    name: config.name,
    inputSchema: config.input,
    initialState: config.init,
    flow: config.flow,
  }
}

// ─── 确定性步骤 ───

export function fn<I, S>(
  name: string,
  run: (ctx: Ctx<I, S>) => Promise<Partial<S> | void>,
): FnNode<I, S> {
  return { type: 'fn', name, run }
}

// ─── 不确定性步骤 ───

export function prompt<I, S>(config: {
  name: string
  message: (ctx: Ctx<I, S>) => string
  output: z.ZodType
  images?: (ctx: Ctx<I, S>) => Buffer[]
  systemPrompt?: (ctx: Ctx<I, S>) => string | Promise<string>
  contentRef?: string
  model?: string
  retries?: number
}): PromptNode<I, S> {
  return { type: 'prompt', ...config }
}

// ─── 控制流 ───

export function when<I, S>(
  condition: (ctx: Ctx<I, S>) => boolean,
  then: Node<I, S>[],
  else_?: Node<I, S>[],
): WhenNode<I, S> {
  return { type: 'when', condition, then, else: else_ }
}

export function loop<I, S>(config: {
  name: string
  max: number | ((ctx: Ctx<I, S>) => number)
  while?: (ctx: Ctx<I, S>) => boolean
  until?: (ctx: Ctx<I, S>) => boolean
  body: Node<I, S>[]
}): LoopNode<I, S> {
  return { type: 'loop', ...config }
}

export function parallel<I, S>(
  branches: ReadonlyArray<{ name: string; steps: Node<I, S>[] }>,
  merge: (
    branchResults: Map<string, Map<string, unknown>>,
    branchStates: Map<string, S>,
    ctx: Ctx<I, S>,
  ) => Partial<S>,
): ParallelNode<I, S> {
  return { type: 'parallel', branches, merge }
}

export function foreach<I, S>(
  name: string,
  items: (ctx: Ctx<I, S>) => unknown[],
  body: Node<I, S>[],
  concurrency?: number,
  merge?: (
    itemResults: Map<string, Map<string, unknown>>,
    itemStates: Map<string, S>,
    ctx: Ctx<I, S>,
  ) => Partial<S>,
): ForEachNode<I, S> {
  return { type: 'foreach', name, items, body, concurrency, merge }
}

export function gate<I, S>(
  check: (ctx: Ctx<I, S>) => boolean,
  message: string,
): GateNode<I, S> {
  return { type: 'gate', check, message }
}

// ─── 用户中断 ───

export function ask<I, S>(config: {
  name: string
  question: (ctx: Ctx<I, S>) => string
  handle: (answer: string, ctx: Ctx<I, S>) => Promise<Partial<S> | void>
}): AskNode<I, S> {
  return { type: 'ask', ...config }
}

// ─── 子任务委派 ───

export function delegate<I, S>(config: {
  name: string
  title: (ctx: Ctx<I, S>) => string
  message: (ctx: Ctx<I, S>) => string
  systemPrompt?: (ctx: Ctx<I, S>) => string | Promise<string>
  output?: z.ZodType
  model?: string
}): DelegateNode<I, S> {
  return { type: 'delegate', ...config }
}
