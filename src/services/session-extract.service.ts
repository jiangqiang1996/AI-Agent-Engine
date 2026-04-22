import { z } from "zod";

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
