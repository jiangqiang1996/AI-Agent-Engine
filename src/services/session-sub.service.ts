import type { OpencodeClient } from '@opencode-ai/sdk'

import { extractSessionID, subscribeSessionEvents } from './event-bus.js'

type V1Client = OpencodeClient

export interface SubSessionOptions {
  parentID?: string
  title?: string
  directory?: string
}

export interface CreatedSubSession {
  id: string
  title: string
}

export interface PromptOptions {
  sessionID: string
  text: string
  system?: string
  noReply?: boolean
  directory?: string
  model?: { providerID: string; modelID: string }
  tools?: Record<string, boolean>
  onProgress?: (event: ProgressEvent) => void
  abortSignal?: AbortSignal
}

export type ProgressEvent =
  | { kind: 'text'; sessionID: string; text: string }
  | { kind: 'reasoning'; sessionID: string; text: string }
  | { kind: 'tool_start'; sessionID: string; tool: string; input: Record<string, unknown> }
  | { kind: 'tool_end'; sessionID: string; tool: string; output: string; error?: string }
  | { kind: 'step_start'; sessionID: string }
  | { kind: 'step_finish'; sessionID: string; reason: string }
  | { kind: 'status'; sessionID: string; status: string }
  | { kind: 'error'; sessionID: string; message: string }

export interface PromptResult {
  sessionID: string
  assistantText: string
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }>
  raw: unknown
}

export function createSubSession(client: V1Client, options: SubSessionOptions): Promise<CreatedSubSession> {
  return (async () => {
    const res = await client.session.create({
      body: {
        ...(options.parentID ? { parentID: options.parentID } : {}),
        ...(options.title ? { title: options.title } : {}),
      },
      ...(options.directory ? { query: { directory: options.directory } } : {}),
    })
    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? (err.name as string) ?? '创建子会话失败')
    }
    const session = res.data as { id: string; title: string } | undefined
    if (!session?.id) throw new Error('创建子会话返回数据缺少 id')
    return { id: session.id, title: session.title ?? options.title ?? '' }
  })()
}

export function injectContext(client: V1Client, sessionID: string, text: string, directory?: string): Promise<void> {
  return (async () => {
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        parts: [{ type: 'text', text }],
      },
      ...(directory ? { query: { directory } } : {}),
    })
    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '上下文注入失败')
    }
  })()
}

export function injectSystemPrompt(client: V1Client, sessionID: string, system: string, directory?: string): Promise<void> {
  return (async () => {
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: {
        noReply: true,
        system,
        parts: [{ type: 'text', text: system }],
      },
      ...(directory ? { query: { directory } } : {}),
    })
    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '系统提示注入失败')
    }
  })()
}

function mapProgressEvent(event: { type: string; properties: Record<string, unknown> }): ProgressEvent | null {
  const sessionID = extractSessionID(event)
  if (!sessionID) return null

  const props = event.properties

  switch (event.type) {
    case 'message.part.updated': {
      const part = props.part as Record<string, unknown> | undefined
      if (!part) return null
      const partType = part.type as string

      if (partType === 'text') {
        const text = (part.text as string) ?? ''
        const delta = (props.delta as string) ?? ''
        return { kind: 'text', sessionID, text: delta || text }
      }
      if (partType === 'reasoning') {
        return { kind: 'reasoning', sessionID, text: (part.text as string) ?? '' }
      }
      if (partType === 'tool') {
        const state = part.state as Record<string, unknown> | undefined
        const toolName = (part.tool as string) ?? 'unknown'
        if (state?.status === 'running') {
          return { kind: 'tool_start', sessionID, tool: toolName, input: (state.input as Record<string, unknown>) ?? {} }
        }
        if (state?.status === 'completed') {
          return { kind: 'tool_end', sessionID, tool: toolName, output: (state.output as string) ?? '' }
        }
        if (state?.status === 'error') {
          return { kind: 'tool_end', sessionID, tool: toolName, output: '', error: (state.error as string) ?? '' }
        }
      }
      if (partType === 'step-start') {
        return { kind: 'step_start', sessionID }
      }
      if (partType === 'step-finish') {
        return { kind: 'step_finish', sessionID, reason: (part.reason as string) ?? '' }
      }
      return null
    }
    case 'session.status': {
      const status = props.status as Record<string, unknown> | undefined
      return { kind: 'status', sessionID, status: (status?.type as string) ?? 'unknown' }
    }
    case 'session.idle': {
      return { kind: 'status', sessionID, status: 'idle' }
    }
    case 'session.error': {
      const error = props.error as Record<string, unknown> | undefined
      return { kind: 'error', sessionID, message: (error?.message as string) ?? '未知错误' }
    }
    default:
      return null
  }
}

function formatProgress(event: ProgressEvent): string {
  switch (event.kind) {
    case 'text':
      return event.text
    case 'reasoning':
      return `[思考] ${event.text}`
    case 'tool_start':
      return `[工具] ${event.tool}(${JSON.stringify(event.input).slice(0, 200)})`
    case 'tool_end':
      return event.error ? `[工具] ${event.tool} 失败: ${event.error}` : `[工具] ${event.tool} 完成: ${event.output.slice(0, 200)}`
    case 'step_start':
      return '[步骤开始]'
    case 'step_finish':
      return `[步骤结束] ${event.reason}`
    case 'status':
      return `[状态] ${event.status}`
    case 'error':
      return `[错误] ${event.message}`
    default:
      return ''
  }
}

export async function promptAndWait(
  client: V1Client,
  options: PromptOptions,
): Promise<PromptResult> {
  const { sessionID, text, system, noReply, directory, model, tools, onProgress } = options

  const unsub = subscribeSessionEvents(
    (event) => {
      const progress = mapProgressEvent({
        type: event.type,
        properties: event.properties,
      })
      if (progress) {
        onProgress?.(progress)
      }
    },
    (event) => event.sessionID === sessionID,
  )

  try {
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: 'text', text }],
        ...(system ? { system } : {}),
        ...(noReply ? { noReply: true } : {}),
        ...(model ? { model } : {}),
        ...(tools ? { tools } : {}),
      },
      ...(directory ? { query: { directory } } : {}),
    })

    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '发送提示词失败')
    }

    const data = res.data as { info: Record<string, unknown>; parts: Array<Record<string, unknown>> } | undefined
    if (!data) throw new Error('提示词返回数据为空')

    return extractPromptResult(sessionID, data)
  } finally {
    unsub()
  }
}

export async function promptAsyncAndWait(
  client: V1Client,
  options: PromptOptions,
): Promise<PromptResult> {
  const { sessionID, text, system, noReply, directory, model, tools, onProgress, abortSignal } = options

  const unsub = subscribeSessionEvents(
    (event) => {
      const progress = mapProgressEvent({
        type: event.type,
        properties: event.properties,
      })
      if (progress) {
        onProgress?.(progress)
      }
    },
    (event) => event.sessionID === sessionID,
  )

  try {
    const res = await client.session.promptAsync({
      path: { id: sessionID },
      body: {
        parts: [{ type: 'text', text }],
        ...(system ? { system } : {}),
        ...(noReply ? { noReply: true } : {}),
        ...(model ? { model } : {}),
        ...(tools ? { tools } : {}),
      },
      ...(directory ? { query: { directory } } : {}),
    })

    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '异步发送提示词失败')
    }

    await waitForSessionIdle(client, sessionID, directory, abortSignal)

    const messagesRes = await client.session.messages({
      path: { id: sessionID },
      ...(directory ? { query: { directory } } : {}),
    })
    if (messagesRes.error) {
      const err = messagesRes.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '获取消息失败')
    }

    const messages = (messagesRes.data as Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>) ?? []
    return extractPromptResultFromMessages(sessionID, messages)
  } finally {
    unsub()
  }
}

async function waitForSessionIdle(
  client: V1Client,
  sessionID: string,
  directory?: string,
  abortSignal?: AbortSignal,
): Promise<void> {
  const maxAttempts = 200
  const baseIntervalMs = 1000
  const maxIntervalMs = 5000

  for (let i = 0; i < maxAttempts; i++) {
    if (abortSignal?.aborted) throw new Error('已中止')

    const res = await client.session.status({
      ...(directory ? { query: { directory } } : {}),
    })
    if (res.error) {
      const err = res.error as Record<string, unknown>
      throw new Error((err.message as string) ?? '获取会话状态失败')
    }

    const statuses = (res.data as Record<string, { type: string }>) ?? {}
    const status = statuses[sessionID]
    if (!status || status.type === 'idle') return

    const interval = Math.min(baseIntervalMs * Math.pow(1.5, Math.floor(i / 10)), maxIntervalMs)
    await sleep(interval)
  }

  throw new Error(`等待会话 ${sessionID} 完成超时`)
}

export async function getSessionMessages(
  client: V1Client,
  sessionID: string,
  directory?: string,
): Promise<Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>> {
  const res = await client.session.messages({
    path: { id: sessionID },
    ...(directory ? { query: { directory } } : {}),
  })
  if (res.error) {
    const err = res.error as Record<string, unknown>
    throw new Error((err.message as string) ?? '获取消息失败')
  }
  return (res.data as Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>) ?? []
}

export async function abortSession(client: V1Client, sessionID: string, directory?: string): Promise<void> {
  const res = await client.session.abort({
    path: { id: sessionID },
    ...(directory ? { query: { directory } } : {}),
  })
  if (res.error) {
    const err = res.error as Record<string, unknown>
    throw new Error((err.message as string) ?? '中止会话失败')
  }
}

export async function sendCommand(
  client: V1Client,
  sessionID: string,
  command: string,
  args?: string,
  directory?: string,
): Promise<void> {
  const res = await client.session.command({
    path: { id: sessionID },
    body: {
      command,
      arguments: args ?? '',
    },
    ...(directory ? { query: { directory } } : {}),
  })
  if (res.error) {
    const err = res.error as Record<string, unknown>
    throw new Error((err.message as string) ?? '发送命令失败')
  }
}

export function extractAssistantText(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): string {
  const texts: string[] = []
  for (const msg of messages) {
    if (msg.info.role !== 'assistant') continue
    for (const part of msg.parts) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        texts.push(part.text)
      }
    }
  }
  return texts.join('\n')
}

export function extractLastAssistantText(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role !== 'assistant') continue
    const texts: string[] = []
    for (const part of msg.parts) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
        texts.push(part.text)
      }
    }
    if (texts.length > 0) return texts.join('\n')
  }
  return ''
}

export function extractToolCalls(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }> {
  const calls: Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }> = []
  for (const msg of messages) {
    if (msg.info.role !== 'assistant') continue
    for (const part of msg.parts) {
      if (part.type !== 'tool') continue
      const state = part.state as Record<string, unknown> | undefined
      if (!state) continue
      calls.push({
        tool: (part.tool as string) ?? 'unknown',
        input: (state.input as Record<string, unknown>) ?? {},
        output: (state.output as string) ?? '',
        ...(state.error ? { error: state.error as string } : {}),
      })
    }
  }
  return calls
}

function extractPromptResult(
  sessionID: string,
  data: { info: Record<string, unknown>; parts: Array<Record<string, unknown>> },
): PromptResult {
  const parts = data.parts ?? []
  const texts: string[] = []
  const toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }> = []

  for (const part of parts) {
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      texts.push(part.text)
    }
    if (part.type === 'tool') {
      const state = part.state as Record<string, unknown> | undefined
      if (state) {
        toolCalls.push({
          tool: (part.tool as string) ?? 'unknown',
          input: (state.input as Record<string, unknown>) ?? {},
          output: (state.output as string) ?? '',
          ...(state.error ? { error: state.error as string } : {}),
        })
      }
    }
  }

  return {
    sessionID,
    assistantText: texts.join('\n'),
    toolCalls,
    raw: data,
  }
}

function extractPromptResultFromMessages(
  sessionID: string,
  messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>,
): PromptResult {
  return {
    sessionID,
    assistantText: extractLastAssistantText(messages),
    toolCalls: extractToolCalls(messages),
    raw: messages,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export { formatProgress }
