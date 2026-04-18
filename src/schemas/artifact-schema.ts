import { z } from 'zod'

export const ArtifactTypeSchema = z.enum(['brainstorm', 'plan', 'work', 'review']).describe('产物类型')
export const ArtifactStatusSchema = z
  .enum(['drafted', 'review-passed', 'review-needs-fix', 'blocked', 'aborted', 'completed'])
  .describe('产物状态')

export const ArtifactFrontmatterSchema = z.object({
  type: ArtifactTypeSchema.describe('产物类型'),
  status: ArtifactStatusSchema.describe('产物状态'),
  origin: z.string().optional().describe('上游来源路径'),
  originFingerprint: z.string().optional().describe('上游指纹'),
  supersededBy: z.string().optional().describe('后继产物路径'),
})

export type ArtifactFrontmatter = z.infer<typeof ArtifactFrontmatterSchema>
