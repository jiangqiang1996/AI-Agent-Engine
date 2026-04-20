import { z } from 'zod'

export const ReviewSeveritySchema = z.enum(['P0', 'P1', 'P2', 'P3']).describe('问题严重程度')
export const ReviewAutofixClassSchema = z
  .enum(['safe_auto', 'gated_auto', 'manual', 'advisory'])
  .describe('修复策略分类')

export const ReviewFindingSchema = z.object({
  reviewer: z.string().min(1).describe('提出问题的审查者'),
  title: z.string().min(1).describe('问题标题'),
  severity: ReviewSeveritySchema.describe('问题严重程度'),
  autofixClass: ReviewAutofixClassSchema.describe('修复策略分类'),
  message: z.string().min(1).describe('问题说明'),
  evidence: z.array(z.string()).default([]).describe('支撑证据'),
  requiresVerification: z.boolean().default(false).describe('是否需要额外验证'),
})

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>
