import { z } from 'zod'

export const SKILL = {
  IDEATE: 'ae:ideate',
  BRAINSTORM: 'ae:brainstorm',
  PRD: 'ae:prd',
  DOCUMENT_REVIEW: 'ae:document-review',
  PLAN: 'ae:plan',
  REFACTOR: 'ae:refactor',
  AGENT_CREATOR: 'ae:agent-creator',
  WORK: 'ae:work',
  WORK_REPORT: 'ae:work-report',
  MY_CODE_CHANGES: 'ae:my-code-changes',
  MERGE_BRANCH: 'ae:merge-branch',
  REVIEW: 'ae:review',
  LFG: 'ae:lfg',
  CHROME_DEVTOOLS: 'ae:chrome-devtools',
  WEB_FORGE: 'ae:web-forge',
  HANDOFF: 'ae:handoff',
  PROMPT_OPTIMIZE: 'ae:prompt-optimize',
  TASK_LOOP: 'ae:task-loop',
  SQL: 'ae:sql',
  SWAGGER_PARSER: 'ae:swagger-parser',
  API_TESTER: 'ae:api-tester',
  HTML_BUNDLE: 'ae:html-bundle',
  MARKITDOWN: 'ae:markitdown',
  GRAPH_BUILD: 'ae:graph-build',
  GRAPH_QUERY: 'ae:graph-query',
  SAVE_EXPERIENCE: 'ae:save-experience',
  SKILL_FROM_SESSION: 'ae:skill-from-session',
  SKILL_CREATOR: 'ae:skill-creator',
  COURSE_AUTO_PLAYER: 'ae:course-auto-player',
  STATIC_SERVER: 'ae:static-server',
  HELP: 'ae:help',
  UPDATE: 'ae:update',
} as const

export const PO_SUFFIX = '-po'
export const PA_SUFFIX = '-pa'
export const AUTO_SUFFIX = '-auto'

export const PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS = [
  SKILL.DOCUMENT_REVIEW,
  SKILL.AGENT_CREATOR,
  SKILL.WORK_REPORT,
  SKILL.MY_CODE_CHANGES,
  SKILL.MERGE_BRANCH,
  SKILL.REVIEW,
  SKILL.CHROME_DEVTOOLS,
  SKILL.WEB_FORGE,
  SKILL.HANDOFF,
  SKILL.PROMPT_OPTIMIZE,
  SKILL.SQL,
  SKILL.SWAGGER_PARSER,
  SKILL.API_TESTER,
  SKILL.HTML_BUNDLE,
  SKILL.MARKITDOWN,
  SKILL.GRAPH_BUILD,
  SKILL.GRAPH_QUERY,
  SKILL.SAVE_EXPERIENCE,
  SKILL.SKILL_FROM_SESSION,
  SKILL.SKILL_CREATOR,
  SKILL.STATIC_SERVER,
  SKILL.COURSE_AUTO_PLAYER,
  SKILL.HELP,
  SKILL.UPDATE,
] as const

export function hasPromptOptimizeVariant(skillName: string): boolean {
  return !PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS.some((excludedSkill) => excludedSkill === skillName)
}

type SkillToCommand<S extends string> = S extends `ae:${infer R}` ? `ae-${R}` : S

const SKILL_COMMANDS = Object.fromEntries(
  Object.entries(SKILL).map(([k, v]) => [k, v.replace(/^ae:/, 'ae-')]),
) as { readonly [K in keyof typeof SKILL]: SkillToCommand<(typeof SKILL)[K]> }

export const COMMAND = {
  ...SKILL_COMMANDS,
} as const

export const AGENT = {
  CORRECTNESS_REVIEWER: 'correctness-reviewer',
  TESTING_REVIEWER: 'testing-reviewer',
  MAINTAINABILITY_REVIEWER: 'maintainability-reviewer',
  STANDARDS_REVIEWER: 'standards-reviewer',
  AGENT_NATIVE_REVIEWER: 'agent-native-reviewer',
  RESEARCH_REVIEWER: 'research-reviewer',
  COHERENCE_REVIEWER: 'coherence-reviewer',
  FEASIBILITY_REVIEWER: 'feasibility-reviewer',
  SECURITY_REVIEWER: 'security-reviewer',
  ADVERSARIAL_REVIEWER: 'adversarial-reviewer',
  PERFORMANCE_REVIEWER: 'performance-reviewer',
  API_CONTRACT_REVIEWER: 'api-contract-reviewer',
  RELIABILITY_REVIEWER: 'reliability-reviewer',
  DATA_MIGRATIONS_REVIEWER: 'data-migrations-reviewer',
  PREVIOUS_COMMENTS_REVIEWER: 'previous-comments-reviewer',
  PRODUCT_LENS_REVIEWER: 'product-lens-reviewer',
  STEP_GRANULARITY_REVIEWER: 'step-granularity-reviewer',
  DESIGN_LENS_REVIEWER: 'design-lens-reviewer',
  TEST_CASE_REVIEWER: 'test-case-reviewer',
  REQUIREMENTS_REVIEWER: 'requirements-reviewer',
  PROTOTYPE_REVIEWER: 'prototype-reviewer',
  TRACEABILITY_REVIEWER: 'traceability-reviewer',
  EVIDENCE_REVIEWER: 'evidence-reviewer',
  GOAL_ALIGNMENT_REVIEWER: 'goal-alignment-reviewer',
  ARCHITECTURE_STRATEGIST: 'architecture-strategist',
  REPO_RESEARCH_ANALYST: 'repo-research-analyst',
  WEB_RESEARCHER: 'web-researcher',
  SPEC_FLOW_ANALYZER: 'spec-flow-analyzer',
  UI_ARCHITECT: 'ui-architect',
  UI_MATCHER: 'ui-matcher',
  LOGIC_WEAVER: 'logic-weaver',
  BROWSER_INSPECTOR: 'browser-inspector',
  REVIEW_DOMAIN: 'review-domain',
  DEVELOPMENT_DOMAIN: 'development-domain',
  FRONTEND_DEV: 'frontend-dev',
  BACKEND_DEV: 'backend-dev',
  DEBUG_FIX: 'debug-fix',
  REFACTOR_DEV: 'refactor-dev',
} as const

export function skillDir(skillName: string): string {
  return skillName.replace(/^ae:/, 'ae-')
}

export const TOOL = {
  AE_RECOVERY: 'ae-recovery',
  AE_REVIEW_CONTRACT: 'ae-review-contract',
  AE_HANDOFF: 'ae-handoff',
  AE_WORKTREE_HANDOFF: 'ae-worktree-handoff',
  AE_CREATE_SESSION: 'ae-create-session',
  AE_PROMPT_OPTIMIZE: 'ae-prompt-optimize',
  AE_HELP: 'ae-help',
  AE_REVIEW_PROOF: 'ae-review-proof',
  AE_SWAGGER_PARSER: 'ae-swagger-parser',
  AE_HTML_BUNDLE: 'ae-html-bundle',
  AE_MARKITDOWN: 'ae-markitdown',
  AE_GRAPH_BUILD: 'ae-graph-build',
  AE_GRAPH_QUERY: 'ae-graph-query',
  AE_TASK_ANALYZER: 'ae-task-analyzer',
  AE_DOC_EXTRACT: 'ae-doc-extract',
  AE_DOMAIN_CATALOG: 'ae-domain-catalog',
  AE_CHROME_DEVTOOLS_MCP: 'ae-chrome-devtools-mcp',
  AE_TIMER: 'ae-timer',
  AE_DOMAIN_DISPATCH_PREPARE: 'ae-domain-dispatch-prepare',
  AE_DOMAIN_DISPATCH_AGGREGATE: 'ae-domain-dispatch-aggregate',
  AE_BACKGROUND_EXEC: 'ae-background-exec',
} as const

export const AeModeSchema = z
  .enum(['interactive', 'headless', 'report-only', 'autofix'])
  .describe('AE 审查模式')

export const AeSkillNameSchema = z
  .enum([
    SKILL.IDEATE,
    SKILL.BRAINSTORM,
    SKILL.PRD,
    SKILL.DOCUMENT_REVIEW,
    SKILL.PLAN,
    SKILL.REFACTOR,
    SKILL.AGENT_CREATOR,
    SKILL.WORK,
    SKILL.WORK_REPORT,
    SKILL.MY_CODE_CHANGES,
    SKILL.MERGE_BRANCH,
    SKILL.REVIEW,
    SKILL.LFG,
    SKILL.CHROME_DEVTOOLS,
    SKILL.WEB_FORGE,
    SKILL.HANDOFF,
    SKILL.PROMPT_OPTIMIZE,
    SKILL.TASK_LOOP,
    SKILL.SQL,
    SKILL.SWAGGER_PARSER,
    SKILL.API_TESTER,
    SKILL.HTML_BUNDLE,
    SKILL.MARKITDOWN,
    SKILL.GRAPH_BUILD,
    SKILL.GRAPH_QUERY,
    SKILL.SAVE_EXPERIENCE,
    SKILL.SKILL_FROM_SESSION,
    SKILL.SKILL_CREATOR,
    SKILL.STATIC_SERVER,
    SKILL.COURSE_AUTO_PLAYER,
    SKILL.HELP,
    SKILL.UPDATE,
  ])
  .describe('AE 技能名')

const PO_COMMAND_NAMES = Object.values(SKILL_COMMANDS)
  .filter((v) => hasPromptOptimizeVariant(v.replace(/^ae-/, 'ae:')))
  .map((v) => `${v}${PO_SUFFIX}`)

const PA_COMMAND_NAMES = Object.values(SKILL_COMMANDS)
  .filter((v) => hasPromptOptimizeVariant(v.replace(/^ae-/, 'ae:')))
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
  commandName: AeCommandNameSchema.describe('命令名'),
  description: z.string().min(1).describe('功能描述'),
  argumentHint: z.string().optional().describe('参数提示'),
  skillFile: z.string().describe('技能文件路径，无关联技能时为空字符串'),
  customTemplate: z.string().optional().describe('自定义命令模板，command-registration.ts 优先于默认模板使用'),
  allowPromptOptimizeVariant: z.boolean().optional().describe('是否生成 -po/-pa 命令变体'),
})

export const AgentStageSchema = z
  .enum(['review', 'research', 'workflow', 'domain'])
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

export const SpecialistDefSchema = z.object({
  name: z.string().min(1).describe('专精代理名称'),
  capabilities: z.array(z.string()).describe('专精代理能力列表'),
  selectionCriteria: z.string().describe('专精代理选择条件描述'),
  inputContract: z.string().describe('专精代理输入契约描述'),
  outputContract: z.string().describe('专精代理输出契约描述'),
})

export const DomainCatalogSchema = z.object({
  domain: z.string().min(1).describe('域名标识'),
  domainAgent: AgentDefinitionSchema,
  specialists: z.array(SpecialistDefSchema).describe('专精代理列表'),
})

export const DomainCallRequestSchema = z.object({
  task: z.string().min(1).describe('域调用任务描述'),
  intent: z.string().describe('任务意图标签'),
  constraints: z.array(z.string()).describe('约束条件'),
  domainContext: z.record(z.string(), z.unknown()).describe('域特有扩展上下文'),
  selectedSpecialists: z.array(SpecialistDefSchema).optional().describe('预计算的专精代理列表，域代理优先使用'),
})

export const DomainFindingSchema = z.object({
  severity: z.string().min(1).describe('发现严重级别'),
  title: z.string().min(1).describe('发现标题'),
  evidence: z.string().optional().describe('发现证据摘要'),
})

export const DispatchManifestSchema = z.object({
  dispatched: z.array(z.string()).describe('实际调度的专精代理名称列表'),
  skipped: z.array(z.string()).describe('选中但未调度的专精代理名称列表'),
  skipReasons: z.record(z.string(), z.string()).describe('跳过原因，key 为专精代理名称'),
})

export const DomainExecutionResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']).describe('域执行状态'),
  summary: z.string().describe('域执行摘要'),
  evidence: z.array(z.string()).describe('执行证据列表'),
  artifacts: z.array(z.string()).describe('产出物路径列表'),
  findings: z.array(DomainFindingSchema).optional().describe('域内发现列表'),
  dispatchManifest: DispatchManifestSchema.optional().describe('调度清单，域代理必须填写'),
})

export const SpecialistTaskSchema = z.object({
  task: z.string().min(1).describe('专精任务描述'),
  domainContext: z.record(z.string(), z.unknown()).describe('域特有扩展上下文'),
  constraints: z.array(z.string()).describe('约束条件'),
})

export const SpecialistResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']).describe('专精执行状态'),
  output: z.string().describe('专精执行输出'),
  evidence: z.array(z.string()).describe('执行证据列表'),
})

export type SpecialistDef = z.infer<typeof SpecialistDefSchema>
export type DomainCatalog = z.infer<typeof DomainCatalogSchema>
export type DomainCallRequest = z.infer<typeof DomainCallRequestSchema>
export type DomainFinding = z.infer<typeof DomainFindingSchema>
export type DomainExecutionResult = z.infer<typeof DomainExecutionResultSchema>
export type SpecialistTask = z.infer<typeof SpecialistTaskSchema>
export type SpecialistResult = z.infer<typeof SpecialistResultSchema>
