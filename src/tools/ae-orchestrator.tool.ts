import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'
import { Effect } from 'effect'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { OpencodeClient } from '@opencode-ai/sdk'

import { execute, type RunOptions } from '../services/orchestrator/executor.js'
import { defineWorkflow, fn, prompt, when, loop, parallel, foreach, gate, ask, delegate } from '../services/orchestrator/builder.js'
import type { Node, PromptNode } from '../services/orchestrator/types.js'
import { getGlobalClient, getGlobalManifest } from '../services/client-holder.js'
import { loadSkillContent, loadAgentContent } from '../services/orchestrator/loader.js'
import type { AssetResolverConfig } from '../services/orchestrator/loader.js'
import { getBuiltInWorkflow } from '../workflows/index.js'

function buildAssetConfig(worktree: string): AssetResolverConfig {
  const manifest = getGlobalManifest()
  const skillDirs = [
    join(worktree, 'skills'),
    join(worktree, '.opencode', 'skills'),
  ]
  const agentDirs = [
    join(worktree, 'agents'),
    join(worktree, '.opencode', 'agents'),
  ]
  if (manifest) {
    if (!skillDirs.includes(manifest.skillsDir)) skillDirs.push(manifest.skillsDir)
    if (!agentDirs.includes(manifest.agentsDir)) agentDirs.push(manifest.agentsDir)
  }
  return { skillDirs, agentDirs }
}

function unwrap<T>(response: { data?: T; error?: unknown }, label: string): T {
  if (response.data !== undefined && response.data !== null) return response.data
  throw new Error(`${label} 失败: ${JSON.stringify(response.error)}`)
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const s = schema as unknown as { toJsonSchema?: () => unknown }
  if (typeof s.toJsonSchema === 'function') {
    return s.toJsonSchema() as Record<string, unknown>
  }
  return { type: 'object', properties: {}, additionalProperties: true }
}

function extractResponseText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const parts = obj.parts as Array<Record<string, unknown>> | undefined
  if (!parts || !Array.isArray(parts)) return null
  const textParts = parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text as string)
    .filter(Boolean)
  return textParts.length > 0 ? textParts.join('\n') : null
}

function parseJSON(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim()
  return JSON.parse(cleaned)
}

function parseModelRef(model: string): { providerID: string; modelID: string } | undefined {
  const slashIdx = model.indexOf('/')
  if (slashIdx > 0) {
    return { providerID: model.slice(0, slashIdx), modelID: model.slice(slashIdx + 1) }
  }
  return undefined
}

function createCallLLM(client: OpencodeClient) {
  return async (
    systemPrompt: string | undefined,
    message: string,
    outputSchema: z.ZodType,
    images: Buffer[] = [],
    model?: string,
  ): Promise<unknown> => {
    const session = unwrap(
      await client.session.create({ body: { title: `wf-${Date.now()}` } }),
      '创建会话',
    )
    const sessionID = (session as { id: string }).id

    const jsonSchema = zodToJsonSchema(outputSchema)
    const jsonInstruction = [
      message,
      '',
      '你必须返回符合以下 JSON Schema 的纯 JSON（不要 markdown 代码块）：',
      JSON.stringify(jsonSchema, null, 2),
    ].join('\n')

    const parts: Array<{ type: 'text'; text: string } | { type: 'file'; mime: string; url: string }> = [
      { type: 'text', text: jsonInstruction },
    ]
    for (const img of images) {
      parts.push({ type: 'file', mime: 'image/png', url: `data:image/png;base64,${img.toString('base64')}` })
    }

    const result = unwrap(
      await client.session.prompt({
        path: { id: sessionID },
        body: {
          ...(systemPrompt ? { system: systemPrompt } : {}),
          ...(model ? parseModelRef(model) ?? {} : {}),
          parts,
        },
      }),
      'LLM 提示',
    )

    const content = extractResponseText(result)
    if (!content) throw new Error('LLM 未返回内容')
    const parsed = parseJSON(content)
    return outputSchema.parse(parsed)
  }
}

function createDelegate(client: OpencodeClient) {
  return async (
    title: string,
    systemPrompt: string | undefined,
    message: string,
    output?: z.ZodType,
    model?: string,
  ): Promise<unknown> => {
    const session = unwrap(
      await client.session.create({ body: { title } }),
      '创建子会话',
    )
    const subSessionID = (session as { id: string }).id

    const result = unwrap(
      await client.session.prompt({
        path: { id: subSessionID },
        body: {
          parts: [{ type: 'text' as const, text: message }],
          ...(systemPrompt ? { system: systemPrompt } : {}),
          ...(model ? parseModelRef(model) ?? {} : {}),
        },
      }),
      '子会话提示',
    )

    const content = extractResponseText(result)
    if (content) {
      if (output) {
        try {
          return output.parse(parseJSON(content))
        } catch {
          return content
        }
      }
      return content
    }
    return undefined
  }
}

function createResolveContent(assetConfig: AssetResolverConfig) {
  return async (ref: string): Promise<string> => {
    if (ref.startsWith('skill:')) return loadSkillContent(ref.slice(6), assetConfig)
    if (ref.startsWith('agent:')) return loadAgentContent(ref.slice(6), assetConfig)
    throw new Error(`未知的内容引用格式: ${ref}`)
  }
}

function resolveStatePath(path: string, state: Record<string, unknown>): unknown {
  const parts = path.split('.')
  let current: unknown = state
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return current
}

function resolveConditionValue(value: unknown, state: Record<string, unknown>): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    if (value.startsWith('state.')) {
      return Boolean(resolveStatePath(value.slice(6), state))
    }
  }
  return Boolean(value)
}

export const aeOrchestratorTool: ToolDefinition = tool({
  description: [
    '通用 AI Agent 固定逻辑编排工具，用于固化技能、命令或代理的固定执行流程。',
    '',
    '功能说明：',
    '- 接受步骤列表定义，按顺序执行固定流程',
    '- 支持并行子任务委派执行（delegate 类型步骤）',
    '- 支持终端重启后通过检查点恢复执行',
    '- 支持用户中断并临时修改逻辑（ask 类型步骤）',
    '- 不确定性部分使用自然语言描述，由 LLM 在执行时解读',
    '',
    '步骤类型：',
    '- fn: 确定性函数步骤，通过 config.output 设置状态值（可选，为对象时合并到工作流状态）',
    '- prompt: LLM 不确定性步骤',
    '- skill: 调用技能（config 中提供 skillName）',
    '- agent: 委派给子代理（config 中提供 agentName）',
    '- when: 条件分支（config.condition 支持布尔值、"true"/"false" 字符串、或 "state.xxx" 路径引用，then 步骤放在 children，else 步骤放在 config.elseChildren）',
    '- loop: 循环（config.max 为上限，config.while/config.until 支持布尔值、"true"/"false" 字符串、或 "state.xxx" 路径引用）',
    '- parallel: 并行执行（children 为各分支步骤）',
    '- foreach: 遍历（config.itemsPath 指向工作流状态中的数组）',
    '- gate: 前置检查（config.check 支持布尔值、"true"/"false" 字符串、或 "state.xxx" 路径引用，config.message 为失败提示）',
    '- ask: 用户中断点，暂停等待用户确认',
    '- delegate: 委派独立子任务并行执行',
    '',
    '条件值格式：',
    'when 的 config.condition、gate 的 config.check、loop 的 config.while/config.until 支持以下格式：',
    '  - 布尔值：true / false',
    '  - 字符串："true" / "false"',
    '  - 状态路径引用："state.xxx.yyy"（从工作流状态中读取动态值）',
    '不支持自然语言条件。',
    '',
    '适用场景：',
    '- 固化多步骤的技能/代理编排流程',
    '- 需要并行执行多个独立任务的场景',
    '- 需要在流程中暂停让用户确认或修改的场景',
    '',
    '不适用场景：',
    '- 单步骤调用（直接使用对应技能或工具即可）',
    '- 完全不确定的探索性任务（不应用编排器固化）',
  ].join('\n'),
  args: {
    workflow_name: z.string().min(1).describe('工作流名称'),
    steps: z.array(z.unknown()).optional().describe('工作流步骤列表（内置工作流可省略）'),
    input: z.record(z.string(), z.unknown()).default({}).describe('工作流输入参数，各步骤可通过 config 中路径引用'),
    resume_from_checkpoint: z.string().optional().describe('检查点文件路径，用于从上次中断处恢复执行'),
  },
  async execute(args, context) {
    const worktree = context.worktree
    const directory = context.directory
    const sessionID = context.sessionID

    const checkpointPath = args.resume_from_checkpoint
      ? join(worktree, args.resume_from_checkpoint)
      : undefined

    if (checkpointPath && !existsSync(checkpointPath)) {
      return `检查点文件不存在: ${checkpointPath}。请确认路径正确，或不使用检查点重新开始。`
    }

    const askFn = async (question: string): Promise<string> => {
      try {
        await Effect.runPromise(
          context.ask({
            permission: `orchestrator-ask`,
            patterns: [],
            always: [],
            metadata: { question },
          }),
        )
        // context.ask 是权限确认，无法返回用户文本。
        // 用户接受权限 = 'confirmed'，拒绝 = 抛出异常（被上方 catch 转为 __abort__）
        return 'confirmed'
      } catch {
        // 用户拒绝权限请求等价于中断
        return '__abort__'
      }
    }

    const reportFn = (meta: { title: string; detail?: string }): void => {
      context.metadata({ title: meta.title, metadata: meta.detail ? { detail: meta.detail } : {} })
    }

    const inputState = args.input
    const steps = args.steps as Array<Record<string, unknown>> | undefined

    try {
      const client = getGlobalClient()
      if (!client) throw new Error('编排引擎: SDK client 不可用')
      const assetConfig = buildAssetConfig(worktree)

      const options: RunOptions = {
        input: inputState,
        rootDir: worktree,
        directory,
        runID: sessionID,
        callLLM: createCallLLM(client),
        delegate: createDelegate(client),
        resolveContent: createResolveContent(assetConfig),
        report: reportFn,
        ask: askFn,
        checkpointPath,
      }

      const builtIn = getBuiltInWorkflow(args.workflow_name)
      if (builtIn) {
        const result = await execute(builtIn, options)
        const lines = [
          `✅ 工作流 "${args.workflow_name}" 执行完成`,
          '',
          '执行日志：',
          ...result.log.map((l) => `  ${l}`),
        ]

        if (result.checkpointPath) {
          lines.push('')
          lines.push(`⚠️ 工作流被用户中断，检查点已保存: ${result.checkpointPath}`)
          lines.push('可通过 resume_from_checkpoint 参数恢复执行。')
        }

        if (result.results.size > 0) {
          lines.push('')
          lines.push('步骤产出：')
          for (const [key, value] of result.results) {
            const summary = typeof value === 'string' ? value.slice(0, 200) : JSON.stringify(value).slice(0, 200)
            lines.push(`  ${key}: ${summary}`)
          }
        }

        return lines.join('\n')
      }

      if (!steps?.length) {
        return `未知的工作流 "${args.workflow_name}"，且未提供 steps。`
      }

      const flow = buildNodesFromJson(steps)
      const workflow = defineWorkflow({
        name: args.workflow_name,
        input: z.record(z.string(), z.unknown()),
        init: () => inputState,
        flow,
      })

      const result = await execute(workflow, options)
      const lines = [
        `✅ 工作流 "${args.workflow_name}" 执行完成`,
        '',
        '执行日志：',
        ...result.log.map((l) => `  ${l}`),
      ]

      if (result.checkpointPath) {
        lines.push('')
        lines.push(`⚠️ 工作流被用户中断，检查点已保存: ${result.checkpointPath}`)
        lines.push('可通过 resume_from_checkpoint 参数恢复执行。')
      }

      if (result.results.size > 0) {
        lines.push('')
        lines.push('步骤产出：')
        for (const [key, value] of result.results) {
          const summary = typeof value === 'string' ? value.slice(0, 200) : JSON.stringify(value).slice(0, 200)
          lines.push(`  ${key}: ${summary}`)
        }
      }

      return lines.join('\n')
    } catch (error) {
      if (error instanceof Error) {
        return `❌ 工作流执行失败: ${error.message}`
      }
      return `❌ 工作流执行失败: ${String(error)}`
    }
  },
})

function buildNodesFromJson(steps: Array<Record<string, unknown>>): Node<Record<string, unknown>, Record<string, unknown>>[] {
  return steps.map((step) => buildNodeFromJson(step))
}

function buildNodeFromJson(step: Record<string, unknown>): Node<Record<string, unknown>, Record<string, unknown>> {
  const type = step.type as string
  const name = (step.name as string) ?? 'unnamed'
  const config = (step.config as Record<string, unknown>) ?? {}
  const children = (step.children as Array<Record<string, unknown>>) ?? []

  switch (type) {
    case 'fn':
      return fn(name, async (ctx) => {
        const description = config.description as string ?? name
        ctx.report({ title: name, detail: description })
        if (config.output && typeof config.output === 'object') {
          return config.output as Partial<Record<string, unknown>>
        }
        return undefined
      })

    case 'prompt':
      return prompt({
        name,
        message: () => (config.message as string) ?? name,
        output: z.unknown(),
        model: config.model as string | undefined,
        retries: (config.retries as number) ?? 2,
      })

    case 'skill':
      return prompt({
        name,
        message: () => (config.args as string) ?? '',
        output: z.unknown(),
        contentRef: `skill:${(config.skillName as string) ?? name}`,
        model: config.model as string | undefined,
        retries: (config.retries as number) ?? 2,
      }) satisfies PromptNode<Record<string, unknown>, Record<string, unknown>>

    case 'agent':
      return prompt({
        name,
        message: () => (config.task as string) ?? (config.prompt as string) ?? name,
        output: z.unknown(),
        contentRef: `agent:${(config.agentName as string) ?? name}`,
        model: config.model as string | undefined,
        retries: (config.retries as number) ?? 2,
      }) satisfies PromptNode<Record<string, unknown>, Record<string, unknown>>

    case 'when':
      return when(
        (ctx) => resolveConditionValue(config.condition, ctx.state as Record<string, unknown>),
        buildNodesFromJson(children),
        config.elseChildren ? buildNodesFromJson(config.elseChildren as Array<Record<string, unknown>>) : undefined,
      )

    case 'loop':
      return loop({
        name,
        max: (config.max as number) ?? 10,
        while: config.while ? (ctx) => resolveConditionValue(config.while, ctx.state as Record<string, unknown>) : undefined,
        until: config.until ? (ctx) => resolveConditionValue(config.until, ctx.state as Record<string, unknown>) : undefined,
        body: buildNodesFromJson(children),
      })

    case 'parallel':
      return parallel(
        children.map((child) => ({
          name: (child.name as string) ?? 'branch',
          steps: buildNodesFromJson((child.children as Array<Record<string, unknown>>) ?? []),
        })),
        (results, states) => {
          const merged: Record<string, unknown> = {}
          for (const [, branchResults] of results) {
            for (const [key, value] of branchResults) {
              merged[key] = value
            }
          }
          for (const [, branchState] of states) {
            Object.assign(merged, branchState as Record<string, unknown>)
          }
          return merged
        },
      )

    case 'foreach':
      return foreach(
        name,
        (ctx) => {
          const itemsPath = config.itemsPath as string
          if (!itemsPath) return []
          const resolved = resolveStatePath(itemsPath, ctx.state as Record<string, unknown>)
          return Array.isArray(resolved) ? resolved : []
        },
        buildNodesFromJson(children),
        (config.concurrency as number) ?? 1,
      )

    case 'gate':
      return gate(
        (ctx) => resolveConditionValue(config.check, ctx.state as Record<string, unknown>),
        (config.message as string) ?? `${name} 检查未通过`,
      )

    case 'ask':
      return ask({
        name,
        question: () => (config.question as string) ?? `${name}: 请确认以继续`,
        handle: async (answer) => ({ [`${name}_answer`]: answer } as Record<string, unknown>),
      })

    case 'sub-session':
    case 'delegate':
      return delegate({
        name,
        title: () => (config.title as string) ?? name,
        message: () => (config.message as string) ?? (config.task as string) ?? name,
        systemPrompt: config.systemPrompt ? () => config.systemPrompt as string : undefined,
        output: z.unknown(),
        model: config.model as string | undefined,
      })

    default:
      throw new Error(`未知的步骤类型: "${type}"，支持的类型: fn, prompt, skill, agent, when, loop, parallel, foreach, gate, ask, delegate`)
  }
}
