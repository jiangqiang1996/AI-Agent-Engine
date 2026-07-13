import { z } from 'zod'

export const RecoveryPhaseSchema = z
  .enum(['prd', 'design', 'work', 'review'])
  .describe('恢复阶段')

export const RecoveryResolutionSchema = z
  .enum(['resolved', 'needs-selection', 'needs-upstream', 'invalid-artifact'])
  .describe('恢复结果')

export const RecoveryResultSchema = z.object({
  resolution: RecoveryResolutionSchema.describe('恢复结果'),
  phase: RecoveryPhaseSchema.describe('恢复阶段'),
  resumePhase: RecoveryPhaseSchema.optional().describe('实际恢复到的阶段'),
  nextSkill: z.string().optional().describe('建议继续使用的技能'),
  nextArguments: z.string().optional().describe('建议传递给下一技能的结构化参数'),
  nextCommand: z.string().optional().describe('建议执行的完整技能调用'),
  artifactType: z.enum(['prd', 'design', 'work', 'review']).optional().describe('命中的产物类型'),
  path: z.string().optional().describe('命中的产物路径'),
  fallbackSkill: z.string().optional().describe('建议回退技能'),
  reason: z.string().describe('恢复说明'),
  candidates: z.array(z.string()).default([]).describe('候选产物列表'),
  warnings: z.array(z.string()).optional().describe('恢复警告（不阻断）'),
})

export type RecoveryResult = z.infer<typeof RecoveryResultSchema>
