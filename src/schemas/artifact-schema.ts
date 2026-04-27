import { z } from 'zod'

/**
 * AE 持久产物类型。
 */
export const ArtifactTypeSchema = z
  .enum(['brainstorm', 'plan', 'work', 'review'])
  .describe('产物类型')

/**
 * AE 产物生命周期状态。
 */
export const ArtifactStatusSchema = z
  .enum(['drafted', 'review-passed', 'review-needs-fix', 'blocked', 'aborted', 'active', 'completed'])
  .describe('产物状态')

const BRAINSTORM_ALLOWED_STATUSES = ['drafted', 'review-passed', 'completed'] as const
const PLAN_ALLOWED_STATUSES = ['drafted', 'active', 'completed'] as const

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
  depth: z.enum(['standard', 'deep']).optional().describe('计划深度'),
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
  if (data.type !== 'plan' && data.depth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'depth 仅允许用于 plan 类型',
      path: ['depth'],
    })
  }

  if (data.type === 'brainstorm') {
    if (!data.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'brainstorm 类型必须有 date 字段',
        path: ['date'],
      })
    }
    if (!data.topic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'brainstorm 类型必须有 topic 字段',
        path: ['topic'],
      })
    }
    if (!BRAINSTORM_ALLOWED_STATUSES.includes(data.status as typeof BRAINSTORM_ALLOWED_STATUSES[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `brainstorm 的 status 必须为 ${BRAINSTORM_ALLOWED_STATUSES.join(' | ')}`,
        path: ['status'],
      })
    }
  }
  if (data.type === 'plan') {
    if (!data.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'plan 类型必须有 date 字段',
        path: ['date'],
      })
    }
    if (!data.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'plan 类型必须有 title 字段',
        path: ['title'],
      })
    }
    if (!PLAN_ALLOWED_STATUSES.includes(data.status as typeof PLAN_ALLOWED_STATUSES[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `plan 的 status 必须为 ${PLAN_ALLOWED_STATUSES.join(' | ')}`,
        path: ['status'],
      })
    }
  }
})

/**
 * AE 产物 frontmatter 类型。
 */
export type ArtifactFrontmatter = z.infer<typeof ArtifactFrontmatterSchema>
