import { z } from 'zod'

export const SKILL = {
  BRAINSTORM: 'ae:brainstorm',
  PRD: 'ae:prd',
  PRD_UPDATE: 'ae:prd-update',
  DESIGN: 'ae:design',
  DESIGN_UPDATE: 'ae:design-update',
  AGENT_CREATOR: 'ae:agent-creator',
  WORK: 'ae:work',
  WORK_REPORT: 'ae:work-report',
  MY_CODE_CHANGES: 'ae:my-code-changes',
  MERGE_BRANCH: 'ae:merge-branch',
  REVIEW: 'ae:review',
  PLAYWRIGHT: 'ae:playwright',
  PROTOTYPE_PREVIEW: 'ae:prototype-preview',
  HANDOFF: 'ae:handoff',
  TASK_LOOP: 'ae:task-loop',
  SQL: 'ae:sql',
  SWAGGER_PARSER: 'ae:swagger-parser',
  API_TEST: 'ae:api-test',
  UNIT_TEST: 'ae:unit-test',
  E2E_TEST: 'ae:e2e-test',
  FRONTEND_FIX: 'ae:frontend-fix',
  BACKEND_FIX: 'ae:backend-fix',
  SLIDES_OUTLINE: 'ae:slides-outline',

  IMAGE: 'ae:image',
  AUDIO: 'ae:audio',
  VIDEO: 'ae:video',
  PROJECT_EXPLORE: 'ae:project-explore',
  SAVE_EXPERIENCE: 'ae:save-experience',
  SKILL_CREATOR: 'ae:skill-creator',
  DOCX: 'ae:docx',
  PDF: 'ae:pdf',
  PPTX: 'ae:pptx',
  XLSX: 'ae:xlsx',
  PROMPT_OPTIMIZE: 'ae:prompt-optimize',
  GRILL: 'ae:grill',
  OFFICECLI: 'ae:officecli',
  OCR: 'ae:ocr',
} as const

type SkillToCommand<S extends string> = S extends `ae:${infer R}` ? `ae-${R}` : S

const SKILL_COMMANDS = Object.fromEntries(
  Object.entries(SKILL).map(([k, v]) => [k, v.replace(/^ae:/, 'ae-')]),
) as { readonly [K in keyof typeof SKILL]: SkillToCommand<(typeof SKILL)[K]> }

export const COMMAND = {
  ...SKILL_COMMANDS,
} as const

export const AGENT = {
  OCR_REVIEWER: 'ocr-reviewer',
  DOCUMENT_REVIEWER: 'document-reviewer',
  ARCHITECTURE_DESIGN_REVIEWER: 'architecture-design-reviewer',
  API_DESIGN_REVIEWER: 'api-design-reviewer',
  DATABASE_DESIGN_REVIEWER: 'database-design-reviewer',
  UI_UX_DESIGN_REVIEWER: 'ui-ux-design-reviewer',
  TEST_CASES_DESIGN_REVIEWER: 'test-cases-design-reviewer',
  SECURITY_DESIGN_REVIEWER: 'security-design-reviewer',
  OBSERVABILITY_DESIGN_REVIEWER: 'observability-design-reviewer',
  NON_FUNCTIONAL_DESIGN_REVIEWER: 'non-functional-design-reviewer',
  DESIGN_INTEGRITY_REVIEWER: 'design-integrity-reviewer',
  TRACEABILITY_REVIEWER: 'traceability-reviewer',
  GOAL_ALIGNMENT_REVIEWER: 'goal-alignment-reviewer',
  REPO_RESEARCH_ANALYST: 'repo-research-analyst',
  WEB_RESEARCHER: 'web-researcher',
  SPEC_FLOW_ANALYZER: 'spec-flow-analyzer',
  UI_ARCHITECT: 'ui-architect',
  LOGIC_WEAVER: 'logic-weaver',
  E2E_TEST_RUNNER: 'e2e-test-runner',
  UNIT_TEST_RUNNER: 'unit-test-runner',
  TEST_TRIAGE: 'test-triage',
  FRONTEND_FIX: 'frontend-fix',
  BACKEND_FIX: 'backend-fix',
  UI_UX_DESIGNER: 'ui-ux-designer',
  UI_DESIGN_SPEC: 'ui-design-spec',
  ARCHITECTURE_DESIGNER: 'architecture-designer',
  API_DESIGNER: 'api-designer',
  DATABASE_DESIGNER: 'database-designer',
  TEST_CASES_DESIGNER: 'test-cases-designer',
  SECURITY_DESIGNER: 'security-designer',
  OBSERVABILITY_DESIGNER: 'observability-designer',
  NON_FUNCTIONAL_DESIGNER: 'non-functional-designer',
  FRONTEND_DEV: 'frontend-dev',
  BACKEND_DEV: 'backend-dev',
} as const

export function skillDir(skillName: string): string {
  return skillName.replace(/^ae:/, 'ae-')
}

export const TOOL = {
  AE_HANDOFF: 'ae-handoff',
  AE_WORKTREE_HANDOFF: 'ae-worktree-handoff',
  AE_CREATE_SESSION: 'ae-create-session',
  AE_HELP: 'ae-help',
  AE_REVIEW_PROOF: 'ae-review-proof',
  AE_SWAGGER_PARSER: 'ae-swagger-parser',

  AE_IMAGE: 'ae-image',
  AE_AUDIO: 'ae-audio',
  AE_VIDEO: 'ae-video',
  AE_DOMAIN_CATALOG: 'ae-domain-catalog',
  AE_TIMER: 'ae-timer',
  AE_WORK_SPECIALIST_SELECT: 'ae-work-specialist-select',
  AE_SPECIALIST_AGGREGATE: 'ae-specialist-aggregate',
  AE_REVIEW_SCOPE_ANALYZE: 'ae-review-scope-analyze',
  AE_ASYNC_BASH: 'ae-async-bash',
  AE_PDF: 'ae-pdf',
  AE_BRAINSTORM: 'ae-brainstorm',
  AE_OFFICECLI: 'ae-officecli',
  AE_OCR: 'ae-ocr',
  AE_TEST_TRIAGE: 'ae-test-triage',
} as const

export const AeModeSchema = z
  .enum(['interactive', 'headless', 'report-only', 'autofix'])
  .describe('AE 审查模式')

export const AeSkillNameSchema = z
  .enum(Object.values(SKILL) as [string, ...string[]])
  .describe('AE 技能名')

const ALL_COMMAND_NAMES = [
  ...Object.values(COMMAND),
] as [string, ...string[]]

export const AeCommandNameSchema = z
  .enum(ALL_COMMAND_NAMES)
  .describe('AE 命令名')

export const SkillTierSchema = z
  .enum(['core', 'docs', 'tools', 'meta'])
  .describe('技能层级：core=工程流程核心，docs=文档生成，tools=辅助工具，meta=维护与配置')

export const AeAssetEntrySchema = z.object({
  skillName: AeSkillNameSchema.describe('技能名'),
  commandName: AeCommandNameSchema.describe('命令名'),
  description: z.string().min(1).describe('功能描述'),
  argumentHint: z.string().optional().describe('参数提示'),
  skillFile: z.string().describe('技能文件路径，无关联技能时为空字符串'),
  customTemplate: z.string().optional().describe('自定义命令模板，command-registration.ts 优先于默认模板使用'),
  tier: SkillTierSchema.describe('技能层级'),
})

export const AgentStageSchema = z
  .enum(['review', 'research', 'workflow', 'development'])
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
