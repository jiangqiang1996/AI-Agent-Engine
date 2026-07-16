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
  { name: AGENT.OCR_REVIEWER, domain: 'code', alwaysOn: true, description: 'OCR 代码审查主引擎：通过 ae-ocr 工具调用 OpenCodeReview CLI 审查全部代码（含测试代码、配置文件），通过 --rule 注入项目级规则和对抗性审查规则' },
  { name: AGENT.DOCUMENT_REVIEWER, domain: 'both', alwaysOn: true, description: '通用文档审查代理：审查任意文本类型文件（需求文档、设计文档属性、通用文档），通过类型路由加载对应检查框架，共享断言提取→证据匹配→矛盾检测底层原语' },
  { name: AGENT.ARCHITECTURE_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 architecture 维度产物：模块边界、依赖方向、分层规则、数据流、错误传播链' },
  { name: AGENT.API_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 api 维度产物：端点清单、TypeScript interface、认证授权、错误码体系、版本策略、幂等性' },
  { name: AGENT.DATABASE_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 database 维度产物：ER 模型、表结构、外键关系、迁移策略、敏感字段标注' },
  { name: AGENT.UI_UX_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }, { field: 'hasUi', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 ui-ux 和 design-spec 维度产物：信息架构、页面规格、组件契约、设计 Token、交互状态机、无障碍要求' },
  { name: AGENT.TEST_CASES_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }], [{ field: 'targetTypes', operator: 'contains', value: 'test-case' }]], description: '审查 test-cases 维度产物：覆盖矩阵、P0-P3 用例、行为契约规格、维度覆盖追溯' },
  { name: AGENT.SECURITY_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }], [{ field: 'hasSecurity', operator: 'truthy' }]], description: '审查 security 维度产物：威胁模型、信任边界、认证授权流程、数据分级、密钥管理' },
  { name: AGENT.OBSERVABILITY_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 observability 维度产物：日志规范、指标体系、告警规则、健康检查、SLO/SLI 定义' },
  { name: AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查 non-functional 维度产物：性能目标、并发模型、事务边界、缓存策略、容量规划' },
  { name: AGENT.DESIGN_INTEGRITY_REVIEWER, domain: 'document', alwaysOn: false, conditionGroups: [[{ field: 'hasDesignContract', operator: 'truthy' }], [{ field: 'targetTypes', operator: 'contains', value: 'design' }]], description: '审查跨维度完整性与确定性：拆分设计文件间冲突、字段匹配、映射表完整性、维度间引用一致性、矛盾检测' },
  { name: AGENT.TRACEABILITY_REVIEWER, domain: 'both', alwaysOn: false, conditionGroups: [[{ field: 'hasMixedTargets', operator: 'truthy' }], [{ field: 'kind', operator: 'eq', value: 'general' }]], description: '审查需求/设计/代码之间的追溯一致性，识别孤儿条目、断裂引用和未声明的延期' },
  { name: AGENT.GOAL_ALIGNMENT_REVIEWER, domain: 'both', alwaysOn: false, conditionGroups: [[{ field: 'hasGoalAlignment', operator: 'truthy' }]], description: '对照审查目标逐条校验变更是否达成各项目标，识别未达成项和偏离' },
]
