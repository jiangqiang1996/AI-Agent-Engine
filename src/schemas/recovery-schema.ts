import { z } from 'zod'

export const RecoveryPhaseSchema = z
  .enum(['brainstorm', 'document-review', 'plan', 'plan-review', 'work', 'review', 'lfg'])
  .describe('恢复阶段')

export const RecoveryResolutionSchema = z
  .enum(['resolved', 'needs-selection', 'needs-upstream', 'invalid-artifact'])
  .describe('恢复结果')

export const RecoveryResultSchema = z.object({
  resolution: RecoveryResolutionSchema.describe('恢复结果'),
  phase: RecoveryPhaseSchema.describe('恢复阶段'),
  resumePhase: RecoveryPhaseSchema.optional().describe('实际恢复到的阶段'),
  nextSkill: z.string().optional().describe('建议继续使用的技能'),
  artifactType: z.enum(['brainstorm', 'plan', 'work', 'review']).optional().describe('命中的产物类型'),
  path: z.string().optional().describe('命中的产物路径'),
  fallbackSkill: z.string().optional().describe('建议回退技能'),
  reason: z.string().describe('恢复说明'),
  candidates: z.array(z.string()).default([]).describe('候选产物列表'),
})

export type RecoveryResult = z.infer<typeof RecoveryResultSchema>
