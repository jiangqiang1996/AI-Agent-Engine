import { z } from 'zod'

/**
 * AE 持久产物类型常量。
 * 供 recovery-service、artifact-store 等模块引用，避免硬编码字符串。
 */
export const ARTIFACT_KIND = {
  PRD: 'prd',
  PRD_SHARD: 'prd-shard',
  DESIGN: 'design',
  DESIGN_SHARD: 'design-shard',
  WORK: 'work',
  REVIEW: 'review',
} as const

/** AE 产物类型的联合类型，值来自 `ARTIFACT_KIND` 常量。 */
export type ArtifactKind = typeof ARTIFACT_KIND[keyof typeof ARTIFACT_KIND]

export const ArtifactTypeSchema = z
  .enum([
    ARTIFACT_KIND.PRD,
    ARTIFACT_KIND.PRD_SHARD,
    ARTIFACT_KIND.DESIGN,
    ARTIFACT_KIND.DESIGN_SHARD,
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

export function isShardArtifactKind(value: string): boolean {
  return [
    ARTIFACT_KIND.PRD_SHARD,
    ARTIFACT_KIND.DESIGN_SHARD,
  ].includes(
    value as typeof ARTIFACT_KIND.PRD_SHARD,
  )
}

/**
 * AE 产物生命周期状态。
 */
export const ArtifactStatusSchema = z
  .enum(['drafted', 'review-passed', 'review-needs-fix', 'blocked', 'aborted', 'active', 'completed'])
  .describe('产物状态')

const REQUIREMENTS_ALLOWED_STATUSES = ['drafted', 'review-passed', 'completed'] as const

function isRepositoryRelativePath(value: string): boolean {
  return !(/^[a-zA-Z]:[\\/]|^\\\\|^\//.test(value) || value.split(/[\\/]+/).includes('..'))
}

/**
 * AE 产物 frontmatter 统一校验。
 * 通用字段由所有产物共享，type 特有字段通过 superRefine 约束。
 */
export const ArtifactFrontmatterSchema = z.object({
  type: ArtifactTypeSchema.describe('产物类型'),
  status: ArtifactStatusSchema.describe('产物状态'),
  origin: z.string().optional().describe('上游来源路径'),
  originFingerprint: z.string().optional().describe('上游指纹'),
  supersededBy: z.string().optional().describe('后继产物路径'),
  date: z.string().optional().describe('ISO 日期'),
  topic: z.string().optional().describe('主题'),
  title: z.string().optional().describe('标题'),
  depth: z.enum(['standard', 'deep']).optional().describe('设计深度'),
  format: z.string().optional().describe('文档格式'),
  version: z.string().optional().describe('文档格式版本'),
  sharded: z.boolean().optional().describe('是否为分片主文件'),
  shards: z.array(z.unknown()).optional().describe('分片索引'),
  parent: z.string().optional().describe('分片父文档路径'),
  module: z.string().optional().describe('分片所属模块'),
}).superRefine((data, ctx) => {
  const hasOrigin = Boolean(data.origin)
  const hasOriginFingerprint = Boolean(data.originFingerprint)
  if (hasOrigin !== hasOriginFingerprint) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'origin 与 originFingerprint 必须同时填写或同时省略',
      path: hasOrigin ? ['originFingerprint'] : ['origin'],
    })
  }
  if (data.origin && !isRepositoryRelativePath(data.origin)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'origin 必须使用仓库相对路径',
      path: ['origin'],
    })
  }
  if (data.supersededBy && !isRepositoryRelativePath(data.supersededBy)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'supersededBy 必须使用仓库相对路径',
      path: ['supersededBy'],
    })
  }
  if (data.type !== 'design' && data.depth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'depth 仅允许用于 design 类型',
      path: ['depth'],
    })
  }

  if (isShardArtifactKind(data.type)) {
    if (!data.parent) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '分片类型必须有 parent 字段', path: ['parent'] })
    } else if (!isRepositoryRelativePath(data.parent)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parent 必须使用仓库相对路径', path: ['parent'] })
    }
    if (!data.module) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '分片类型必须有 module 字段', path: ['module'] })
    }
  }

  if (data.type === 'prd') {
    if (!data.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'prd 类型必须有 date 字段',
        path: ['date'],
      })
    }
    if (!data.topic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'prd 类型必须有 topic 字段',
        path: ['topic'],
      })
    }
    if (!REQUIREMENTS_ALLOWED_STATUSES.includes(data.status as typeof REQUIREMENTS_ALLOWED_STATUSES[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `prd 的 status 必须为 ${REQUIREMENTS_ALLOWED_STATUSES.join(' | ')}`,
        path: ['status'],
      })
    }
  }
  if (data.type === 'design') {
    if (!data.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'design 类型必须有 date 字段', path: ['date'] })
    }
    if (!data.title) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'design 类型必须有 title 字段', path: ['title'] })
    }
  }
})

/**
 * AE 产物 frontmatter 类型。
 */
export type ArtifactFrontmatter = z.infer<typeof ArtifactFrontmatterSchema>
