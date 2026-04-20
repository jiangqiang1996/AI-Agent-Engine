import { z } from "zod";
import { Effect } from "effect";

/**
 * 会话提取结果Schema
 */
export const SessionExtractResultSchema = z.object({
  coreConclusions: z.string().default("无").describe("核心结论列表，每条用换行分隔"),
  decisionsMade: z.string().default("无").describe("已做决策列表，每条用换行分隔"),
  todoItems: z.string().default("无").describe("待办事项列表，每条用换行分隔"),
  projectContext: z.string().default("无").describe("项目上下文信息，用换行分隔"),
  truncatedWarning: z.string().optional().describe("超长会话截断提示，如存在则返回"),
});

export type SessionExtractResult = z.infer<typeof SessionExtractResultSchema>;

/**
 * 敏感信息匹配规则
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // AWS 密钥
  /AKIA[0-9A-Z]{16}/gi,
  // 通用密钥/Token
  /(sk|pk|api[_-]key|token|secret|password)[:=]\s*[A-Za-z0-9+/_-]+/gi,
  // 密码字段匹配
  /password\s*=\s*["']?[^"']+["']?/gi,
  // 中国大陆手机号
  /1[3-9]\d{9}/g,
  // 中国大陆身份证号
  /\d{17}[\dXx]|\d{15}/g,
  // 邮箱地址
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g,
  // 私钥文件内容
  /-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----.*?-----END \1 PRIVATE KEY-----/gs,
];

/**
 * 文本脱敏函数：替换所有敏感信息为***
 */
function desensitizeText(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const eqIdx = match.indexOf("=");
      const colonIdx = match.indexOf(":");
      if (eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
        return `${match.slice(0, eqIdx + 1)}***`;
      }
      if (colonIdx !== -1) {
        return `${match.slice(0, colonIdx + 1)} ***`;
      }
      return "***";
    });
  }
  return result;
}

/**
 * 超长会话截断函数：优先保留最新消息，避免超过LLM上下文限制
 */
function truncateSessionContent(
  messages: Array<{ content: string }>,
  maxTokens: number = 16000
): { content: string; truncatedWarning?: string } {
  // 简单估算：1 token ≈ 4 个字符，预留20%空间给系统prompt
  const maxLength = Math.floor(maxTokens * 4 * 0.8);
  // 复制数组再反转，避免污染原数组
  const reversed = [...messages].reverse();
  const fullContent = reversed.map(m => m.content).join("\n\n");
  
  if (fullContent.length <= maxLength) {
    return { content: fullContent };
  }
  
  // 截断超长内容
  const truncatedContent = fullContent.slice(0, maxLength);
  return {
    content: truncatedContent,
    truncatedWarning: "⚠️ 会话内容过长，已优先保留最近的核心信息，截断了部分历史聊天内容。若需要完整上下文，建议手动复制原会话内容。",
  };
}

/**
 * 信息提取系统prompt，优化用于提取会话四类核心信息
 */
const EXTRACT_PROMPT = `
你是专业的会话信息提取助手，请从以下会话内容中提取四类核心信息：
1. 核心结论：会话中达成的最终结论、问题解决方案、关键结果
2. 已做决策：会话中确定的技术选型、方案选择、优先级决策
3. 待办事项：未完成的任务清单、下一步计划、需要跟进的事项
4. 项目上下文：项目基本信息、环境配置、参数约定、已完成的工作内容

要求：
- 准确提取所有关键信息，不要遗漏
- 每类信息的每条内容单独占一行，简洁明了，去掉冗余的聊天过程
- 敏感信息已经被自动脱敏，你不需要额外处理
- 如果该类没有信息，返回"无"即可
- 不要返回任何解释性内容，只返回符合要求的JSON格式结果

会话内容：
{{session_content}}

返回的JSON必须严格遵循以下Schema：
{
  "coreConclusions": "字符串，每条结论用换行分隔，无则返回\"无\"",
  "decisionsMade": "字符串，每条决策用换行分隔，无则返回\"无\"",
  "todoItems": "字符串，每条待办用换行分隔，无则返回\"无\"",
  "projectContext": "字符串，上下文信息，无则返回\"无\""
}
`;

/**
 * 会话内容提取主函数
 * @param messages 会话消息列表
 * @param llmCall LLM调用函数，接收prompt返回JSON结果
 * @returns 结构化的提取结果，已脱敏
 */
export function extractSessionContent(
  messages: Array<{ content: string }>,
  llmCall: (prompt: string) => Effect.Effect<unknown, Error>
): Effect.Effect<SessionExtractResult, Error> {
  return Effect.gen(function* () {
    // 1. 处理超长会话截断
    const { content: rawContent, truncatedWarning } = truncateSessionContent(messages);
    
    // 2. 先脱敏，再传给 LLM（避免敏感信息泄露给 LLM）
    const content = desensitizeText(rawContent);
    
    // 3. 构建提取请求prompt
    const prompt = EXTRACT_PROMPT.replace("{{session_content}}", content);
    
    // 4. 调用LLM提取信息
    const llmRawResult = yield* llmCall(prompt);
    
    // 5. 校验返回结果格式
    const parseResult = SessionExtractResultSchema.safeParse(llmRawResult);
    if (!parseResult.success) {
      return yield* Effect.fail(new Error("会话信息提取失败，返回格式不符合要求，请重试"));
    }
    
    // 6. 返回结果（已在步骤2脱敏，无需再次脱敏）
    const result: SessionExtractResult = {
      coreConclusions: parseResult.data.coreConclusions,
      decisionsMade: parseResult.data.decisionsMade,
      todoItems: parseResult.data.todoItems,
      projectContext: parseResult.data.projectContext,
      truncatedWarning,
    };
    
    return result;
  });
}