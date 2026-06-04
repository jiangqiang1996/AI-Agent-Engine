import { AGENT } from '../schemas/ae-asset-schema.js'

export type PredicateOperator = 'truthy' | 'eq' | 'oneOf'

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
        { field: 'documentType', operator: 'eq', value: 'plan' },
        { field: 'hasArchitectureDecision', operator: 'truthy' },
      ],
    ],
    description: '从架构视角分析代码变更和计划中的架构决策，检查模式合规性和设计完整性',
  },
  {
    name: AGENT.PATTERN_RECOGNITION_SPECIALIST,
    domain: 'code',
    alwaysOn: false,
    conditionGroups: [
      [{ field: 'hasNewAbstraction', operator: 'truthy' }],
      [{ field: 'changedLineCountGte50', operator: 'truthy' }],
    ],
    description: '分析代码中的设计模式、反模式、命名规范和重复代码',
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
      [{ field: 'documentType', operator: 'eq', value: 'plan' }],
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
      [{ field: 'documentType', operator: 'eq', value: 'plan' }],
      [{ field: 'requirementCountGte5', operator: 'truthy' }],
    ],
    description: '审查计划步骤粒度与批量操作可脚本化',
  },
  {
    name: AGENT.DESIGN_LENS_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasUi', operator: 'truthy' }]],
    description: '审查文档中缺失的设计决策',
  },
  {
    name: AGENT.TEST_CASE_REVIEWER,
    domain: 'document',
    alwaysOn: false,
    conditionGroups: [[{ field: 'documentType', operator: 'eq', value: 'test' }]],
    description: '审查测试用例文档的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度',
  },
  {
    name: AGENT.GOAL_ALIGNMENT_REVIEWER,
    domain: 'both',
    alwaysOn: false,
    conditionGroups: [[{ field: 'hasGoalAlignment', operator: 'truthy' }]],
    description: '对照显式审查目标逐条校验变更是否达成各项目标，识别未达成项和偏离',
  },
]
