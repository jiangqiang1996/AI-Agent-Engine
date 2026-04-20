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
  return `
你是一个AI助手，以下是之前会话交接的核心信息，你需要完全知晓这些内容作为上下文基础，不需要向用户重复确认：

## 🎯 核心结论
${extractResult.coreConclusions}

## ✅ 已做决策
${extractResult.decisionsMade}

## 📝 待办事项
${extractResult.todoItems}

## 📌 项目上下文
${extractResult.projectContext}

${extractResult.truncatedWarning || ""}

以上信息是之前会话的结论，直接作为已知上下文使用即可，不需要与用户核对。
`.trim();
}

export function formatContextMessage(extractResult: SessionExtractResult): string {
  return `
## 🔍 会话交接上下文（系统消息，请勿删除）
本会话由原会话交接生成，以下是原会话的核心信息：

### 🎯 核心结论
${extractResult.coreConclusions}

### ✅ 已做决策
${extractResult.decisionsMade}

### 📝 待办事项
${extractResult.todoItems}

### 📌 项目上下文
${extractResult.projectContext}

${extractResult.truncatedWarning || ""}

⚠️ 此消息为系统上下文，请勿删除或修改，否则会影响后续任务执行。
  `.trim();
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
