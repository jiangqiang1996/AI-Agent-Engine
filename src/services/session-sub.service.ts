import type { OpencodeClient } from '@opencode-ai/sdk'

import { extractSessionID, subscribeSessionEvents } from './event-bus.js'

type V1Client = OpencodeClient

function extractSdkError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    if (typeof e.message === 'string') return e.message
    if (typeof e.name === 'string') return e.name
    try { return JSON.stringify(e) } catch { return fallback }
  }
  return String(error)
}

function asString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback
}

function asRecord(val: unknown): Record<string, unknown> | undefined {
  return typeof val === 'object' && val !== null ? val as Record<string, unknown> : undefined
}

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

export async function createSubSession(client: V1Client, options: SubSessionOptions): Promise<CreatedSubSession> {
  const res = await client.session.create({
    body: {
      ...(options.parentID ? { parentID: options.parentID } : {}),
      ...(options.title ? { title: options.title } : {}),
    },
    ...(options.directory ? { query: { directory: options.directory } } : {}),
  })
  if (res.error) {
    throw new Error(extractSdkError(res.error, '创建子会话失败'))
  }
  const session = asRecord(res.data)
  const id = session && typeof session.id === 'string' ? session.id : undefined
  if (!id) throw new Error('创建子会话返回数据缺少 id')
  const title = session && typeof session.title === 'string' ? session.title : (options.title ?? '')
  return { id, title }
}

function mapProgressEvent(event: { type: string; properties: Record<string, unknown> }): ProgressEvent | null {
  const sessionID = extractSessionID(event)
  if (!sessionID) return null

  const props = event.properties

  switch (event.type) {
    case 'message.part.updated': {
      const part = asRecord(props.part)
      if (!part) return null
      const partType = asString(part.type)

      if (partType === 'text') {
        const text = asString(part.text)
        const delta = asString(props.delta)
        return { kind: 'text', sessionID, text: delta || text }
      }
      if (partType === 'reasoning') {
        return { kind: 'reasoning', sessionID, text: asString(part.text) }
      }
      if (partType === 'tool') {
        const state = asRecord(part.state)
        const toolName = asString(part.tool, 'unknown')
        const stateStatus = asString(state?.status)
        if (stateStatus === 'running') {
          return { kind: 'tool_start', sessionID, tool: toolName, input: asRecord(state?.input) ?? {} }
        }
        if (stateStatus === 'completed') {
          return { kind: 'tool_end', sessionID, tool: toolName, output: asString(state?.output) }
        }
        if (stateStatus === 'error') {
          return { kind: 'tool_end', sessionID, tool: toolName, output: '', error: asString(state?.error) }
        }
      }
      if (partType === 'step-start') {
        return { kind: 'step_start', sessionID }
      }
      if (partType === 'step-finish') {
        return { kind: 'step_finish', sessionID, reason: asString(part.reason) }
      }
      return null
    }
    case 'session.status': {
      const status = asRecord(props.status)
      return { kind: 'status', sessionID, status: asString(status?.type, 'unknown') }
    }
    case 'session.idle': {
      return { kind: 'status', sessionID, status: 'idle' }
    }
    case 'session.error': {
      const error = asRecord(props.error)
      return { kind: 'error', sessionID, message: asString(error?.message, '未知错误') }
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

function buildPromptBody(options: PromptOptions): Record<string, unknown> {
  return {
    parts: [{ type: 'text', text: options.text }],
    ...(options.system ? { system: options.system } : {}),
    ...(options.noReply ? { noReply: true } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.tools ? { tools: options.tools } : {}),
  }
}

function createSessionSubscription(sessionID: string, onProgress?: (event: ProgressEvent) => void): () => void {
  return subscribeSessionEvents(
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
}

export async function promptAsyncAndWait(
  client: V1Client,
  options: PromptOptions,
): Promise<PromptResult> {
  const { sessionID, directory, abortSignal, onProgress } = options

  const unsub = createSessionSubscription(sessionID, onProgress)

  try {
    const res = await client.session.promptAsync({
      path: { id: sessionID },
      body: buildPromptBody(options) as Parameters<typeof client.session.promptAsync>[0]['body'],
      ...(directory ? { query: { directory } } : {}),
    })

    if (res.error) {
      throw new Error(extractSdkError(res.error, '异步发送提示词失败'))
    }

    await waitForSessionIdle(client, sessionID, directory, abortSignal)

    const messagesRes = await client.session.messages({
      path: { id: sessionID },
      ...(directory ? { query: { directory } } : {}),
    })
    if (messagesRes.error) {
      throw new Error(extractSdkError(messagesRes.error, '获取消息失败'))
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
      throw new Error(extractSdkError(res.error, '获取会话状态失败'))
    }

    const statuses = (res.data as Record<string, { type: string }>) ?? {}
    const status = statuses[sessionID]
    if (!status) {
      // 会话尚未注册到状态映射，可能是创建延迟，继续轮询
    } else if (status.type === 'idle') {
      return
    } else if (status.type === 'error' || status.type === 'aborted') {
      throw new Error(`会话 ${sessionID} 状态异常: ${status.type}`)
    }

    const baseInterval = Math.min(baseIntervalMs * Math.pow(1.5, Math.floor(i / 10)), maxIntervalMs)
    const jitter = Math.floor(Math.random() * 300)
    await sleep(baseInterval + jitter, abortSignal)
  }

  throw new Error(`等待会话 ${sessionID} 完成超时`)
}

function extractAssistantText(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): string {
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

function extractLastAssistantText(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): string {
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

function extractToolCalls(messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }>): Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }> {
  const calls: Array<{ tool: string; input: Record<string, unknown>; output: string; error?: string }> = []
  for (const msg of messages) {
    if (msg.info.role !== 'assistant') continue
    for (const part of msg.parts) {
      if (part.type !== 'tool') continue
      const state = asRecord(part.state)
      if (!state) continue
      calls.push({
        tool: asString(part.tool, 'unknown'),
        input: asRecord(state.input) ?? {},
        output: asString(state.output),
        ...(typeof state.error === 'string' ? { error: state.error } : {}),
      })
    }
  }
  return calls
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

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) return reject(new Error('已中止'))
    const timer = setTimeout(resolve, ms)
    abortSignal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('已中止'))
    }, { once: true })
  })
}

export { formatProgress }
