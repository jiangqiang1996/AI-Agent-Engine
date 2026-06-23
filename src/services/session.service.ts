import { Effect } from 'effect'
import type { OpencodeClient } from '@opencode-ai/sdk'
import type { SessionExtractResult } from './session-extract.service.js'

const HANDOFF_CONTEXT_HEADER = 'HANDOFF CONTEXT'
const HANDOFF_CONTEXT_UNDERLINE = '==============='

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

/** 将交接上下文的通用 section 批量推入 sections 数组 */
function pushHandoffSections(sections: string[], extractResult: SessionExtractResult): void {
  pushSection(sections, 'USER REQUESTS (AS-IS)', '---------------------', extractResult.userRequests)
  pushSection(sections, 'GOAL', '----', extractResult.goal)
  pushSection(sections, 'WORK COMPLETED', '--------------', extractResult.workCompleted)
  pushSection(sections, 'CURRENT STATE', '-------------', extractResult.currentState)
  pushSection(sections, 'PENDING TASKS', '-------------', extractResult.pendingTasks)
  pushSection(sections, 'KEY FILES', '---------', extractResult.keyFiles)
  pushSection(sections, 'IMPORTANT DECISIONS', '-------------------', extractResult.importantDecisions)
  pushSection(sections, 'EXPLICIT CONSTRAINTS', '--------------------', extractResult.explicitConstraints)
  pushSection(sections, 'CONTEXT FOR CONTINUATION', '------------------------', extractResult.contextForContinuation)
}

/** 将会话提取结果格式化为系统提示词，用于注入新会话的 system prompt。 */
export function formatSystemPrompt(extractResult: SessionExtractResult): string {
  const sections: string[] = []
  sections.push(HANDOFF_CONTEXT_HEADER)
  sections.push(HANDOFF_CONTEXT_UNDERLINE)
  sections.push('')

  pushHandoffSections(sections, extractResult)

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('以上是之前会话的完整交接上下文，直接作为已知信息使用，不需要向用户核对。')

  return sections.join('\n').trim()
}

/** 将会话提取结果格式化为上下文消息，用于降级注入到会话历史中。 */
export function formatContextMessage(extractResult: SessionExtractResult): string {
  const sections: string[] = []
  // 降级注入会作为普通消息出现在会话中，因此需要显式标记来源和不可删除提示。
  sections.push('## 🔍 会话交接上下文（系统消息，请勿删除）')
  sections.push('本会话由原会话交接生成，以下是原会话的核心信息：')
  sections.push('')
  sections.push(HANDOFF_CONTEXT_HEADER)
  sections.push(HANDOFF_CONTEXT_UNDERLINE)
  sections.push('')

  pushHandoffSections(sections, extractResult)

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('⚠️ 此消息为系统上下文，请勿删除或修改，否则会影响后续任务执行。')

  return sections.join('\n').trim()
}

/** 通过 OpencodeClient 创建新会话，返回会话 ID、标题和路径。 */
export function createNewSession(
  client: OpencodeClient,
  options: CreateSessionOptions,
): Effect.Effect<CreatedSession, Error> {
  return Effect.tryPromise(async () => {
    const res = await client.session.create({
      body: { title: options.title },
    })
    if (res.error) {
      throw new Error(`创建新会话失败: ${res.error.data?.message ?? res.error.name ?? '未知错误'}`)
    }
    const session = res.data
    if (!session?.id) {
      throw new Error(`创建新会话失败: 返回数据为空或缺少 id 字段`)
    }
    return {
      id: session.id,
      title: session.title ?? options.title,
      url: `/sessions/${session.id}`,
    }
  })
}

/** SDK v1 类型未声明 tui.session.select 事件，但 opencode 服务端支持该事件 */
type TuiPublishBody = NonNullable<NonNullable<Parameters<OpencodeClient['tui']['publish']>[0]>['body']>

/** 将交接上下文以普通消息形式注入到指定会话（降级路径，不需要 system prompt 支持）。 */
export function injectContextAsMessage(
  client: OpencodeClient,
  sessionId: string,
  extractResult: SessionExtractResult,
): Effect.Effect<void, Error> {
  const contextContent = formatContextMessage(extractResult)
  return injectNoReplyMessage(client, sessionId, contextContent)
}

/** 将字符串上下文以 noReply 普通消息注入指定会话。 */
export function injectNoReplyMessage(
  client: OpencodeClient,
  sessionId: string,
  text: string,
): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: 'text', text }],
      },
    })
  })
}

/** 优先以 system 字段注入上下文，失败时由调用方决定是否降级。 */
export function injectSystemPrompt(
  client: OpencodeClient,
  sessionId: string,
  systemPrompt: string,
): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        system: systemPrompt,
        parts: [{ type: 'text', text: systemPrompt }],
      },
    })
  })
}

/** 向指定会话提交用户提示词并触发回复。 */
export function submitUserPrompt(
  client: OpencodeClient,
  sessionId: string,
  text: string,
): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text }],
      },
    })
  })
}

/** 通过 TUI 发布事件导航到指定会话。 */
export function navigateToSession(
  client: OpencodeClient,
  sessionId: string,
): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.tui.publish({
      body: {
        type: 'tui.session.select',
        properties: {
          sessionID: sessionId,
        },
      } as unknown as TuiPublishBody,
    })
  })
}
