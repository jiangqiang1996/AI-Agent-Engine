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

export function executeHandoff(
  context: ToolContext,
  client: any
): Effect.Effect<HandoffResult, Error> {
  return Effect.tryPromise(async () => {
    try {
      // 1. 获取当前会话ID
      const sessionId = context.sessionID
      if (!sessionId) {
        return {
          success: false,
          error: '无法获取当前会话ID',
          extractedSummary: { coreConclusions: '', decisionsMade: '', todoItems: '', projectContext: '' }
        }
      }
      
      // 2. 获取会话历史
      const messages = await Effect.runPromise(getSessionMessages(sessionId, client))
      if (messages.length === 0) {
        return {
          success: false,
          error: '当前会话无内容，无法提取上下文',
          extractedSummary: { coreConclusions: '', decisionsMade: '', todoItems: '', projectContext: '' }
        }
      }
      
      // 3. 提取核心信息：在当前会话中发送提取请求，等待LLM回复
      const extractResult = await Effect.runPromise(extractSessionContent(
        messages,
        prompt => Effect.tryPromise(async () => {
          const res = await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: 'text', text: `${prompt}\n请直接返回JSON格式结果，不要包含其他内容。` }]
            },
          })
          // 从LLM回复中提取文本内容
          const data = res.data ?? res
          if (!data || !data.parts) throw new Error('LLM未返回有效回复')
          const text = data.parts
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n')
          // 尝试从文本中解析JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) throw new Error('LLM回复中未找到有效JSON')
          return JSON.parse(jsonMatch[0])
        })
      ))
      
      // 4. 创建新会话并注入上下文
      const sessionResult = await Effect.runPromise(createSessionWithFallback(
        `交接会话: ${new Date().toLocaleString('zh-CN')}`,
        extractResult,
        client
      ))
      
      // 5. 返回结果
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
