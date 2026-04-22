import { Effect } from "effect";
import type { OpencodeClient } from "@opencode-ai/sdk";
import type { SessionExtractResult } from "./session-extract.service.js";

export interface CreateSessionOptions {
  title: string;
  systemPrompt?: string;
}

export interface CreatedSession {
  id: string;
  title: string;
  url: string;
}

export function formatSystemPrompt(extractResult: SessionExtractResult): string {
  const sections = []
  sections.push('HANDOFF CONTEXT')
  sections.push('===============')
  sections.push('')

  if (extractResult.userRequests !== 'None') {
    sections.push('USER REQUESTS (AS-IS)')
    sections.push('---------------------')
    sections.push(extractResult.userRequests)
    sections.push('')
  }

  if (extractResult.goal !== 'None') {
    sections.push('GOAL')
    sections.push('----')
    sections.push(extractResult.goal)
    sections.push('')
  }

  if (extractResult.workCompleted !== 'None') {
    sections.push('WORK COMPLETED')
    sections.push('--------------')
    sections.push(extractResult.workCompleted)
    sections.push('')
  }

  if (extractResult.currentState !== 'None') {
    sections.push('CURRENT STATE')
    sections.push('-------------')
    sections.push(extractResult.currentState)
    sections.push('')
  }

  if (extractResult.pendingTasks !== 'None') {
    sections.push('PENDING TASKS')
    sections.push('-------------')
    sections.push(extractResult.pendingTasks)
    sections.push('')
  }

  if (extractResult.keyFiles !== 'None') {
    sections.push('KEY FILES')
    sections.push('---------')
    sections.push(extractResult.keyFiles)
    sections.push('')
  }

  if (extractResult.importantDecisions !== 'None') {
    sections.push('IMPORTANT DECISIONS')
    sections.push('-------------------')
    sections.push(extractResult.importantDecisions)
    sections.push('')
  }

  if (extractResult.explicitConstraints !== 'None') {
    sections.push('EXPLICIT CONSTRAINTS')
    sections.push('--------------------')
    sections.push(extractResult.explicitConstraints)
    sections.push('')
  }

  if (extractResult.contextForContinuation !== 'None') {
    sections.push('CONTEXT FOR CONTINUATION')
    sections.push('------------------------')
    sections.push(extractResult.contextForContinuation)
    sections.push('')
  }

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('以上是之前会话的完整交接上下文，直接作为已知信息使用，不需要向用户核对。')

  return sections.join('\n').trim()
}

export function formatContextMessage(extractResult: SessionExtractResult): string {
  const sections = []
  sections.push('## 🔍 会话交接上下文（系统消息，请勿删除）')
  sections.push('本会话由原会话交接生成，以下是原会话的核心信息：')
  sections.push('')
  sections.push('HANDOFF CONTEXT')
  sections.push('===============')
  sections.push('')

  if (extractResult.userRequests !== 'None') {
    sections.push('USER REQUESTS (AS-IS)')
    sections.push('---------------------')
    sections.push(extractResult.userRequests)
    sections.push('')
  }

  if (extractResult.goal !== 'None') {
    sections.push('GOAL')
    sections.push('----')
    sections.push(extractResult.goal)
    sections.push('')
  }

  if (extractResult.workCompleted !== 'None') {
    sections.push('WORK COMPLETED')
    sections.push('--------------')
    sections.push(extractResult.workCompleted)
    sections.push('')
  }

  if (extractResult.currentState !== 'None') {
    sections.push('CURRENT STATE')
    sections.push('-------------')
    sections.push(extractResult.currentState)
    sections.push('')
  }

  if (extractResult.pendingTasks !== 'None') {
    sections.push('PENDING TASKS')
    sections.push('-------------')
    sections.push(extractResult.pendingTasks)
    sections.push('')
  }

  if (extractResult.keyFiles !== 'None') {
    sections.push('KEY FILES')
    sections.push('---------')
    sections.push(extractResult.keyFiles)
    sections.push('')
  }

  if (extractResult.importantDecisions !== 'None') {
    sections.push('IMPORTANT DECISIONS')
    sections.push('-------------------')
    sections.push(extractResult.importantDecisions)
    sections.push('')
  }

  if (extractResult.explicitConstraints !== 'None') {
    sections.push('EXPLICIT CONSTRAINTS')
    sections.push('--------------------')
    sections.push(extractResult.explicitConstraints)
    sections.push('')
  }

  if (extractResult.contextForContinuation !== 'None') {
    sections.push('CONTEXT FOR CONTINUATION')
    sections.push('------------------------')
    sections.push(extractResult.contextForContinuation)
    sections.push('')
  }

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('⚠️ 此消息为系统上下文，请勿删除或修改，否则会影响后续任务执行。')

  return sections.join('\n').trim()
}

/**
 * 创建新会话
 * SDK session.create 返回 RequestResult，默认 responseStyle='fields'：
 *   { data: Session, error, request, response }
 */
export function createNewSession(
  client: OpencodeClient,
  options: CreateSessionOptions
): Effect.Effect<CreatedSession, Error> {
  return Effect.tryPromise(async () => {
    const res = await client.session.create({
      body: { title: options.title },
    });
    // SDK 可能直接返回 Session，或返回 { data, error, request, response }
    // 先转为 unknown 再做类型守卫，避免使用 any
    const payload = res as unknown as Record<string, unknown>;
    const session = (payload.data ?? payload) as { id: string; title?: string } | undefined;
    if (!session || !session.id) {
      throw new Error(`创建新会话失败: 返回数据为空或缺少 id 字段`);
    }
    return {
      id: session.id,
      title: session.title ?? options.title,
      url: `/sessions/${session.id}`,
    };
  });
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

/**
 * 降级方案：将上下文作为新会话第一条消息注入
 */
export function injectContextAsMessage(
  client: unknown,
  sessionId: string,
  extractResult: SessionExtractResult
): Effect.Effect<void, Error> {
  const promptClient = client as SessionPromptClient;
  const contextContent = formatContextMessage(extractResult);
  
  return Effect.tryPromise(async () => {
    await promptClient.session.prompt({
      path: { id: sessionId },
      body: {
        noReply: true,
        parts: [{ type: "text", text: contextContent }],
      },
    });
  });
}

/**
 * 导航 TUI 到指定会话
 * 使用 tui.publish 发送 EventTuiSessionSelect 事件，
 * 使终端界面切换到目标会话窗口（类似 /new 的效果）
 */
export function navigateToSession(
  client: unknown,
  sessionId: string
): Effect.Effect<void, Error> {
  const tuiClient = client as TuiPublishClient;
  return Effect.tryPromise(async () => {
    await tuiClient.tui.publish({
      body: {
        type: "tui.session.select",
        properties: {
          sessionID: sessionId,
        },
      },
    });
  });
}
