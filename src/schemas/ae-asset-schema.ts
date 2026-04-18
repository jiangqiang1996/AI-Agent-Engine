import { z } from 'zod'

export const AeModeSchema = z.enum(['interactive', 'headless', 'report-only', 'autofix']).describe('AE 审查模式')

export const AeSkillNameSchema = z
  .enum([
    'ae:brainstorm',
    'ae:document-review',
    'ae:plan',
    'ae:plan-review',
    'ae:work',
    'ae:review',
    'ae:lfg',
    'ae:save-rules',
    'ae:frontend-design',
    'ae:setup',
    'ae:test-browser',
  ])
  .describe('AE 技能名')

export const AeCommandNameSchema = z
  .enum([
    'ae-brainstorm',
    'ae-review-doc',
    'ae-plan',
    'ae-review-plan',
    'ae-work',
    'ae-review-code',
    'ae-lfg',
    'ae-rules',
    'ae-frontend-design',
    'ae-setup',
    'ae-test-browser',
  ])
  .describe('AE 命令名')

export const AeAssetEntrySchema = z.object({
  skillName: AeSkillNameSchema.describe('技能名'),
  skillSlug: z.string().min(1).describe('技能目录名'),
  commandName: AeCommandNameSchema.describe('命令名'),
  description: z.string().min(1).describe('功能描述'),
  argumentHint: z.string().optional().describe('参数提示'),
  defaultEntry: z.boolean().default(false).describe('是否默认入口'),
  commandFile: z.string().min(1).describe('命令文件路径'),
  skillFile: z.string().describe('技能文件路径，无关联技能时为空字符串'),
})

export const AgentStageSchema = z
  .enum(['document-review', 'review', 'research', 'workflow'])
  .describe('Agent 所属目录')

export const AgentTierSchema = z.enum(['required', 'gilded', 'deferred']).describe('Agent 迁移优先级')

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1).describe('Agent 名称'),
  stage: AgentStageSchema.describe('Agent 所属目录'),
  tier: AgentTierSchema.describe('Agent 所属迁移层级'),
  description: z.string().min(1).describe('Agent 中文描述'),
  path: z.string().min(1).describe('Agent 文件路径'),
})

export type AeAssetEntry = z.infer<typeof AeAssetEntrySchema>
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>
