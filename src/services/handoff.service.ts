import { Effect } from 'effect'
import type { ToolContext } from '@opencode-ai/plugin'
import type { OpencodeClient } from '@opencode-ai/sdk/v2'

import type { SessionExtractResult } from './session-extract.service.js'
import {
  formatContextMessage,
  formatSystemPrompt,
  forkSession,
  injectNoReplyMessage,
  injectSystemPrompt,
  navigateToSession,
} from './session.service.js'
import { createSessionFlow } from './session-create.service.js'

class SessionCreateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionCreateError'
  }
}

class ContextInjectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContextInjectError'
  }
}

function generateHandoffTitle(extractResult: SessionExtractResult): string {
  const content =
    extractResult.goal.trim() ||
    extractResult.workCompleted.trim() ||
    extractResult.pendingTasks.trim() ||
    extractResult.importantDecisions.trim()

  const compressed = content.replace(/\s+/g, ' ').slice(0, 15).trim()
  if (compressed) {
    return `交接：${compressed}${compressed.length >= 15 ? '...' : ''}`
  }
  return `交接会话：${new Date().toLocaleString('zh-CN')}`
}

function createSessionWithFallback(
  sessionTitle: string,
  extractResult: SessionExtractResult,
  client: OpencodeClient,
): Effect.Effect<
  { id: string; url: string; fallback: boolean; navigated: boolean },
  SessionCreateError | ContextInjectError
> {
  const systemPrompt = formatSystemPrompt(extractResult)
  const contextMessage = formatContextMessage(extractResult)

  return Effect.gen(function* () {
    const result = yield* createSessionFlow(client, {
      title: sessionTitle,
      systemPrompt,
      contextMessage,
      navigate: true,
    }).pipe(
      Effect.mapError((e) => {
        if (e.message.includes('上下文')) {
          return new ContextInjectError(e.message)
        }
        return new SessionCreateError(e.message)
      }),
    )

    if (!result.contextInjected) {
      return yield* Effect.fail(new ContextInjectError(result.error ?? '上下文注入失败'))
    }

    return {
      id: result.sessionId ?? '',
      url: result.sessionUrl ?? '',
      fallback: result.fallbackMode,
      navigated: result.navigated,
    }
  })
}

export interface HandoffResult {
  success: boolean
  sessionId?: string
  sessionUrl?: string
  fallbackMode?: boolean
  navigated?: boolean
  extractedSummary: {
    userRequests: string
    goal: string
    workCompleted: string
    currentState: string
    pendingTasks: string
    keyFiles: string
    importantDecisions: string
    explicitConstraints: string
    contextForContinuation: string
    truncated?: boolean
    compressionLevel?: number
  }
  error?: string
}

export function executeHandoff(
  context: ToolContext,
  client: OpencodeClient,
  extractResult: SessionExtractResult,
): Effect.Effect<HandoffResult, SessionCreateError | ContextInjectError> {
  return Effect.gen(function* () {
    let sessionResult: { id: string; url: string; fallback: boolean; navigated: boolean }

    const sourceSessionID = context.sessionID
    const canFork = typeof sourceSessionID === 'string' && sourceSessionID.length > 0

    if (canFork) {
      // 优先尝试 session.fork 从当前会话分叉，保留原始会话历史
      const forkResult = yield* forkSession(client, sourceSessionID).pipe(
        Effect.matchEffect({
          onSuccess: (forked) => {
            const systemPrompt = formatSystemPrompt(extractResult)
            const contextMessage = formatContextMessage(extractResult)
            // fork 成功后注入交接上下文，注入失败时仍使用 fork 会话（历史有价值）
            return injectSystemPrompt(client, forked.id, systemPrompt).pipe(
              Effect.matchEffect({
                onSuccess: () => Effect.succeed({ session: forked, fallback: false }),
                onFailure: () =>
                  injectNoReplyMessage(client, forked.id, contextMessage).pipe(
                    Effect.matchEffect({
                      onSuccess: () => Effect.succeed({ session: forked, fallback: false }),
                      onFailure: () => Effect.succeed({ session: forked, fallback: true }),
                    }),
                  ),
              }),
            )
          },
          onFailure: () => Effect.succeed({ session: null, fallback: false }),
        }),
      )

      if (forkResult.session) {
        const navigated = yield* navigateToSession(client, forkResult.session.id).pipe(
          Effect.match({
            onSuccess: () => true,
            onFailure: () => false,
          }),
        )
        sessionResult = {
          id: forkResult.session.id,
          url: forkResult.session.url,
          fallback: forkResult.fallback,
          navigated,
        }
      } else {
        // fork 失败时回退到创建新会话 + 注入上下文
        sessionResult = yield* createSessionWithFallback(
          generateHandoffTitle(extractResult),
          extractResult,
          client,
        )
      }
    } else {
      // 无 sessionID 时直接创建新会话 + 注入上下文
      sessionResult = yield* createSessionWithFallback(
        generateHandoffTitle(extractResult),
        extractResult,
        client,
      )
    }

    return {
      success: true,
      sessionId: sessionResult.id,
      sessionUrl: sessionResult.url,
      fallbackMode: sessionResult.fallback,
      navigated: sessionResult.navigated,
      extractedSummary: {
        userRequests: extractResult.userRequests,
        goal: extractResult.goal,
        workCompleted: extractResult.workCompleted,
        currentState: extractResult.currentState,
        pendingTasks: extractResult.pendingTasks,
        keyFiles: extractResult.keyFiles,
        importantDecisions: extractResult.importantDecisions,
        explicitConstraints: extractResult.explicitConstraints,
        contextForContinuation: extractResult.contextForContinuation,
        truncated: !!extractResult.truncatedWarning,
        compressionLevel: extractResult.compressionLevel,
      },
    }
  })
}
