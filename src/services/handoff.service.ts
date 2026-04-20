import { Effect } from 'effect'
import type { ToolContext } from '@opencode-ai/plugin/tool'

import { extractSessionContent, type SessionExtractResult } from './session-extract.service.js'
import { formatSystemPrompt, formatContextMessage, createNewSession, injectContextAsMessage, navigateToSession } from './session.service.js'

class HandoffError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HandoffError'
  }
}

class SessionHistoryFetchError extends HandoffError {
  constructor(message: string) {
    super(`获取会话历史失败: ${message}`)
  }
}

class SessionCreateError extends HandoffError {
  constructor(message: string) {
    super(`创建新会话失败: ${message}`)
  }
}

class ContextInjectError extends HandoffError {
  constructor(message: string) {
    super(`注入上下文失败: ${message}`)
  }
}

function getSessionMessages(sessionId: string, client: any): Effect.Effect<Array<{ content: string }>, SessionHistoryFetchError> {
  return Effect.tryPromise(async () => {
    const res = await client.session.messages({ path: { id: sessionId } })
    // SDK 默认 responseStyle='fields'，返回 { data, error, request, response }
    const messages = res.data ?? res
    if (!messages || !Array.isArray(messages)) throw new Error('返回数据为空或格式错误')
    return messages.map((item: any) => ({
      content: item.parts?.map((p: any) => p.text).join('\n') || ''
    }))
  }).pipe(Effect.mapError(e => new SessionHistoryFetchError(e.message)))
}

function createSessionWithFallback(
  sessionTitle: string,
  extractResult: SessionExtractResult,
  client: any
): Effect.Effect<{ id: string; url: string; fallback: boolean }, SessionCreateError | ContextInjectError> {
  const systemPrompt = formatSystemPrompt(extractResult)
  
  return Effect.tryPromise(async () => {
    const session = await Effect.runPromise(createNewSession(client, { title: sessionTitle }))
    
    try {
      await client.session.prompt({
        path: { id: session.id },
        body: {
          noReply: true,
          system: systemPrompt,
          parts: [{ type: 'text', text: systemPrompt }],
        },
      })
    } catch (_e: any) {
      await Effect.runPromise(injectContextAsMessage(client, session.id, extractResult))
    }

    // 导航 TUI 到新会话窗口
    try {
      await Effect.runPromise(navigateToSession(client, session.id))
    } catch (_e: any) {
      // TUI 导航失败不影响交接结果，用户可手动切换
    }

    return { id: session.id, url: session.url, fallback: false }
  }).pipe(Effect.mapError(e => {
    if (e.message.includes('创建新会话')) return new SessionCreateError(e.message)
    return new ContextInjectError(e.message)
  }))
}

export interface HandoffResult {
  success: boolean
  sessionId?: string
  sessionUrl?: string
  fallbackMode?: boolean
  navigated?: boolean
  extractedSummary: {
    coreConclusions: string
    decisionsMade: string
    todoItems: string
    projectContext: string
    truncated?: boolean
  }
  error?: string
}

/**
 * 最终兜底：通过 TUI 命令触发 session.new，等效于用户输入 /new
 */
function triggerNewSessionViaTui(client: any): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.tui.publish({
      body: {
        type: 'tui.command.execute',
        properties: { command: 'session.new' },
      },
    })
  })
}

/**
 * 降级创建新会话：当无法提取会话历史时，直接创建空会话并注入简要上下文
 * 如果 session.create 也失败，最终兜底通过 TUI 命令触发 /new
 */
function createSessionWithBasicContext(
  client: any,
  basicContext?: string
): Effect.Effect<{ id: string; url: string }, Error> {
  return Effect.gen(function* () {
    try {
      const session = yield* createNewSession(client, {
        title: `交接会话: ${new Date().toLocaleString('zh-CN')}`,
      })

      if (basicContext) {
        try {
          yield* injectContextAsMessage(client, session.id, {
            coreConclusions: basicContext,
            decisionsMade: '无',
            todoItems: '无',
            projectContext: '无',
          })
        } catch (_) {
          // 上下文注入失败不影响会话创建
        }
      }

      try {
        yield* navigateToSession(client, session.id)
      } catch (_) {
        // TUI 导航失败不影响交接结果
      }

      return { id: session.id, url: session.url }
    } catch (_) {
      // session.create 失败，最终兜底：通过 TUI 命令触发 /new
      try {
        yield* triggerNewSessionViaTui(client)
      } catch (__) {
        // TUI 命令也失败，放弃自动导航
      }
      return { id: 'tui-new', url: '/new' }
    }
  })
}

export function executeHandoff(
  context: ToolContext,
  client: any,
  extractResult: SessionExtractResult
): Effect.Effect<HandoffResult, Error> {
  return Effect.tryPromise(async () => {
    try {
      const sessionResult = await Effect.runPromise(createSessionWithFallback(
        `交接会话: ${new Date().toLocaleString('zh-CN')}`,
        extractResult,
        client
      ))

      return {
        success: true,
        sessionId: sessionResult.id,
        sessionUrl: sessionResult.url,
        fallbackMode: sessionResult.fallback,
        navigated: true,
        extractedSummary: {
          coreConclusions: extractResult.coreConclusions,
          decisionsMade: extractResult.decisionsMade,
          todoItems: extractResult.todoItems,
          projectContext: extractResult.projectContext,
          truncated: !!extractResult.truncatedWarning
        }
      }
    } catch (e: any) {
      return {
        success: false,
        error: e.message,
        extractedSummary: { coreConclusions: '', decisionsMade: '', todoItems: '', projectContext: '' }
      }
    }
  })
}
