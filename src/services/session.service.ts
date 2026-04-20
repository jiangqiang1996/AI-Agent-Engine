import { Effect } from "effect";
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
  sections.push('你是一个AI助手，以下是之前会话交接的核心信息，你需要完全知晓这些内容作为上下文基础，不需要向用户重复确认：')
  sections.push('')

  if (extractResult.coreConclusions !== '无') {
    sections.push('## 🎯 核心结论')
    sections.push(extractResult.coreConclusions)
    sections.push('')
  }

  if (extractResult.decisionsMade !== '无') {
    sections.push('## ✅ 已做决策')
    sections.push(extractResult.decisionsMade)
    sections.push('')
  }

  if (extractResult.todoItems !== '无') {
    sections.push('## 📝 待办事项')
    sections.push(extractResult.todoItems)
    sections.push('')
  }

  if (extractResult.projectContext !== '无') {
    sections.push('## 📌 项目上下文')
    sections.push(extractResult.projectContext)
    sections.push('')
  }

  if (extractResult.techStack !== '无') {
    sections.push('## 🛠️ 技术栈')
    sections.push(extractResult.techStack)
    sections.push('')
  }

  if (extractResult.riskNotes !== '无') {
    sections.push('## ⚠️ 风险提示')
    sections.push(extractResult.riskNotes)
    sections.push('')
  }

  if (extractResult.dependencies !== '无') {
    sections.push('## 🔗 依赖关系')
    sections.push(extractResult.dependencies)
    sections.push('')
  }

  if (extractResult.references !== '无') {
    sections.push('## 📚 参考资料')
    sections.push(extractResult.references)
    sections.push('')
  }

  if (extractResult.assignees !== '无') {
    sections.push('## 👥 人员分工')
    sections.push(extractResult.assignees)
    sections.push('')
  }

  if (extractResult.deadlines !== '无') {
    sections.push('## ⏰ 截止日期')
    sections.push(extractResult.deadlines)
    sections.push('')
  }

  if (extractResult.debugInfo !== '无') {
    sections.push('## 🔍 调试信息')
    sections.push(extractResult.debugInfo)
    sections.push('')
  }

  if (extractResult.truncatedWarning) {
    sections.push(extractResult.truncatedWarning)
    sections.push('')
  }

  sections.push('以上信息是之前会话的结论，直接作为已知上下文使用即可，不需要与用户核对。')

  return sections.join('\n').trim()
}

export function formatContextMessage(extractResult: SessionExtractResult): string {
  const sections = []
  sections.push('## 🔍 会话交接上下文（系统消息，请勿删除）')
  sections.push('本会话由原会话交接生成，以下是原会话的核心信息：')
  sections.push('')

  if (extractResult.coreConclusions !== '无') {
    sections.push('### 🎯 核心结论')
    sections.push(extractResult.coreConclusions)
    sections.push('')
  }

  if (extractResult.decisionsMade !== '无') {
    sections.push('### ✅ 已做决策')
    sections.push(extractResult.decisionsMade)
    sections.push('')
  }

  if (extractResult.todoItems !== '无') {
    sections.push('### 📝 待办事项')
    sections.push(extractResult.todoItems)
    sections.push('')
  }

  if (extractResult.projectContext !== '无') {
    sections.push('### 📌 项目上下文')
    sections.push(extractResult.projectContext)
    sections.push('')
  }

  if (extractResult.techStack !== '无') {
    sections.push('### 🛠️ 技术栈')
    sections.push(extractResult.techStack)
    sections.push('')
  }

  if (extractResult.riskNotes !== '无') {
    sections.push('### ⚠️ 风险提示')
    sections.push(extractResult.riskNotes)
    sections.push('')
  }

  if (extractResult.dependencies !== '无') {
    sections.push('### 🔗 依赖关系')
    sections.push(extractResult.dependencies)
    sections.push('')
  }

  if (extractResult.references !== '无') {
    sections.push('### 📚 参考资料')
    sections.push(extractResult.references)
    sections.push('')
  }

  if (extractResult.assignees !== '无') {
    sections.push('### 👥 人员分工')
    sections.push(extractResult.assignees)
    sections.push('')
  }

  if (extractResult.deadlines !== '无') {
    sections.push('### ⏰ 截止日期')
    sections.push(extractResult.deadlines)
    sections.push('')
  }

  if (extractResult.debugInfo !== '无') {
    sections.push('### 🔍 调试信息')
    sections.push(extractResult.debugInfo)
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
  client: any,
  options: CreateSessionOptions
): Effect.Effect<CreatedSession, Error> {
  return Effect.tryPromise(async () => {
    const res = await client.session.create({
      body: { title: options.title },
    });
    // SDK 默认返回 { data, error, request, response }，data 为 Session 对象
    const session = res.data ?? res;
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

/**
 * 降级方案：将上下文作为新会话第一条消息注入
 */
export function injectContextAsMessage(
  client: any,
  sessionId: string,
  extractResult: SessionExtractResult
): Effect.Effect<void, Error> {
  const contextContent = formatContextMessage(extractResult);
  
  return Effect.tryPromise(async () => {
    await client.session.prompt({
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
  client: any,
  sessionId: string
): Effect.Effect<void, Error> {
  return Effect.tryPromise(async () => {
    await client.tui.publish({
      body: {
        type: "tui.session.select",
        properties: {
          sessionID: sessionId,
        },
      },
    });
  });
}
