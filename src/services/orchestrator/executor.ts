import type { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type {
  Ctx,
  Node,
  FnNode,
  PromptNode,
  WhenNode,
  LoopNode,
  ParallelNode,
  ForEachNode,
  AskNode,
  DelegateNode,
  WorkflowDefinition,
  Checkpoint,
} from './types.js'
import { GateError, LLMError, AskAbortedError } from './types.js'

// ─── 公共 API ───

export interface RunOptions {
  input: unknown
  rootDir: string
  directory: string
  runID: string
  /** LLM 调用服务 */
  callLLM: (systemPrompt: string | undefined, message: string, outputSchema: z.ZodType, images?: Buffer[], model?: string) => Promise<unknown>
  /** 子任务委派服务 */
  delegate: (title: string, systemPrompt: string | undefined, message: string, output?: z.ZodType, model?: string) => Promise<unknown>
  /** 外部内容解析服务 */
  resolveContent: (ref: string) => Promise<string>
  report: (meta: { title: string; detail?: string }) => void
  ask: (question: string) => Promise<string>
  /** 若提供，从检查点恢复执行 */
  checkpointPath?: string
  /** 检查点保存目录，默认为 rootDir/.orchestrator */
  checkpointDir?: string
}

export interface RunResult<S> {
  state: S
  results: Map<string, unknown>
  log: string[]
  /** 检查点保存路径，中断或失败时可用于恢复 */
  checkpointPath?: string
}

const CHECKPOINT_FILENAME = 'orchestrator-checkpoint.json'

export async function execute<I, S>(
  workflow: WorkflowDefinition<I, S>,
  options: RunOptions,
): Promise<RunResult<S>> {
  const ts = () => new Date().toISOString().slice(11, 19)
  const checkpointDir = options.checkpointDir ?? join(options.rootDir, '.orchestrator')

  let input: I
  let state: S
  const log: string[] = []
  let startIndex = 0
  let results = new Map<string, unknown>()

  if (options.checkpointPath && existsSync(options.checkpointPath)) {
    const cp = loadCheckpoint(options.checkpointPath)
    if (cp && cp.workflowName === workflow.name) {
      state = cp.state as S
      startIndex = cp.stepIndex + 1
      results = new Map(Object.entries(cp.results))
      log.push(`${ts()} [restore] 从步骤 ${startIndex} 恢复`)
      input = options.input as I
    } else {
      input = workflow.inputSchema.parse(options.input) as I
      state = workflow.initialState(input) as S
    }
  } else {
    input = workflow.inputSchema.parse(options.input) as I
    state = workflow.initialState(input) as S
  }

  let completedStepIndex = startIndex - 1

  const ctx: Ctx<I, S> = {
    input,
    state,
    round: 0,
    item: undefined,
    itemIndex: -1,
    results,
    callLLM: options.callLLM,
    delegate: options.delegate,
    resolveContent: options.resolveContent,
    rootDir: options.rootDir,
    directory: options.directory,
    runID: options.runID,
    report: options.report,
    ask: options.ask,
  }

  try {
    for (let i = startIndex; i < workflow.flow.length; i++) {
      await dispatch(workflow.flow[i], ctx, log, ts)
      completedStepIndex = i
    }
  } catch (error) {
    const cpPath = saveCheckpoint(checkpointDir, {
      workflowName: workflow.name,
      stepIndex: completedStepIndex,
      state: ctx.state as Record<string, unknown>,
      results: Object.fromEntries(ctx.results),
      timestamp: new Date().toISOString(),
      runID: options.runID,
    })
    if (error instanceof AskAbortedError) {
      return {
        state: ctx.state,
        results: ctx.results,
        log,
        checkpointPath: cpPath,
      }
    }
    if (error instanceof Error) {
      error.message += `\n检查点已保存: ${cpPath}`
    }
    throw error
  }

  return { state: ctx.state, results: ctx.results, log }
}

// ─── 检查点持久化 ───

function saveCheckpoint(dir: string, cp: Checkpoint): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = join(dir, CHECKPOINT_FILENAME)
  writeFileSync(path, JSON.stringify(cp, null, 2), 'utf-8')
  return path
}

function loadCheckpoint(path: string): Checkpoint | null {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as Checkpoint
  } catch {
    return null
  }
}

// ─── 节点遍历 ───

async function walk<I, S>(
  nodes: readonly Node<I, S>[],
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  for (const node of nodes) {
    await dispatch(node, ctx, log, ts)
  }
}

async function dispatch<I, S>(
  node: Node<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  switch (node.type) {
    case 'fn':
      await execFn(node, ctx, log, ts)
      break
    case 'prompt':
      await execPrompt(node, ctx, log, ts)
      break
    case 'when':
      await execWhen(node, ctx, log, ts)
      break
    case 'loop':
      await execLoop(node, ctx, log, ts)
      break
    case 'parallel':
      await execParallel(node, ctx, log, ts)
      break
    case 'foreach':
      await execForEach(node, ctx, log, ts)
      break
    case 'gate':
      execGate(node, ctx, log, ts)
      break
    case 'ask':
      await execAsk(node, ctx, log, ts)
      break
    case 'delegate':
      await execDelegate(node, ctx, log, ts)
      break
  }
}

// ─── 确定性步骤 ───

async function execFn<I, S>(
  node: FnNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  ctx.report({ title: node.name })
  const patch = await node.run(ctx)
  if (patch) Object.assign(ctx.state as Record<string, unknown>, patch)
  log.push(`${ts()} [fn] ${node.name}`)
}

// ─── 不确定性步骤 ───

async function execPrompt<I, S>(
  node: PromptNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  ctx.report({ title: node.name })

  const systemPrompt = await resolveSystemPrompt(node, ctx)
  const message = node.message(ctx)
  const images = node.images?.(ctx) ?? []
  const maxAttempts = (node.retries ?? 2) + 1

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await ctx.callLLM(systemPrompt, message, node.output, images, node.model)
      ctx.results.set(node.name, result)
      log.push(`${ts()} [prompt] ${node.name}`)
      return
    } catch (err) {
      lastError = err
      log.push(`${ts()} [prompt] ${node.name} 第 ${attempt} 次尝试失败: ${err}`)
    }
  }

  throw new LLMError(node.name, maxAttempts, lastError)
}

// ─── 控制流 ───

async function execWhen<I, S>(
  node: WhenNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  const taken = node.condition(ctx)
  log.push(`${ts()} [when] → ${taken ? 'then' : 'else'}`)
  await walk(taken ? node.then : (node.else ?? []), ctx, log, ts)
}

async function execLoop<I, S>(
  node: LoopNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  const max = typeof node.max === 'function' ? node.max(ctx) : node.max
  log.push(`${ts()} [loop] ${node.name} 开始 (上限 ${max})`)

  const prevRound = ctx.round

  for (let i = 1; i <= max; i++) {
    ctx.round = i

    if (node.while && !node.while(ctx)) {
      log.push(`${ts()} [loop] ${node.name} while=false 于第 ${i} 轮退出`)
      break
    }
    if (node.until && node.until(ctx)) {
      log.push(`${ts()} [loop] ${node.name} until=true 于第 ${i} 轮退出`)
      break
    }

    ctx.report({ title: `${node.name} ${i}/${max}` })
    await walk(node.body, ctx, log, ts)
  }

  ctx.round = prevRound
}

async function execParallel<I, S>(
  node: ParallelNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  log.push(`${ts()} [parallel] 启动 ${node.branches.length} 个分支`)

  const branchResults = new Map<string, Map<string, unknown>>()
  const branchStates = new Map<string, S>()
  const failedBranches: string[] = []

  const settled = await Promise.allSettled(
    node.branches.map(async (branch) => {
      const branchCtx: Ctx<I, S> = {
        ...ctx,
        state: structuredClone(ctx.state) as S,
        results: new Map(ctx.results),
      }
      const branchLog: string[] = []
      await walk(branch.steps, branchCtx, branchLog, ts)
      return { name: branch.name, results: branchCtx.results, state: branchCtx.state, log: branchLog }
    }),
  )

  let abortedError: AskAbortedError | null = null
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    const branchName = node.branches[i].name
    if (result.status === 'fulfilled') {
      branchResults.set(branchName, result.value.results)
      branchStates.set(branchName, result.value.state)
      log.push(...result.value.log)
    } else {
      if (result.reason instanceof AskAbortedError && !abortedError) {
        abortedError = result.reason
      }
      failedBranches.push(branchName)
      log.push(`${ts()} [parallel] 分支 "${branchName}" 失败: ${result.reason}`)
    }
  }

  if (abortedError) {
    throw abortedError
  }
  if (failedBranches.length > 0) {
    throw new Error(`并行分支失败: ${failedBranches.join(', ')}`)
  }

  const patch = node.merge(branchResults, branchStates, ctx)
  if (patch) Object.assign(ctx.state as Record<string, unknown>, patch)
}

async function execForEach<I, S>(
  node: ForEachNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  const items = node.items(ctx)
  const cc = node.concurrency ?? 1
  log.push(`${ts()} [foreach] ${node.name} 处理 ${items.length} 项`)

  const prevItem = ctx.item
  const prevItemIndex = ctx.itemIndex

  if (cc <= 1) {
    for (let i = 0; i < items.length; i++) {
      ctx.report({ title: `${node.name} ${i + 1}/${items.length}` })
      await walk(
        node.body,
        { ...ctx, item: items[i], itemIndex: i },
        log,
        ts,
      )
    }
  } else {
    for (let i = 0; i < items.length; i += cc) {
      const chunk = items.slice(i, i + cc)
      const snapshot = structuredClone(ctx.state) as S
      const branchOutputs: Array<{ log: string[]; results: Map<string, unknown>; state: S }> = chunk.map(() => ({
        log: [],
        results: new Map<string, unknown>(),
        state: structuredClone(snapshot) as S,
      }))

      const settled = await Promise.allSettled(
        chunk.map((item, j) => {
          const branchCtx: Ctx<I, S> = {
            ...ctx,
            item,
            itemIndex: i + j,
            state: branchOutputs[j].state,
            results: branchOutputs[j].results,
          }
          return walk(node.body, branchCtx, branchOutputs[j].log, ts).then(() => {
            branchOutputs[j].state = branchCtx.state
          })
        }),
      )

      const failedItems: string[] = []
      let abortedError: AskAbortedError | null = null
      for (let j = 0; j < settled.length; j++) {
        const result = settled[j]
        if (result.status === 'rejected') {
          if (result.reason instanceof AskAbortedError && !abortedError) {
            abortedError = result.reason
          }
          failedItems.push(`项 ${i + j}`)
          log.push(`${ts()} [foreach] ${node.name} 项 ${i + j} 失败: ${result.reason}`)
        } else {
          log.push(...branchOutputs[j].log)
        }
      }

      if (abortedError) throw abortedError
      if (failedItems.length > 0) {
        throw new Error(`foreach 并发执行失败: ${failedItems.join(', ')}`)
      }

      if (node.merge) {
        const itemResults = new Map<string, Map<string, unknown>>()
        const itemStates = new Map<string, S>()
        for (let j = 0; j < chunk.length; j++) {
          itemResults.set(String(i + j), branchOutputs[j].results)
          itemStates.set(String(i + j), branchOutputs[j].state)
        }
        const patch = node.merge(itemResults, itemStates, ctx)
        if (patch) Object.assign(ctx.state as Record<string, unknown>, patch)
      } else {
        for (const output of branchOutputs) {
          for (const [key, value] of output.results) {
            ctx.results.set(key, value)
          }
        }
        for (const output of branchOutputs) {
          const diff = shallowDiff(snapshot, output.state)
          Object.assign(ctx.state as Record<string, unknown>, diff)
        }
      }
    }
  }

  ctx.item = prevItem
  ctx.itemIndex = prevItemIndex
}

function shallowDiff(original: unknown, modified: unknown): Record<string, unknown> {
  if (typeof original !== 'object' || original === null || typeof modified !== 'object' || modified === null) return {}
  const orig = original as Record<string, unknown>
  const mod = modified as Record<string, unknown>
  const diff: Record<string, unknown> = {}
  for (const key of Object.keys(mod)) {
    if (mod[key] !== orig[key]) {
      diff[key] = mod[key]
    }
  }
  return diff
}

function execGate<I, S>(node: { check: (ctx: Ctx<I, S>) => boolean; message: string }, ctx: Ctx<I, S>, log: string[], ts: () => string): void {
  if (!node.check(ctx)) {
    throw new GateError(node.message)
  }
  log.push(`${ts()} [gate] 通过`)
}

// ─── 用户中断 ───

async function execAsk<I, S>(
  node: AskNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  const question = node.question(ctx)
  ctx.report({ title: node.name, detail: question })

  const answer = await ctx.ask(question)
  if (answer.trim().toLowerCase() === '__abort__') {
    log.push(`${ts()} [ask] ${node.name} 用户中断`)
    throw new AskAbortedError(node.name)
  }

  const patch = await node.handle(answer, ctx)
  if (patch) Object.assign(ctx.state as Record<string, unknown>, patch)
  log.push(`${ts()} [ask] ${node.name} 用户回答已处理`)
}

// ─── 子任务委派 ───

async function execDelegate<I, S>(
  node: DelegateNode<I, S>,
  ctx: Ctx<I, S>,
  log: string[],
  ts: () => string,
): Promise<void> {
  const title = node.title(ctx)
  ctx.report({ title: `委派: ${title}` })
  log.push(`${ts()} [delegate] 创建子任务: ${title}`)

  const systemPrompt = await node.systemPrompt?.(ctx)
  const message = node.message(ctx)
  const maxAttempts = (node.retries ?? 0) + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await ctx.delegate(title, systemPrompt, message, node.output, node.model)

    if (result !== undefined && result !== null) {
      ctx.results.set(node.name, result)
      log.push(`${ts()} [delegate] ${title} 完成`)
      return
    }

    if (attempt < maxAttempts) {
      log.push(`${ts()} [delegate] ${title} 第 ${attempt} 次无返回内容，重试中`)
    }
  }

  log.push(`${ts()} [delegate] ${title} 无返回内容`)
}

// ─── 系统提示词解析 ───

async function resolveSystemPrompt<I, S>(
  node: PromptNode<I, S>,
  ctx: Ctx<I, S>,
): Promise<string | undefined> {
  if (node.systemPrompt) return node.systemPrompt(ctx)
  if (node.contentRef) return ctx.resolveContent(node.contentRef)
  return undefined
}
