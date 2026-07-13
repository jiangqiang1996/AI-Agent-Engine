import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { Effect } from 'effect'

import { selectSpecialists, getCoordinationStrategy } from '../services/domain-dispatch-service.js'
import {
  selectReviewers,
  type ReviewKind,
  type ReviewDocumentType,
  type ReviewSceneType,
  type ReviewTargetType,
} from '../services/review-selector.js'
import { AeModeSchema, type SpecialistDef } from '../schemas/ae-asset-schema.js'

const SCENE_VALUES: ReviewSceneType[] = [
  'code',
  'requirements',
  'design',
  'prototype',
  'test-case',
  'config',
  'asset',
  'general-document',
]

const TARGET_VALUES: ReviewTargetType[] = [
  'code',
  'requirements',
  'design',
  'prototype',
  'test-case',
  'config',
  'asset',
  'document',
]

function resolveKind(raw: string): ReviewKind {
  if (raw === 'code') return 'code'
  if (raw === 'general' || raw === 'mixed' || raw === 'hybrid') return 'general'
  return 'document'
}

function resolveDocumentType(raw: string): ReviewDocumentType | undefined {
  if (raw === 'test') return 'test'
  if (raw === 'design') return 'design'
  if (raw === 'general') return 'general'
  if (raw === 'document') return 'requirements'
  if (raw === 'code') return undefined
  if (raw === 'mixed' || raw === 'hybrid') return undefined
  return 'requirements'
}

function parseList<T extends string>(value: string | undefined, allowed: T[]): T[] | undefined {
  if (!value) return undefined
  const parts = value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  if (parts.length === 0) return undefined
  const filtered = parts.filter((part): part is T => (allowed as string[]).includes(part))
  return filtered.length > 0 ? filtered : undefined
}

const TARGET_TO_REVIEWERS: Record<ReviewTargetType, string[]> = {
  code: [
    'correctness-reviewer',
    'testing-reviewer',
    'maintainability-reviewer',
    'standards-reviewer',
  ],
  requirements: ['requirements-reviewer'],
  design: ['design-lens-reviewer', 'step-granularity-reviewer', 'product-lens-reviewer', 'prototype-reviewer', 'test-case-reviewer'],
  prototype: ['prototype-reviewer'],
  'test-case': ['test-case-reviewer'],
  config: ['standards-reviewer'],
  asset: ['agent-native-reviewer'],
  document: ['coherence-reviewer', 'feasibility-reviewer', 'evidence-reviewer'],
}

function computeTargetCoverage(
  targetTypes: ReviewTargetType[] | undefined,
  selectedReviewers: string[],
): Record<string, { status: 'covered' | 'uncovered'; reviewers: string[] }> | undefined {
  if (!targetTypes || targetTypes.length === 0) return undefined
  const selected = new Set(selectedReviewers)
  const coverage: Record<string, { status: 'covered' | 'uncovered'; reviewers: string[] }> = {}
  for (const target of targetTypes) {
    const candidates = TARGET_TO_REVIEWERS[target] ?? []
    const matched = candidates.filter((name) => selected.has(name))
    coverage[target] = {
      status: matched.length > 0 ? 'covered' : 'uncovered',
      reviewers: matched,
    }
  }
  return coverage
}

export const aeReviewContractTool: ToolDefinition = tool({
  description: [
    '返回 AE 审查契约。',
    '',
    '功能说明：',
    '- 根据审查类型与模式生成审查团队',
    '- 代码审查（kind=code）：支持 Git 差异、全量扫描、会话变更等多种范围确定方式',
    '- 文档审查（kind=document/test/general/design/prototype）：面向文档，与 Git 无强关联',
    '- 通用混合审查（kind=general/mixed/hybrid）：同一次审查覆盖多种产出物类型，按 scenes/targets 分桶',
    '- 返回门控规则、模式边界与目标覆盖摘要',
    '',
    '适用场景：',
    '- markdown 技能需要先确定审查团队再并行派发时',
    '- README 或测试需要校验公开审查契约时',
    '',
    '不适用场景：',
    '- 不负责真正执行审查子代理',
    '- 不负责写入审查发现或审查产物',
  ].join('\n'),
  args: {
    kind: tool.schema
      .enum(['document', 'test', 'general', 'code', 'design', 'prototype', 'mixed', 'hybrid'])
      .describe('审查类型'),
    mode: AeModeSchema.describe('审查模式'),
    scenes: tool.schema
      .string()
      .optional()
      .describe('审查场景列表，逗号分隔，可选值：code/requirements/design/prototype/test-case/config/asset/general-document'),
    reviewScenes: tool.schema
      .string()
      .optional()
      .describe('scenes 的别名；审查场景列表，逗号分隔'),
    targets: tool.schema
      .string()
      .optional()
      .describe('目标产出物类型列表，逗号分隔，可选值：code/requirements/design/prototype/test-case/config/asset/document'),
    targetTypes: tool.schema
      .string()
      .optional()
      .describe('targets 的别名；目标产出物类型列表，逗号分隔'),
    has_ui: tool.schema.boolean().optional().describe('是否涉及 UI'),
    has_security: tool.schema.boolean().optional().describe('是否涉及安全边界'),
    has_cli: tool.schema.boolean().optional().describe('是否涉及 CLI'),
    has_tooling: tool.schema.boolean().optional().describe('是否涉及工具定义、工具参数或工具注册'),
    has_agent_config: tool.schema.boolean().optional().describe('是否涉及代理配置、代理注册或技能 frontmatter'),
    has_typescript: tool.schema.boolean().optional().describe('是否涉及 TypeScript 代码'),
    has_performance: tool.schema.boolean().optional().describe('是否涉及性能敏感逻辑'),
    has_api: tool.schema.boolean().optional().describe('是否涉及 API 契约变更'),
    has_reliability: tool.schema.boolean().optional().describe('是否涉及可靠性/容错机制'),
    changed_lines: tool.schema.number().optional().describe('改动行数'),
    has_pr_metadata: tool.schema.boolean().optional().describe('是否存在 PR 元数据'),
    requirement_count: tool.schema.number().optional().describe('需求数量'),
    has_architecture_decision: tool.schema.boolean().optional().describe('是否包含重要架构决策'),
    has_product_claim: tool.schema.boolean().optional().describe('是否包含战略或产品主张'),
    is_high_risk_domain: tool.schema.boolean().optional().describe('是否属于高风险领域'),
    has_new_abstraction: tool.schema.boolean().optional().describe('是否提出新抽象'),
    has_migrations: tool.schema.boolean().optional().describe('是否涉及数据迁移'),
    has_config: tool.schema.boolean().optional().describe('是否涉及配置变更'),
    has_infra: tool.schema.boolean().optional().describe('是否涉及基础设施变更'),
    has_database: tool.schema.boolean().optional().describe('是否涉及数据库变更'),
    has_script: tool.schema.boolean().optional().describe('是否涉及脚本变更'),
    has_upstream: tool.schema.boolean().optional().describe('文档是否记录了 upstream/origin 等上游来源'),
    has_goal_alignment: tool.schema.boolean().optional().describe('是否提供审查目标（成功条件列表），激活目标对齐审查'),
    has_design_contract: tool.schema.boolean().optional().describe('是否存在设计文档契约，激活设计一致性、UI 一致性和测试覆盖审查'),
    has_evidence_claim: tool.schema.boolean().optional().describe('文档是否包含事实性声明、外部引用或交付证据，需要 evidence-reviewer 校验'),
  },
  async execute(args) {
    return Effect.runPromise(
      Effect.try({
        try: () => {
          const kind = resolveKind(args.kind)
          const documentType = resolveDocumentType(args.kind)
          const reviewScenes = parseList<ReviewSceneType>(args.scenes ?? args.reviewScenes, SCENE_VALUES)
          const parsedTargetTypes = parseList<ReviewTargetType>(args.targets ?? args.targetTypes, TARGET_VALUES)
          const targetTypes: ReviewTargetType[] | undefined = parsedTargetTypes
          const hasMixedTargets = kind === 'general' || (targetTypes?.length ?? 0) >= 2
          const hasEvidenceClaim = args.has_evidence_claim

          const domainContext: Record<string, unknown> = {
            kind: args.kind,
            normalizedKind: kind,
            documentType,
            reviewScenes,
            targetTypes,
            hasMixedTargets,
            hasSecurity: args.has_security,
            hasPerformance: args.has_performance,
            hasApi: args.has_api,
            hasReliability: args.has_reliability,
            hasCli: args.has_cli,
            hasTooling: args.has_tooling,
            hasAgentConfig: args.has_agent_config,
            hasPrMetadata: args.has_pr_metadata,
            hasTypescript: args.has_typescript,
            hasMigrations: args.has_migrations,
            hasConfig: args.has_config,
            hasInfra: args.has_infra,
            hasDatabase: args.has_database,
            hasScript: args.has_script,
            hasUi: args.has_ui,
            changedLineCount: args.changed_lines,
            requirementCount: args.requirement_count,
            hasArchitectureDecision: args.has_architecture_decision,
            hasProductClaim: args.has_product_claim,
            isHighRiskDomain: args.is_high_risk_domain,
            hasNewAbstraction: args.has_new_abstraction,
            hasUpstream: args.has_upstream,
            hasGoalAlignment: args.has_goal_alignment,
            hasDesignContract: args.has_design_contract,
            hasEvidenceClaim,
          }

          const taskIntent = {
            stage: 'entry' as const,
            intent: `${kind} review`,
            domain: 'review',
            constraints: [],
            rawInput: `${kind} review`,
            timestamp: new Date().toISOString(),
          }

          const selectedSpecialists: SpecialistDef[] = selectSpecialists('review', taskIntent, domainContext)
          const selectedNames = selectedSpecialists.map((s) => s.name)

          const reviewers = selectReviewers({
            kind,
            documentType,
            reviewScenes,
            targetTypes,
            hasMixedTargets,
            hasEvidenceClaim,
            hasSecurity: args.has_security,
            hasPerformance: args.has_performance,
            hasApi: args.has_api,
            hasReliability: args.has_reliability,
            hasCli: args.has_cli,
            hasTooling: args.has_tooling,
            hasAgentConfig: args.has_agent_config,
            hasPrMetadata: args.has_pr_metadata,
            hasTypescript: args.has_typescript,
            hasMigrations: args.has_migrations,
            hasConfig: args.has_config,
            hasInfra: args.has_infra,
            hasDatabase: args.has_database,
            hasScript: args.has_script,
            hasUi: args.has_ui,
            changedLineCount: args.changed_lines,
            requirementCount: args.requirement_count,
            hasArchitectureDecision: args.has_architecture_decision,
            hasProductClaim: args.has_product_claim,
            isHighRiskDomain: args.is_high_risk_domain,
            hasNewAbstraction: args.has_new_abstraction,
            hasUpstream: args.has_upstream,
            hasGoalAlignment: args.has_goal_alignment,
            hasDesignContract: args.has_design_contract,
          })

          return JSON.stringify(
            {
              kind: args.kind,
              normalizedKind: kind,
              documentType: kind === 'code' ? undefined : documentType,
              reviewScenes,
              targetTypes,
              hasMixedTargets,
              targetCoverage: computeTargetCoverage(targetTypes, reviewers),
              mode: args.mode,
              reviewers,
              selectedSpecialists: selectedNames,
              coordinationStrategy: getCoordinationStrategy('review'),
              nonSelectionInputs: ['has_typescript', 'has_config', 'has_script'],
              gate:
                kind === 'code'
                  ? 'P0/P1 默认阻断；只读模式仅报告'
                  : kind === 'general'
                    ? '通用域：按目标类型分别评估；任一目标类型存在 P0/P1 默认阻断；未覆盖目标类型必须显式标注原因'
                    : '文档与设计审查默认作为质量门控',
            },
            null,
            2,
          )
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return Effect.succeed(`❌ 审查契约生成失败：${message}`)
        }),
      ),
    )
  },
})
