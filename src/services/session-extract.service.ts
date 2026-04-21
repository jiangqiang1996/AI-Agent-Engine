import { z } from "zod";
import { Effect } from "effect";

/**
 * 会话提取结果Schema（完全对齐oh-my-openagent handoff结构）
 */
export const SessionExtractResultSchema = z.object({
  userRequests: z.string().default('None').describe('用户原始请求，完整保留原文，不做任何改写'),
  goal: z.string().default('None').describe('一句话描述当前任务的最终目标和下一步方向'),
  workCompleted: z.string().default('None').describe('已完成的任务列表，包含相关文件路径和关键实现决策，每条用换行分隔'),
  currentState: z.string().default('None').describe('代码库当前状态、构建/测试状态、环境配置状态，每条用换行分隔'),
  pendingTasks: z.string().default('None').describe('未完成的任务清单、下一步计划、阻塞问题（合并todoread的结果），每条用换行分隔'),
  keyFiles: z.string().default('None').describe('最多10个关键文件路径及简要说明，优先包含Git变更和会话中提到的文件，每条用换行分隔'),
  importantDecisions: z.string().default('None').describe('已确定的技术选型、方案选择、优先级决策、权衡考量，每条用换行分隔'),
  explicitConstraints: z.string().default('None').describe('用户明确要求的限制、项目规范约定，完整保留原文，无则返回None'),
  contextForContinuation: z.string().default('None').describe('需要留意的坑点、警告、相关文档引用，每条用换行分隔'),
  truncatedWarning: z.string().optional().describe('超长会话裁剪提示，如存在则返回'),
});

export type SessionExtractResult = z.infer<typeof SessionExtractResultSchema>;

/**
 * 敏感信息匹配规则
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // AWS 密钥
  /AKIA[0-9A-Z]{16}/gi,
  // 通用密钥/令牌
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
 * 文本脱敏函数：将所有敏感信息替换为***
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
 * 超长会话裁剪函数：优先保留最新消息，避免超过大模型上下文限制
 * 压缩等级对应maxTokens：1=32000, 2=16000, 3=8000, 4=4000, 5=2000
 */
function truncateSessionContent(
  messages: Array<{ content: string }>,
  compressionLevel: number = 1
): { content: string; truncatedWarning?: string } {
  // 根据压缩等级设置maxTokens
  const maxTokensMap = {
    1: 32000,
    2: 16000,
    3: 8000,
    4: 4000,
    5: 2000,
  }
  const maxTokens = maxTokensMap[compressionLevel as keyof typeof maxTokensMap] || 16000
  // 简单估算：1 token ≈ 4 个字符，预留20%空间给系统提示词
  const maxLength = Math.floor(maxTokens * 4 * 0.8);
  // 复制数组再反转，避免污染原数组
  const reversed = [...messages].reverse();
  const fullContent = reversed.map(m => m.content).join("\n\n");
  
  if (fullContent.length <= maxLength) {
    return { content: fullContent };
  }
  
  // 裁剪超长内容
  const truncatedContent = fullContent.slice(0, maxLength);
  return {
    content: truncatedContent,
    truncatedWarning: "⚠️ 会话内容过长，已优先保留最近的核心信息，裁剪了部分历史聊天内容。若需要完整上下文，建议手动复制原会话内容。",
  };
}

/**
 * 信息提取系统提示词（完全对齐oh-my-openagent handoff结构）
 */
const EXTRACT_PROMPT = `
你是专业的会话上下文提取助手，请从以下会话内容、Git变更记录、待办任务列表中按要求提取核心信息：
1. USER REQUESTS (AS-IS)：用户的原始需求，完整保留原文，不做任何改写，无则返回"None"
2. GOAL：一句话描述当前任务的最终目标和下一步方向，无则返回"None"
3. WORK COMPLETED：已经完成的任务列表，包含相关文件路径和关键实现决策，每条用换行分隔，无则返回"None"
4. CURRENT STATE：代码库当前状态、构建/测试状态、环境配置状态，每条用换行分隔，无则返回"None"
5. PENDING TASKS：未完成的任务清单、下一步计划、阻塞问题（合并todoread的结果），每条用换行分隔，无则返回"None"
6. KEY FILES：最多10个关键文件路径及简要说明，优先包含Git变更和会话中提到的文件，每条用换行分隔，无则返回"None"
7. IMPORTANT DECISIONS：已确定的技术选型、方案选择、优先级决策、权衡考量，每条用换行分隔，无则返回"None"
8. EXPLICIT CONSTRAINTS：用户明确要求的限制、项目规范约定，完整保留原文，无则返回"None"
9. CONTEXT FOR CONTINUATION：需要留意的坑点、警告、相关文档引用，每条用换行分隔，无则返回"None"

要求：
- 准确提取所有关键信息，不得遗漏
- 每类信息的每条内容单独占一行，简洁清晰，删除冗余的聊天过程
- 敏感信息已自动完成脱敏，无需额外处理
- 若该类无对应信息，返回"None"即可
- 无需返回任何解释性内容，仅返回符合要求的JSON格式结果

待处理内容：
{{session_content}}

返回的JSON必须严格遵循以下结构：
{
  "userRequests": "字符串，用户原始请求，原样保留，无则返回\"None\"",
  "goal": "字符串，一句话描述任务目标，无则返回\"None\"",
  "workCompleted": "字符串，已完成的工作，每条用换行分隔，无则返回\"None\"",
  "currentState": "字符串，当前状态信息，每条用换行分隔，无则返回\"None\"",
  "pendingTasks": "字符串，待完成的任务，每条用换行分隔，无则返回\"None\"",
  "keyFiles": "字符串，关键文件路径和说明，每条用换行分隔，最多10个，无则返回\"None\"",
  "importantDecisions": "字符串，重要决策，每条用换行分隔，无则返回\"None\"",
  "explicitConstraints": "字符串，明确约束，原样保留，无则返回\"None\"",
  "contextForContinuation": "字符串，续会注意事项，每条用换行分隔，无则返回\"None\""
}
`;

/**
 * 会话内容提取主函数
 * @param messages 会话消息列表
 * @param llmCall 大模型调用函数，接收提示词返回JSON结果
 * @returns 结构化提取结果，已完成脱敏
 */
export function extractSessionContent(
  messages: Array<{ content: string }>,
  llmCall: (prompt: string) => Effect.Effect<unknown, Error>,
  compressionLevel: number = 1
): Effect.Effect<SessionExtractResult, Error> {
  return Effect.gen(function* () {
    // 1. 处理超长会话裁剪
    const { content: rawContent, truncatedWarning } = truncateSessionContent(messages, compressionLevel);
    
    // 2. 先脱敏，再传给大模型（避免敏感信息泄露）
    const content = desensitizeText(rawContent);
    
    // 3. 构建提取请求提示词
    const prompt = EXTRACT_PROMPT.replace("{{session_content}}", content);
    
    // 4. 调用大模型提取信息
    const llmRawResult = yield* llmCall(prompt);
    
    // 5. 校验返回结果格式
    const parseResult = SessionExtractResultSchema.safeParse(llmRawResult);
    if (!parseResult.success) {
      return yield* Effect.fail(new Error("会话信息提取失败，返回格式不符合要求，请重试"));
    }
    
    // 6. 返回结果（已在步骤2脱敏，无需再次处理）
    const result: SessionExtractResult = {
      userRequests: parseResult.data.userRequests,
      goal: parseResult.data.goal,
      workCompleted: parseResult.data.workCompleted,
      currentState: parseResult.data.currentState,
      pendingTasks: parseResult.data.pendingTasks,
      keyFiles: parseResult.data.keyFiles,
      importantDecisions: parseResult.data.importantDecisions,
      explicitConstraints: parseResult.data.explicitConstraints,
      contextForContinuation: parseResult.data.contextForContinuation,
      truncatedWarning,
    };
    
    return result;
  });
}