import { z } from 'zod'

/**
 * AE 持久产物类型常量。
 * 供 artifact-store 等模块引用，避免硬编码字符串。
 */
export const ARTIFACT_KIND = {
  PRD: 'prd',
  DESIGN: 'design',
  WORK: 'work',
  REVIEW: 'review',
} as const

/** AE 产物类型的联合类型，值来自 `ARTIFACT_KIND` 常量。 */
export type ArtifactKind = typeof ARTIFACT_KIND[keyof typeof ARTIFACT_KIND]

export const ArtifactTypeSchema = z
  .enum([
    ARTIFACT_KIND.PRD,
    ARTIFACT_KIND.DESIGN,
    ARTIFACT_KIND.WORK,
    ARTIFACT_KIND.REVIEW,
  ])
  .describe('产物类型')

export const TOP_LEVEL_ARTIFACT_KINDS = [
  ARTIFACT_KIND.PRD,
  ARTIFACT_KIND.DESIGN,
  ARTIFACT_KIND.WORK,
  ARTIFACT_KIND.REVIEW,
] as const

/**
 * AE 产物 frontmatter 统一校验。
 * 重构后 frontmatter 极简化：仅保留 type（必填）、ids/dependsOn/involvesUI（按文件类型可选）。
 */
export const ArtifactFrontmatterSchema = z.object({
  type: ArtifactTypeSchema.describe('产物类型'),
  ids: z.array(z.string()).optional().describe('稳定 ID 列表，跨文件引用和追溯依赖'),
  dependsOn: z.array(z.string()).optional().describe('模块依赖关系（仅 requirements.md）'),
  involvesUI: z.boolean().optional().describe('是否涉及 UI（仅 requirements.md）'),
})

/**
 * AE 产物 frontmatter 类型。
 */
export type ArtifactFrontmatter = z.infer<typeof ArtifactFrontmatterSchema>
