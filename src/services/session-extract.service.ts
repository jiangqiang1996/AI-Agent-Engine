import { z } from 'zod'

export const SessionExtractResultSchema = z.object({
  userRequests: z.string().default('None').describe('用户原始请求，完整保留原文'),
  goal: z.string().default('None').describe('最终目标和下一步方向'),
  workCompleted: z.string().default('None').describe('已完成的任务列表'),
  currentState: z.string().default('None').describe('代码库当前状态'),
  pendingTasks: z.string().default('None').describe('未完成的任务清单'),
  keyFiles: z.string().default('None').describe('关键文件路径'),
  importantDecisions: z.string().default('None').describe('已确定的技术选型和决策'),
  explicitConstraints: z.string().default('None').describe('用户明确要求的限制'),
  contextForContinuation: z.string().default('None').describe('需要留意的坑点和警告'),
  truncatedWarning: z.string().optional().describe('超长会话裁剪提示'),
  compressionLevel: z.number().min(1).max(5).optional().describe('交接压缩等级'),
})

export type SessionExtractResult = z.infer<typeof SessionExtractResultSchema>
