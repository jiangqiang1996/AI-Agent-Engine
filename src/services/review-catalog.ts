import { AGENT } from '../schemas/ae-asset-schema.js'

export interface ReviewDefinition {
  name: string
  description: string
  alwaysOn: boolean
}

// ae:document-review 使用的文档审查代理
// 面向文档的专项审查，与 Git 版本差异无强关联
export const DOCUMENT_REVIEWERS: ReviewDefinition[] = [
  { name: AGENT.COHERENCE_REVIEWER, description: '审查文档内部一致性', alwaysOn: true },
  { name: AGENT.FEASIBILITY_REVIEWER, description: '评估方案落地可行性', alwaysOn: true },
  { name: AGENT.PRODUCT_LENS_REVIEWER, description: '从产品价值与用户视角审查', alwaysOn: false },
  { name: AGENT.SCOPE_GUARDIAN_REVIEWER, description: '审查范围是否蔓延', alwaysOn: false },
  { name: AGENT.ADVERSARIAL_DOCUMENT_REVIEWER, description: '对文档做对抗式压力测试', alwaysOn: false },
  { name: AGENT.DESIGN_LENS_REVIEWER, description: '审查界面与交互设计约束', alwaysOn: false },
  { name: AGENT.SECURITY_LENS_REVIEWER, description: '审查文档中的安全边界', alwaysOn: false },
  { name: AGENT.STEP_GRANULARITY_REVIEWER, description: '审查计划步骤是否拆解至最小不可再分单元', alwaysOn: false },
  { name: AGENT.BATCH_OPERATION_REVIEWER, description: '审查多文件操作是否可脚本化批量执行', alwaysOn: false },
]

// ae:review 使用的代码审查代理
// 全能审查：支持 Git 差异、全量扫描、会话变更等多种范围确定方式，排除需求文档和计划文档
export const CODE_REVIEWERS: ReviewDefinition[] = [
  { name: AGENT.CORRECTNESS_REVIEWER, description: '审查逻辑正确性与边界条件', alwaysOn: true },
  { name: AGENT.TESTING_REVIEWER, description: '审查测试覆盖与断言质量', alwaysOn: true },
  { name: AGENT.MAINTAINABILITY_REVIEWER, description: '审查可维护性与抽象合理性', alwaysOn: true },
  { name: AGENT.PROJECT_STANDARDS_REVIEWER, description: '审查是否遵守项目规范', alwaysOn: true },
  { name: AGENT.AGENT_NATIVE_REVIEWER, description: '审查代理操作友好性', alwaysOn: true },
  { name: AGENT.LEARNINGS_RESEARCHER, description: '搜索 docs/ae/solutions/ 查找历史问题', alwaysOn: true },
  { name: AGENT.SECURITY_REVIEWER, description: '审查安全漏洞', alwaysOn: false },
  { name: AGENT.PERFORMANCE_REVIEWER, description: '审查性能瓶颈', alwaysOn: false },
  { name: AGENT.API_CONTRACT_REVIEWER, description: '审查接口契约破坏性变更', alwaysOn: false },
  { name: AGENT.RELIABILITY_REVIEWER, description: '审查故障恢复与可靠性', alwaysOn: false },
  { name: AGENT.CLI_AGENT_READINESS_REVIEWER, description: '审查 CLI 与代理调用体验', alwaysOn: false },
  { name: AGENT.PREVIOUS_COMMENTS_REVIEWER, description: '复查历史审查评论处理情况', alwaysOn: false },
  { name: AGENT.KIERAN_TYPESCRIPT_REVIEWER, description: '按严格 TS 标准审查实现', alwaysOn: false },
  { name: AGENT.ADVERSARIAL_REVIEWER, description: '对抗式构造故障场景', alwaysOn: false },
  { name: AGENT.DATA_MIGRATIONS_REVIEWER, description: '审查数据迁移', alwaysOn: false },
  { name: AGENT.CONFIG_REVIEWER, description: '审查配置文件语法正确性、schema 一致性和敏感值', alwaysOn: false },
  { name: AGENT.INFRA_REVIEWER, description: '审查基础设施定义的最佳实践和安全性', alwaysOn: false },
  { name: AGENT.DATABASE_REVIEWER, description: '审查数据库迁移可逆性、完整性约束和索引策略', alwaysOn: false },
  { name: AGENT.SCRIPT_REVIEWER, description: '审查脚本可移植性、幂等性和平台兼容性', alwaysOn: false },
]
