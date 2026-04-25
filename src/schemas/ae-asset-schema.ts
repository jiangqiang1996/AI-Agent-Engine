import { z } from 'zod'

export const SKILL = {
  IDEATE: 'ae:ideate',
  BRAINSTORM: 'ae:brainstorm',
  DOCUMENT_REVIEW: 'ae:document-review',
  PLAN: 'ae:plan',
  WORK: 'ae:work',
  REVIEW: 'ae:review',
  LFG: 'ae:lfg',
  SETUP: 'ae:setup',
  TEST_BROWSER: 'ae:test-browser',
  FRONTEND_DESIGN: 'ae:frontend-design',
  HANDOFF: 'ae:handoff',
  PROMPT_OPTIMIZE: 'ae:prompt-optimize',
  TASK_LOOP: 'ae:task-loop',
  SQL: 'ae:sql',
  SAVE_RULES: 'ae:save-rules',
  HELP: 'ae:help',
  UPDATE: 'ae:update',
} as const

export const PO_SUFFIX = '-po'
export const PA_SUFFIX = '-pa'
export const AUTO_SUFFIX = '-auto'

type SkillToCommand<S extends string> = S extends `ae:${infer R}` ? `ae-${R}` : S

export const COMMAND = Object.fromEntries(
  Object.entries(SKILL).map(([k, v]) => [k, v.replace(/^ae:/, 'ae-')]),
) as { readonly [K in keyof typeof SKILL]: SkillToCommand<(typeof SKILL)[K]> }

export const AGENT = {
  COHERENCE_REVIEWER: 'coherence-reviewer',
  FEASIBILITY_REVIEWER: 'feasibility-reviewer',
  PRODUCT_LENS_REVIEWER: 'product-lens-reviewer',
  SCOPE_GUARDIAN_REVIEWER: 'scope-guardian-reviewer',
  ADVERSARIAL_DOCUMENT_REVIEWER: 'adversarial-document-reviewer',
  DESIGN_LENS_REVIEWER: 'design-lens-reviewer',
  SECURITY_LENS_REVIEWER: 'security-lens-reviewer',
  STEP_GRANULARITY_REVIEWER: 'step-granularity-reviewer',
  BATCH_OPERATION_REVIEWER: 'batch-operation-reviewer',
  REPO_RESEARCH_ANALYST: 'repo-research-analyst',
  LEARNINGS_RESEARCHER: 'learnings-researcher',
  BEST_PRACTICES_RESEARCHER: 'best-practices-researcher',
  WEB_RESEARCHER: 'web-researcher',
  FRAMEWORK_DOCS_RESEARCHER: 'framework-docs-researcher',
  SPEC_FLOW_ANALYZER: 'spec-flow-analyzer',
  DESIGN_ITERATOR: 'design-iterator',
  FIGMA_DESIGN_SYNC: 'figma-design-sync',
  CORRECTNESS_REVIEWER: 'correctness-reviewer',
  TESTING_REVIEWER: 'testing-reviewer',
  PROJECT_STANDARDS_REVIEWER: 'project-standards-reviewer',
  AGENT_NATIVE_REVIEWER: 'agent-native-reviewer',
  API_CONTRACT_REVIEWER: 'api-contract-reviewer',
  RELIABILITY_REVIEWER: 'reliability-reviewer',
  ADVERSARIAL_REVIEWER: 'adversarial-reviewer',
  MAINTAINABILITY_REVIEWER: 'maintainability-reviewer',
  SECURITY_REVIEWER: 'security-reviewer',
  PERFORMANCE_REVIEWER: 'performance-reviewer',
  ARCHITECTURE_STRATEGIST: 'architecture-strategist',
  PATTERN_RECOGNITION_SPECIALIST: 'pattern-recognition-specialist',
  DATA_MIGRATIONS_REVIEWER: 'data-migrations-reviewer',
  KIERAN_TYPESCRIPT_REVIEWER: 'kieran-typescript-reviewer',
  PREVIOUS_COMMENTS_REVIEWER: 'previous-comments-reviewer',
  CLI_AGENT_READINESS_REVIEWER: 'cli-agent-readiness-reviewer',
  CONFIG_REVIEWER: 'config-reviewer',
  INFRA_REVIEWER: 'infra-reviewer',
  DATABASE_REVIEWER: 'database-reviewer',
  SCRIPT_REVIEWER: 'script-reviewer',
} as const

export function skillDir(skillName: string): string {
  return skillName.replace(/^ae:/, 'ae-')
}

export const TOOL = {
  AE_RECOVERY: 'ae-recovery',
  AE_REVIEW_CONTRACT: 'ae-review-contract',
  AE_HANDOFF: 'ae-handoff',
  AE_PROMPT_OPTIMIZE: 'ae-prompt-optimize',
  AE_HELP: 'ae-help',
} as const

export const AeModeSchema = z
  .enum(['interactive', 'headless', 'report-only', 'autofix'])
  .describe('AE 审查模式')

export const AeSkillNameSchema = z
  .enum([
    SKILL.IDEATE,
    SKILL.BRAINSTORM,
    SKILL.DOCUMENT_REVIEW,
    SKILL.PLAN,
    SKILL.WORK,
    SKILL.REVIEW,
    SKILL.LFG,
    SKILL.SETUP,
    SKILL.TEST_BROWSER,
    SKILL.FRONTEND_DESIGN,
    SKILL.HANDOFF,
    SKILL.PROMPT_OPTIMIZE,
    SKILL.TASK_LOOP,
    SKILL.SQL,
    SKILL.SAVE_RULES,
    SKILL.HELP,
    SKILL.UPDATE,
  ])
  .describe('AE 技能名')

const PO_COMMAND_NAMES = Object.values(COMMAND)
  .filter((v) => v !== COMMAND.PROMPT_OPTIMIZE)
  .map((v) => `${v}${PO_SUFFIX}`)

const PA_COMMAND_NAMES = Object.values(COMMAND)
  .filter((v) => v !== COMMAND.PROMPT_OPTIMIZE)
  .map((v) => `${v}${PA_SUFFIX}`)

const ALL_COMMAND_NAMES = [
  ...Object.values(COMMAND),
  `${COMMAND.PROMPT_OPTIMIZE}${AUTO_SUFFIX}`,
  ...PO_COMMAND_NAMES,
  ...PA_COMMAND_NAMES,
] as [string, ...string[]]

export const AeCommandNameSchema = z
  .enum(ALL_COMMAND_NAMES)
  .describe('AE 命令名')

export const AeAssetEntrySchema = z.object({
  skillName: AeSkillNameSchema.describe('技能名'),
  skillSlug: z.string().min(1).describe('技能目录名'),
  commandName: AeCommandNameSchema.describe('命令名'),
  description: z.string().min(1).describe('功能描述'),
  argumentHint: z.string().optional().describe('参数提示'),
  defaultEntry: z.boolean().default(false).describe('是否默认入口'),
  skillFile: z.string().describe('技能文件路径，无关联技能时为空字符串'),
})

export const AgentStageSchema = z
  .enum(['document-review', 'review', 'research', 'workflow'])
  .describe('Agent 所属目录')

export const AgentTierSchema = z
  .enum(['required', 'gilded'])
  .describe('Agent 层级')

export const AgentDefinitionSchema = z.object({
  name: z.string().min(1).describe('Agent 名称'),
  stage: AgentStageSchema.describe('Agent 所属目录'),
  tier: AgentTierSchema.describe('Agent 层级'),
  description: z.string().min(1).describe('Agent 中文描述'),
  path: z.string().min(1).describe('Agent 文件路径'),
})

export type AeAssetEntry = z.infer<typeof AeAssetEntrySchema>
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>
