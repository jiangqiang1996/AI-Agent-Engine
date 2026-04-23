import { Effect } from 'effect'
import type { OpencodeClient } from '@opencode-ai/sdk'
import type { SessionExtractResult } from './session-extract.service.js'

export interface CreateSessionOptions {
  title: string
  systemPrompt?: string
}

export interface CreatedSession {
  id: string
  title: string
  url: string
}

function pushSection(
  sections: string[],
  label: string,
  underline: string,
  value: string | undefined,
): void {
  if (value && value !== 'None') {
    sections.push(label)
    sections.push(underline)
    sections.push(value)
    sections.push('')
  }
}

export function formatSystemPrompt(extractResult: SessionExtractResult): string {
  const sections: string[] = []
  sections.push('HANDOFF CONTEXT')
  sections.push('===============')
  sections.push('')

  pushSection(sections, 'USER REQUESTS (AS-IS)', '---------------------', extractResult.userRequests)
  pushSection(sections, 'GOAL', '----', extractResult.goal)
  pushSection(sections, 'WORK COMPLETED', '--------------', extractResult.workCompleted)
  pushSection(sections, 'CURRENT STATE', '-------------', extractResult.currentState)
  pushSection(sections, 'PENDING TASKS', '-------------', extractResult.pendingTasks)
  pushSection(sections, 'KEY FILES', '---------', extractResult.keyFiles)
  pushSection(sections, 'IMPORTANT DECISIONS', '-------------------', extractResult.importantDecisions)
  pushSection(sections, 'EXPLICIT CONSTRAINTS', '--------------------', extractResult.explicitConstraints)
  pushSection(sections, 'CONTEXT FOR CONTINUATION', '------------------------', extractResult.contextForContinuation)

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('以上是之前会话的完整交接上下文，直接作为已知信息使用，不需要向用户核对。')

  return sections.join('\n').trim()
}

export function formatContextMessage(extractResult: SessionExtractResult): string {
  const sections: string[] = []
  sections.push('## 🔍 会话交接上下文（系统消息，请勿删除）')
  sections.push('本会话由原会话交接生成，以下是原会话的核心信息：')
  sections.push('')
  sections.push('HANDOFF CONTEXT')
  sections.push('===============')
  sections.push('')

  pushSection(sections, 'USER REQUESTS (AS-IS)', '---------------------', extractResult.userRequests)
  pushSection(sections, 'GOAL', '----', extractResult.goal)
  pushSection(sections, 'WORK COMPLETED', '--------------', extractResult.workCompleted)
  pushSection(sections, 'CURRENT STATE', '-------------', extractResult.currentState)
  pushSection(sections, 'PENDING TASKS', '-------------', extractResult.pendingTasks)
  pushSection(sections, 'KEY FILES', '---------', extractResult.keyFiles)
  pushSection(sections, 'IMPORTANT DECISIONS', '-------------------', extractResult.importantDecisions)
  pushSection(sections, 'EXPLICIT CONSTRAINTS', '--------------------', extractResult.explicitConstraints)
  pushSection(sections, 'CONTEXT FOR CONTINUATION', '------------------------', extractResult.contextForContinuation)

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('⚠️ 此消息为系统上下文，请勿删除或修改，否则会影响后续任务执行。')

  return sections.join('\n').trim()
}

export function createNewSession(
  client: OpencodeClient,
  options: CreateSessionOptions,
): Effect.Effect<CreatedSession, Error> {
  return Effect.tryPromise(async () => {
    const res = await client.session.create({
      body: { title: options.title },
    })
    const payload = res as unknown as Record<string, unknown>
    const session = (payload.data ?? payload) as { id: string; title?: string } | undefined
    if (!session || !session.id) {
      throw new Error(`创建新会话失败: 返回数据为空或缺少 id 字段`)
    }
    return {
      id: session.id,
      title: session.title ?? options.title,
      url: `/sessions/${session.id}`,
    }
  })
}

interface SessionPromptClient {
  session: {
    prompt: (args: {
      path: { id: string }
      body: { noReply: boolean; parts: Array<{ type: 'text'; text: string }> }
    }) => Promise<unknown>
  }
}

interface TuiPublishClient {
  tui: {
    publish: (args: {
      body: { type: 'tui.session.select'; properties: { sessionID: string } }
    }) => Promise<unknown>
  }
}

export function injectContextAsMessage(
  client: unknown,
  sessionId: string,
  extractResult: SessionExtractResult,
): Effect.Effect<void, Error> {
  const promptClient = client as SessionPromptClient
  const contextContent = formatContextMessage(extractResult)

  return Effect.tryPromise(async () => {
    await promptClient.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: 'text', text: contextContent }],
      },
    })
  })
}

export function navigateToSession(
  client: unknown,
  sessionId: string,
): Effect.Effect<void, Error> {
  const tuiClient = client as TuiPublishClient
  return Effect.tryPromise(async () => {
    await tuiClient.tui.publish({
      body: {
        type: 'tui.session.select',
        properties: {
          sessionID: sessionId,
        },
      },
    })
  })
}
