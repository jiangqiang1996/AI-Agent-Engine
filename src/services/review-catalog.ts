import { AGENT } from '../schemas/ae-asset-schema.js'

export type PredicateOperator = 'truthy' | 'eq' | 'oneOf' | 'contains'

export interface ActivationPredicate {
  field: string
  operator: PredicateOperator
  value?: unknown
}

export interface MatrixEntry {
  name: string
  domain: 'code' | 'document' | 'both'
  alwaysOn: boolean
  conditionGroups?: ActivationPredicate[][]
  description: string
}

export const REVIEW_MATRIX: MatrixEntry[] = [
  { name: AGENT.CORRECTNESS_REVIEWER, domain: 'code', alwaysOn: true, description: '审查逻辑正确性与边界条件' },
  { name: AGENT.TESTING_REVIEWER, domain: 'code', alwaysOn: true, description: '审查测试覆盖与断言质量' },
  { name: AGENT.MAINTAINABILITY_REVIEWER, domain: 'code', alwaysOn: true, description: '审查可维护性与抽象合理性' },
  { name: AGENT.STANDARDS_REVIEWER, domain: 'code', alwaysOn: true, description: '审查是否遵守项目规范（含配置文件语法正确性、schema 一致性和敏感值检测）' },
  { name: AGENT.RESEARCH_REVIEWER, domain: 'code', alwaysOn: true, description: '搜索历史方案、最佳实践和框架文档' },

  { name: AGENT.COHERENCE_REVIEWER, domain: 'document', alwaysOn: true, description: '审查文档的内部一致性' },
  { name: AGENT.FEASIBILITY_REVIEWER, domain: 'document', alwaysOn: true, description: '评估文档中提出的技术方法能否经受现实考验' },

  {
    name: AGENT.SECURITY_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasSecurity', operator: 'truthy' }]],
    description: '审查安全漏洞（代码域）/ 评估文档中的安全缺口（文档域）',
  },
  {
    name: AGENT.ADVERSARIAL_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'changedLineCountGte50', operator: 'truthy' }],
      [{ field: 'hasSecurity', operator: 'truthy' }],
      [{ field: 'hasApi', operator: 'truthy' }],
      [{ field: 'requirementCountGte5', operator: 'truthy' }],
      [{ field: 'hasArchitectureDecision', operator: 'truthy' }],
      [{ field: 'isHighRiskDomain', operator: 'truthy' }],
      [{ field: 'hasNewAbstraction', operator: 'truthy' }],
    ],
    description: '对抗式构造故障场景（代码域）/ 对文档做对抗式压力测试（文档域）',
  },
  {
    name: AGENT.AGENT_NATIVE_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasCli', operator: 'truthy' }],
      [{ field: 'hasUi', operator: 'truthy' }],
      [{ field: 'hasTooling', operator: 'truthy' }],
      [{ field: 'hasAgentConfig', operator: 'truthy' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'asset' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'asset' }],
    ],
    description: '审查代理、CLI、工具配置或 UI 能力是否让代理具备与用户对等的操作能力',
  },
  {
    name: AGENT.ARCHITECTURE_STRATEGIST,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [
      [
        { field: 'kind', operator: 'eq', value: 'code' },
        { field: 'hasArchitectureDecision', operator: 'truthy' },
      ],
      [
        { field: 'kind', operator: 'eq', value: 'code' },
        { field: 'hasNewAbstraction', operator: 'truthy' },
      ],
      [
        { field: 'kind', operator: 'eq', value: 'code' },
        { field: 'changedLineCountGte50', operator: 'truthy' },
      ],
      [
        { field: 'kind', operator: 'eq', value: 'document' },
        { field: 'documentType', operator: 'eq', value: 'design' },
        { field: 'hasArchitectureDecision', operator: 'truthy' },
      ],
    ],
    description: '从架构视角分析代码变更和设计中的架构决策，检查架构边界、跨模块依赖和系统级抽象',
  },
  {
    name: AGENT.PERFORMANCE_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasPerformance', operator: 'truthy' }]],
    description: '审查性能瓶颈',
  },
  {
    name: AGENT.API_CONTRACT_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasApi', operator: 'truthy' }]],
    description: '审查接口契约破坏性变更',
  },
  {
    name: AGENT.RELIABILITY_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasReliability', operator: 'truthy' }],
      [{ field: 'hasInfra', operator: 'truthy' }],
    ],
    description: '审查故障恢复与可靠性（含基础设施定义的最佳实践和安全性）',
  },
  {
    name: AGENT.DATA_MIGRATIONS_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasMigrations', operator: 'truthy' }],
      [{ field: 'hasDatabase', operator: 'truthy' }],
    ],
    description: '审查数据迁移（含数据库迁移可逆性、完整性约束和索引策略）',
  },
  {
    name: AGENT.PREVIOUS_COMMENTS_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasPrMetadata', operator: 'truthy' }]],
    description: '复查历史审查评论处理情况',
  },
  {
    name: AGENT.PRODUCT_LENS_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'design' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'design' }],
      [{ field: 'requirementCountGte5', operator: 'truthy' }],
      [{ field: 'hasProductClaim', operator: 'truthy' }],
    ],
    description: '以产品视角审查战略主张、范围对齐和不合理的复杂度',
  },
  {
    name: AGENT.STEP_GRANULARITY_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'design' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'design' }],
      [{ field: 'requirementCountGte5', operator: 'truthy' }],
    ],
    description: '审查设计步骤粒度与批量操作可脚本化',
  },
  {
    name: AGENT.DESIGN_LENS_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasUi', operator: 'truthy' }],
      [{ field: 'documentType', operator: 'eq', value: 'design' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'design' }],
    ],
    description: '审查文档中缺失的设计决策',
  },
  {
    name: AGENT.TEST_CASE_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'test' }],
      [{ field: 'documentType', operator: 'eq', value: 'design' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'test-case' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'test-case' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'design' }],
    ],
    description: '审查测试用例维度的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度',
  },
  {
    name: AGENT.REQUIREMENTS_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'requirements' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'requirements' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'requirements' }],
    ],
    description: '审查需求文档的目标清晰度、范围边界、验收标准可验证性、用户/角色完整性和未决问题',
  },
  {
    name: AGENT.PROTOTYPE_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'design' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'prototype' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'prototype' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'design' }],
    ],
    description: '审查原型/线框维度的交互完整性、状态覆盖、与需求的一致性以及实现可行性提示',
  },
  {
    name: AGENT.EVIDENCE_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'documentType', operator: 'eq', value: 'general' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'document' }],
      [{ field: 'reviewScenes', operator: 'contains', value: 'general-document' }],
      [{ field: 'hasEvidenceClaim', operator: 'truthy' }],
    ],
    description: '审查文档或交付说明中的事实性证据：可观察的工作区状态、命令输出、引用与外部声明是否真实可核验',
  },
  {
    name: AGENT.GOAL_ALIGNMENT_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasGoalAlignment', operator: 'truthy' }]],
    description: '对照显式审查目标逐条校验变更是否达成各项目标，识别未达成项和偏离',
  },
  {
    name: AGENT.DESIGN_CONSISTENCY_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasDesignContract', operator: 'truthy' }],
      [{ field: 'targetTypes', operator: 'contains', value: 'design' }],
    ],
    description: '审查设计文档与需求的一致性、设计维度完整性、架构与数据模型可行性和安全设计覆盖',
  },
  {
    name: AGENT.UI_CONSISTENCY_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasDesignContract', operator: 'truthy' }, { field: 'hasUi', operator: 'truthy' }],
    ],
    description: '审查 UI/UX 设计维度的交互流程完整性、状态覆盖和与需求的一致性',
  },
  {
    name: AGENT.TEST_COVERAGE_REVIEWER,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }]],
    description: '审查设计文档中测试用例维度的覆盖完备性、步骤可执行性和需求对齐程度',
  },
  {
    name: AGENT.TRACEABILITY_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasMixedTargets', operator: 'truthy' }],
      [{ field: 'kind', operator: 'eq', value: 'general' }],
    ],
    description: '审查需求/设计/测试用例之间的追溯一致性，识别孤儿条目、断裂引用和未声明的延期',
  },
]
