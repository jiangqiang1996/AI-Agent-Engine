import { z } from 'zod'

export const SetupProofSchema = z.object({
  sessionId: z.string().min(1).describe('完成 setup 的会话 ID'),
  completedAt: z.string().min(1).describe('ISO 时间戳'),
  version: z.string().min(1).describe('agent-browser 版本号'),
})

export type SetupProof = z.infer<typeof SetupProofSchema>
