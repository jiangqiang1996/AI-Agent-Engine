import { Effect } from 'effect'
import type { ToolContext } from '@opencode-ai/plugin/tool'
import type { OpencodeClient } from '@opencode-ai/sdk'

import type { SessionExtractResult } from './session-extract.service.js'
import {
  createNewSession,
  formatSystemPrompt,
  injectContextAsMessage,
  navigateToSession,
} from './session.service.js'

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

  return Effect.gen(function* () {
    const session = yield* createNewSession(client, { title: sessionTitle }).pipe(
      Effect.mapError((e) => new SessionCreateError(e.message)),
    )

    const fallback = yield* Effect.tryPromise({
      try: () =>
        client.session
          .prompt({
            path: { id: session.id },
            body: {
              noReply: true,
              system: systemPrompt,
              parts: [{ type: 'text', text: systemPrompt }],
            },
          })
          .then(() => false),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    }).pipe(
      Effect.matchEffect({
        onSuccess: () => Effect.succeed(false),
        onFailure: () =>
          injectContextAsMessage(client, session.id, extractResult).pipe(
            Effect.map(() => true),
            Effect.mapError((e) => new ContextInjectError(e.message)),
          ),
      }),
    )

    const navigated = yield* navigateToSession(client, session.id).pipe(
      Effect.match({
        onSuccess: () => true,
        onFailure: () => false,
      }),
    )

    return { id: session.id, url: session.url, fallback, navigated }
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
  _context: ToolContext,
  client: OpencodeClient,
  extractResult: SessionExtractResult,
): Effect.Effect<HandoffResult, SessionCreateError | ContextInjectError> {
  return Effect.gen(function* () {
    const sessionResult = yield* createSessionWithFallback(
      generateHandoffTitle(extractResult),
      extractResult,
      client,
    )

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
