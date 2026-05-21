import { Effect } from 'effect'
import type { OpencodeClient } from '@opencode-ai/sdk'

import { ensureBrowserEnvironmentGate } from './browser-environment-gate.js'
import {
  createNewSession,
  injectNoReplyMessage,
  injectSystemPrompt,
  navigateToSession,
  submitUserPrompt,
} from './session.service.js'

export interface CreateSessionRequest {
  title: string
  systemPrompt?: string
  contextMessage?: string
  userPrompt?: string
  autoExecute?: boolean
  navigate?: boolean
}

export interface CreateSessionResult {
  success: boolean
  partial: boolean
  sessionId?: string
  sessionUrl?: string
  navigated: boolean
  contextInjected: boolean
  fallbackMode: boolean
  promptAttempted: boolean
  promptSubmitted: boolean
  warnings: string[]
  error?: string
  recoverablePrompt?: string
  recoverableContext?: string
}

export class CreateSessionFlowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CreateSessionFlowError'
  }
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function applyAutomaticExecutionGate(
  systemPrompt: string | undefined,
  contextMessage: string | undefined,
  userPrompt: string,
): string {
  const executionContext = [systemPrompt, contextMessage, userPrompt].filter(Boolean).join('\n\n')
  const gatedExecutionContext = ensureBrowserEnvironmentGate(executionContext)
  if (gatedExecutionContext === executionContext) {
    return userPrompt
  }

  const gatedUserPrompt = ensureBrowserEnvironmentGate(userPrompt)
  return gatedUserPrompt === userPrompt ? gatedExecutionContext : gatedUserPrompt
}

/** 编排通用的新会话创建、上下文注入、导航和可选自动执行流程。 */
export function createSessionFlow(
  client: OpencodeClient,
  request: CreateSessionRequest,
): Effect.Effect<CreateSessionResult, CreateSessionFlowError> {
  const title = trimOptional(request.title) ?? `新会话：${new Date().toLocaleString('zh-CN')}`
  const systemPrompt = trimOptional(request.systemPrompt)
  const contextMessage = trimOptional(request.contextMessage)
  const autoExecute = request.autoExecute === true
  const shouldNavigate = request.navigate !== false
  const userPrompt = trimOptional(request.userPrompt)

  if (autoExecute && !userPrompt) {
    return Effect.fail(new CreateSessionFlowError('auto_execute=true 时必须提供非空 user_prompt。'))
  }

  return Effect.gen(function* () {
    const warnings: string[] = []
    let contextInjected = false
    let fallbackMode = false
    let navigated = false
    let promptAttempted = false
    let promptSubmitted = false
    let recoverablePrompt: string | undefined
    const recoverableContext = systemPrompt ?? contextMessage

    const session = yield* createNewSession(client, { title }).pipe(
      Effect.mapError((error) => new CreateSessionFlowError(error.message)),
    )

    if (systemPrompt) {
      const injectedSystem = yield* injectSystemPrompt(client, session.id, systemPrompt).pipe(
        Effect.matchEffect({
          onSuccess: () => Effect.succeed(true),
          onFailure: (error) => {
            warnings.push(`system 上下文注入失败，尝试降级为普通消息：${error.message}`)
            fallbackMode = true
            return Effect.succeed(false)
          },
        }),
      )

      if (injectedSystem) {
        contextInjected = true
      } else if (contextMessage) {
        yield* injectNoReplyMessage(client, session.id, contextMessage).pipe(
          Effect.mapError((error) => new CreateSessionFlowError(`上下文降级注入失败：${error.message}`)),
        )
        contextInjected = true
      } else {
        yield* injectNoReplyMessage(client, session.id, systemPrompt).pipe(
          Effect.mapError((error) => new CreateSessionFlowError(`上下文降级注入失败：${error.message}`)),
        )
        contextInjected = true
      }
    } else if (contextMessage) {
      yield* injectNoReplyMessage(client, session.id, contextMessage).pipe(
        Effect.mapError((error) => new CreateSessionFlowError(`上下文注入失败：${error.message}`)),
      )
      contextInjected = true
    }

    if (shouldNavigate) {
      navigated = yield* navigateToSession(client, session.id).pipe(
        Effect.match({
          onSuccess: () => true,
          onFailure: (error) => {
            warnings.push(`导航失败：${error.message}`)
            return false
          },
        }),
      )
    }

    if (autoExecute && userPrompt) {
      promptAttempted = true
      recoverablePrompt = applyAutomaticExecutionGate(systemPrompt, contextMessage, userPrompt)
      yield* submitUserPrompt(client, session.id, recoverablePrompt).pipe(
        Effect.matchEffect({
          onSuccess: () => {
            promptSubmitted = true
            return Effect.succeed(undefined)
          },
          onFailure: (error) => {
            warnings.push(`提示词提交失败：${error.message}`)
            return Effect.succeed(undefined)
          },
        }),
      )
    }

    const partial = warnings.length > 0 || (promptAttempted && !promptSubmitted)

    return {
      success: !promptAttempted || promptSubmitted,
      partial,
      sessionId: session.id,
      sessionUrl: session.url,
      navigated,
      contextInjected,
      fallbackMode,
      promptAttempted,
      promptSubmitted,
      warnings,
      recoverablePrompt,
      recoverableContext,
    }
  })
}
