import { Effect } from 'effect'
import type { OpencodeClient } from '@opencode-ai/sdk'

import {
  createNewSession,
  navigateToSession,
} from './session.service.js'

class PromptSessionCreateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromptSessionCreateError'
  }
}

export interface PromptOptimizeResult {
  success: boolean
  sessionId?: string
  sessionUrl?: string
  navigated?: boolean
  optimizedPrompt?: string
  error?: string
}

export function generateSessionTitle(prompt: string): string {
  const SEMANTIC_CONTENT_PATTERN = /^[\s/@]*(?:[\w:-]+[\s/@]*)+/
  const match = prompt.match(SEMANTIC_CONTENT_PATTERN)
  const cleaned = prompt
    .replace(/^[/@]\S+\s*/, '')
    .replace(/^(?:auto|自动|mode=auto|无需确认|跳过确认)\s*/i, '')
    .trim()

  const compressed = cleaned.replace(/\s+/g, ' ').slice(0, 15).trim()
  if (compressed) {
    return `优化：${compressed}${compressed.length >= 15 ? '...' : ''}`
  }
  return `优化会话：${new Date().toLocaleString('zh-CN')}`
}

export function executePromptSubmit(
  client: OpencodeClient,
  optimizedPrompt: string,
  sessionTitle?: string,
): Effect.Effect<PromptOptimizeResult, PromptSessionCreateError> {
  const title = sessionTitle ?? generateSessionTitle(optimizedPrompt)

  return Effect.gen(function* () {
    const session = yield* createNewSession(client, { title }).pipe(
      Effect.mapError((e) => new PromptSessionCreateError(e.message)),
    )

    const navigated = yield* navigateToSession(client, session.id).pipe(
      Effect.match({
        onSuccess: () => true,
        onFailure: () => false,
      }),
    )

    client.session
      .prompt({
        path: { id: session.id },
        body: {
          parts: [{ type: 'text', text: optimizedPrompt }],
        },
      })
      .catch(() => {})

    return {
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
      navigated,
      optimizedPrompt,
    }
  })
}
