import { z } from 'zod'

export const AgentBrowserValidationResultSchema = z.object({
  command: z.string().min(1).describe('已执行的 agent-browser 环境验证命令'),
  exitCode: z.number().int().describe('命令退出码'),
  outputHash: z.string().min(1).describe('命令输出摘要哈希'),
  executedAt: z.string().min(1).describe('ISO 时间戳'),
})

export const AgentBrowserProofSchema = z.object({
  sessionId: z.string().min(1).describe('写入 agent-browser 环境证明的会话 ID'),
  completedAt: z.string().min(1).describe('ISO 时间戳'),
  schemaVersion: z.literal(1).describe('agent-browser proof schema 版本'),
  worktreeFingerprint: z.string().min(1).describe('工作区路径与 HEAD/状态摘要的审计指纹；调用方提供当前指纹时可用于绑定校验'),
  agentBrowserVersion: z.string().min(1).describe('agent-browser --version 输出'),
  validationResults: z.array(AgentBrowserValidationResultSchema).min(1).describe('实际环境验证命令结果'),
  proofKind: z.literal('agent-browser-environment').describe('证明类型'),
})

export type AgentBrowserValidationResult = z.infer<typeof AgentBrowserValidationResultSchema>
export type AgentBrowserProof = z.infer<typeof AgentBrowserProofSchema>
