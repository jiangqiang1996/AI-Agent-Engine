import { z } from 'zod'

export const ReviewSeveritySchema = z.enum(['P0', 'P1', 'P2', 'P3']).describe('问题严重级别')
export const ReviewAutofixClassSchema = z
  .enum(['safe_auto', 'gated_auto', 'manual', 'advisory'])
  .describe('修复路由分类')

export const ReviewFindingSchema = z.object({
  reviewer: z.string().min(1).describe('提出问题的 reviewer'),
  title: z.string().min(1).describe('问题标题'),
  severity: ReviewSeveritySchema.describe('问题等级'),
  autofixClass: ReviewAutofixClassSchema.describe('自动修复分类'),
  message: z.string().min(1).describe('问题说明'),
  evidence: z.array(z.string()).default([]).describe('支撑证据'),
  requiresVerification: z.boolean().default(false).describe('是否需要额外验证'),
})

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>
