import type { z } from 'zod'

// ─── 执行上下文 ───

export interface Ctx<I, S> {
  input: I
  state: S
  /** 循环内当前轮次，非循环内为 0 */
  round: number
  /** foreach 内当前遍历项，非 foreach 内为 undefined */
  item: unknown
  /** foreach 内当前遍历索引，非 foreach 内为 -1 */
  itemIndex: number
  /** 各步骤产出物，key 为步骤 name */
  results: Map<string, unknown>
  /** 调用 LLM 并返回经过 outputSchema 校验的结果 */
  callLLM: (systemPrompt: string | undefined, message: string, outputSchema: z.ZodType, images?: Buffer[], model?: string) => Promise<unknown>
  /** 委派独立子任务并返回结果 */
  delegate: (title: string, systemPrompt: string | undefined, message: string, output?: z.ZodType, model?: string) => Promise<unknown>
  /** 根据引用字符串解析外部内容 */
  resolveContent: (ref: string) => Promise<string>
  /** 项目根目录 */
  rootDir: string
  /** 工作目录 */
  directory: string
  /** 本次执行的唯一标识 */
  runID: string
  /** 向用户实时报告进度 */
  report: (meta: { title: string; detail?: string }) => void
  /** 向用户提问并等待回答，用于中断和临时修改 */
  ask: (question: string) => Promise<string>
}

// ─── 步骤：确定性 ───

export interface FnNode<I, S> {
  readonly type: 'fn'
  readonly name: string
  readonly run: (ctx: Ctx<I, S>) => Promise<Partial<S> | void>
}

// ─── 步骤：不确定性（LLM 调用） ───

export interface PromptNode<I, S> {
  readonly type: 'prompt'
  readonly name: string
  readonly message: (ctx: Ctx<I, S>) => string
  readonly output: z.ZodType
  readonly images?: (ctx: Ctx<I, S>) => Buffer[]
  readonly systemPrompt?: (ctx: Ctx<I, S>) => string | Promise<string>
  /** 外部内容引用，格式由消费方定义（如 "skill:brainstorm"、"agent:reviewer"） */
  readonly contentRef?: string
  readonly model?: string
  readonly retries?: number
}

// ─── 控制流 ───

export interface WhenNode<I, S> {
  readonly type: 'when'
  readonly condition: (ctx: Ctx<I, S>) => boolean
  readonly then: Node<I, S>[]
  readonly else?: Node<I, S>[]
}

/**
 * 循环语义：先检查条件，再执行 body（与 C 语言 while 一致）。
 *
 * while: 条件为 true 时继续（首次即检查）
 * until: 条件为 true 时停止（首次即检查）
 * max:   硬性上限，不论 while/until 结果
 *
 * 若需要"先执行后检查"，可在 body 末尾用 fn 修改 state，
 * 再由 while 读取 state 决定是否继续。
 */
export interface LoopNode<I, S> {
  readonly type: 'loop'
  readonly name: string
  readonly while?: (ctx: Ctx<I, S>) => boolean
  readonly until?: (ctx: Ctx<I, S>) => boolean
  readonly max: number | ((ctx: Ctx<I, S>) => number)
  readonly body: Node<I, S>[]
}

export interface ParallelNode<I, S> {
  readonly type: 'parallel'
  readonly branches: ReadonlyArray<{
    readonly name: string
    readonly steps: Node<I, S>[]
  }>
  readonly merge: (
    branchResults: Map<string, Map<string, unknown>>,
    branchStates: Map<string, S>,
    ctx: Ctx<I, S>,
  ) => Partial<S>
}

export interface ForEachNode<I, S> {
  readonly type: 'foreach'
  readonly name: string
  readonly items: (ctx: Ctx<I, S>) => unknown[]
  readonly body: Node<I, S>[]
  readonly concurrency?: number
  readonly merge?: (
    itemResults: Map<string, Map<string, unknown>>,
    itemStates: Map<string, S>,
    ctx: Ctx<I, S>,
  ) => Partial<S>
}

export interface GateNode<I, S> {
  readonly type: 'gate'
  readonly check: (ctx: Ctx<I, S>) => boolean
  readonly message: string
}

// ─── 用户中断 ───

export interface AskNode<I, S> {
  readonly type: 'ask'
  readonly name: string
  readonly question: (ctx: Ctx<I, S>) => string
  readonly handle: (answer: string, ctx: Ctx<I, S>) => Promise<Partial<S> | void>
}

// ─── 子任务委派 ───

export interface DelegateNode<I, S> {
  readonly type: 'delegate'
  readonly name: string
  readonly title: (ctx: Ctx<I, S>) => string
  readonly systemPrompt?: (ctx: Ctx<I, S>) => string | Promise<string>
  readonly message: (ctx: Ctx<I, S>) => string
  readonly output?: z.ZodType
  readonly model?: string
  readonly retries?: number
}

// ─── 节点联合类型 ───

export type Node<I, S> =
  | FnNode<I, S>
  | PromptNode<I, S>
  | WhenNode<I, S>
  | LoopNode<I, S>
  | ParallelNode<I, S>
  | ForEachNode<I, S>
  | GateNode<I, S>
  | AskNode<I, S>
  | DelegateNode<I, S>

// ─── 工作流定义 ───

export interface WorkflowDefinition<I, S> {
  readonly name: string
  readonly inputSchema: z.ZodType<I>
  readonly initialState: (input: I) => S
  readonly flow: Node<I, S>[]
}

// ─── 持久化状态 ───

export interface Checkpoint {
  workflowName: string
  stepIndex: number
  state: Record<string, unknown>
  results: Record<string, unknown>
  timestamp: string
  runID: string
}

// ─── 错误类型 ───

export class GateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GateError'
  }
}

export class LLMError extends Error {
  constructor(
    public readonly stepName: string,
    public readonly attempt: number,
    public readonly cause: unknown,
  ) {
    super(`prompt 步骤 "${stepName}" 第 ${attempt} 次尝试失败: ${cause}`)
    this.name = 'LLMError'
  }
}

export class AskAbortedError extends Error {
  constructor(
    public readonly stepName: string,
  ) {
    super(`用户中断了步骤 "${stepName}"`)
    this.name = 'AskAbortedError'
  }
}
