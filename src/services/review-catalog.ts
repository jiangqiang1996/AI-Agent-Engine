export interface ReviewDefinition {
  name: string
  description: string
  alwaysOn: boolean
}

export const DOCUMENT_REVIEWERS: ReviewDefinition[] = [
  { name: 'coherence-reviewer', description: '检查文档内部一致性', alwaysOn: true },
  { name: 'feasibility-reviewer', description: '检查方案落地可行性', alwaysOn: true },
  { name: 'product-lens-reviewer', description: '检查产品价值与用户视角', alwaysOn: false },
  { name: 'scope-guardian-reviewer', description: '检查范围是否蔓延', alwaysOn: false },
  { name: 'adversarial-document-reviewer', description: '对文档做对抗式压力测试', alwaysOn: false },
  { name: 'design-lens-reviewer', description: '检查设计与交互约束', alwaysOn: false },
  { name: 'security-lens-reviewer', description: '检查安全边界', alwaysOn: false },
]

export const CODE_REVIEWERS: ReviewDefinition[] = [
  { name: 'correctness-reviewer', description: '检查逻辑正确性', alwaysOn: true },
  { name: 'testing-reviewer', description: '检查测试覆盖', alwaysOn: true },
  { name: 'maintainability-reviewer', description: '检查可维护性', alwaysOn: true },
  { name: 'project-standards-reviewer', description: '检查项目规范', alwaysOn: true },
  { name: 'agent-native-reviewer', description: '检查 agent 操作对等性', alwaysOn: false },
  { name: 'security-reviewer', description: '检查安全漏洞', alwaysOn: false },
  { name: 'performance-reviewer', description: '检查性能瓶颈', alwaysOn: false },
  { name: 'api-contract-reviewer', description: '检查契约破坏性变更', alwaysOn: false },
  { name: 'reliability-reviewer', description: '检查故障恢复能力', alwaysOn: false },
  { name: 'cli-readiness-reviewer', description: '检查 CLI 调用体验', alwaysOn: false },
  { name: 'previous-comments-reviewer', description: '检查历史评论处理情况', alwaysOn: false },
  { name: 'kieran-typescript-reviewer', description: '按严格 TS 标准审查', alwaysOn: false },
  { name: 'adversarial-reviewer', description: '对抗式构造故障场景', alwaysOn: false },
]
