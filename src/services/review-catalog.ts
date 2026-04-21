export interface ReviewDefinition {
  name: string
  description: string
  alwaysOn: boolean
}

export const DOCUMENT_REVIEWERS: ReviewDefinition[] = [
  { name: 'coherence-reviewer', description: '审查文档内部一致性', alwaysOn: true },
  { name: 'feasibility-reviewer', description: '评估方案落地可行性', alwaysOn: true },
  { name: 'product-lens-reviewer', description: '从产品价值与用户视角审查', alwaysOn: false },
  { name: 'scope-guardian-reviewer', description: '审查范围是否蔓延', alwaysOn: false },
  { name: 'adversarial-document-reviewer', description: '对文档做对抗式压力测试', alwaysOn: false },
  { name: 'design-lens-reviewer', description: '审查界面与交互设计约束', alwaysOn: false },
  { name: 'security-lens-reviewer', description: '审查文档中的安全边界', alwaysOn: false },
]

export const CODE_REVIEWERS: ReviewDefinition[] = [
  { name: 'correctness-reviewer', description: '审查逻辑正确性与边界条件', alwaysOn: true },
  { name: 'testing-reviewer', description: '审查测试覆盖与断言质量', alwaysOn: true },
  { name: 'maintainability-reviewer', description: '审查可维护性与抽象合理性', alwaysOn: true },
  { name: 'project-standards-reviewer', description: '审查是否遵守项目规范', alwaysOn: true },
  { name: 'agent-native-reviewer', description: '审查代理操作友好性', alwaysOn: true },
  { name: 'security-reviewer', description: '审查安全漏洞', alwaysOn: false },
  { name: 'performance-reviewer', description: '审查性能瓶颈', alwaysOn: false },
  { name: 'api-contract-reviewer', description: '审查接口契约破坏性变更', alwaysOn: false },
  { name: 'reliability-reviewer', description: '审查故障恢复与可靠性', alwaysOn: false },
  { name: 'cli-readiness-reviewer', description: '审查 CLI 与代理调用体验', alwaysOn: false },
  { name: 'previous-comments-reviewer', description: '复查历史审查评论处理情况', alwaysOn: false },
  { name: 'kieran-typescript-reviewer', description: '按严格 TS 标准审查实现', alwaysOn: false },
  { name: 'adversarial-reviewer', description: '对抗式构造故障场景', alwaysOn: false },
]
