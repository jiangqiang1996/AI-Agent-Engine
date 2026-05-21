import { Effect } from 'effect'
import type { OpencodeClient } from '@opencode-ai/sdk'

import { createSessionFlow } from './session-create.service.js'

class PromptSessionCreateError extends Error {
  readonly recoverablePrompt?: string

  constructor(message: string, recoverablePrompt?: string) {
    super(message)
    this.name = 'PromptSessionCreateError'
    this.recoverablePrompt = recoverablePrompt
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
  // 标题只剥离命令壳和 auto 触发词，保留用户真正想执行的语义片段。
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
    const result = yield* createSessionFlow(client, {
      title,
      userPrompt: optimizedPrompt,
      autoExecute: true,
      navigate: true,
    }).pipe(
      Effect.mapError((e) => new PromptSessionCreateError(e.message)),
    )

    if (result.partial && !result.promptSubmitted) {
      return yield* Effect.fail(
        new PromptSessionCreateError(result.warnings.join('；') || '提示词提交失败', result.recoverablePrompt),
      )
    }

    return {
      success: result.success,
      sessionId: result.sessionId,
      sessionUrl: result.sessionUrl,
      navigated: result.navigated,
      optimizedPrompt,
    }
  })
}
