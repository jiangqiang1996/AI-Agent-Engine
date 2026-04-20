import { z } from 'zod'

import { AeModeSchema } from './ae-asset-schema.js'
import { ReviewFindingSchema } from './review-finding-schema.js'

export const ReviewKindSchema = z.enum(['document', 'plan', 'code']).describe('审查类型')

export const ReviewContractSchema = z.object({
  kind: ReviewKindSchema.describe('审查类型'),
  mode: AeModeSchema.describe('审查模式'),
  reviewers: z.array(z.string()).min(1).describe('审查角色列表'),
  findings: z.array(ReviewFindingSchema).default([]).describe('审查发现'),
})

export type ReviewContract = z.infer<typeof ReviewContractSchema>
