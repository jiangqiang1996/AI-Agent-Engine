import { AeAssetEntrySchema, type AeAssetEntry, AgentDefinitionSchema, type AgentDefinition } from '../schemas/ae-asset-schema.js'

const PHASE_ONE_ENTRIES = [
  {
    skillName: 'ae:brainstorm',
    skillSlug: 'ae-brainstorm',
    commandName: 'ae-brainstorm',
    description: '围绕需求进行头脑风暴并产出需求文档',
    argumentHint: '[需求描述|requirements 路径]',
    defaultEntry: false,
    commandFile: 'commands/ae-brainstorm.md',
    skillFile: 'skills/ae-brainstorm/SKILL.md',
  },
  {
    skillName: 'ae:document-review',
    skillSlug: 'ae-document-review',
    commandName: 'ae-review-doc',
    description: '对需求文档做多 reviewer 审查',
    argumentHint: '[mode:*] [文档路径]',
    defaultEntry: false,
    commandFile: 'commands/ae-review-doc.md',
    skillFile: 'skills/ae-document-review/SKILL.md',
  },
  {
    skillName: 'ae:plan',
    skillSlug: 'ae-plan',
    commandName: 'ae-plan',
    description: '基于需求或输入生成 AE 技术计划',
    argumentHint: '[plan 路径|requirements 路径|需求描述]',
    defaultEntry: false,
    commandFile: 'commands/ae-plan.md',
    skillFile: 'skills/ae-plan/SKILL.md',
  },
  {
    skillName: 'ae:plan-review',
    skillSlug: 'ae-plan-review',
    commandName: 'ae-review-plan',
    description: '对计划文档做多 reviewer 审查',
    argumentHint: '[mode:*] [计划路径]',
    defaultEntry: false,
    commandFile: 'commands/ae-review-plan.md',
    skillFile: 'skills/ae-plan-review/SKILL.md',
  },
  {
    skillName: 'ae:work',
    skillSlug: 'ae-work',
    commandName: 'ae-work',
    description: '按 living plan 执行工作并尽量委派给子代理',
    argumentHint: '[plan 路径|工作描述]',
    defaultEntry: false,
    commandFile: 'commands/ae-work.md',
    skillFile: 'skills/ae-work/SKILL.md',
  },
  {
    skillName: 'ae:review',
    skillSlug: 'ae-review',
    commandName: 'ae-review-code',
    description: '对代码改动做 CE 风格多 reviewer 审查',
    argumentHint: '[mode:*] [plan:<path>] [base:<ref>]',
    defaultEntry: false,
    commandFile: 'commands/ae-review-code.md',
    skillFile: 'skills/ae-review/SKILL.md',
  },
  {
    skillName: 'ae:lfg',
    skillSlug: 'ae-lfg',
    commandName: 'ae-lfg',
    description: '默认入口：从需求到执行驱动 AE 主链路',
    argumentHint: '[需求描述|已有产物路径]',
    defaultEntry: true,
    commandFile: 'commands/ae-lfg.md',
    skillFile: 'skills/ae-lfg/SKILL.md',
  },
  {
    skillName: 'ae:save-rules',
    skillSlug: 'ae-save-rules',
    commandName: 'ae-rules',
    description: '总结当前会话中有价值的项目规范并保存到 .opencode/rules/',
    argumentHint: '[规范类型]',
    defaultEntry: false,
    commandFile: 'commands/ae-rules.md',
    skillFile: '',
  },
  {
    skillName: 'ae:frontend-design',
    skillSlug: 'ae-frontend-design',
    commandName: 'ae-frontend-design',
    description: '构建具有设计品质的前端界面',
    argumentHint: '[描述|路径]',
    defaultEntry: false,
    commandFile: 'commands/ae-frontend-design.md',
    skillFile: 'skills/ae-frontend-design/SKILL.md',
  },
  {
    skillName: 'ae:setup',
    skillSlug: 'ae-setup',
    commandName: 'ae-setup',
    description: '诊断并安装 AE 前端设计所需的外部依赖',
    argumentHint: '',
    defaultEntry: false,
    commandFile: 'commands/ae-setup.md',
    skillFile: 'skills/ae-setup/SKILL.md',
  },
  {
    skillName: 'ae:test-browser',
    skillSlug: 'ae-test-browser',
    commandName: 'ae-test-browser',
    description: '使用 agent-browser 执行端到端浏览器测试',
    argumentHint: '[URL|路由]',
    defaultEntry: false,
    commandFile: 'commands/ae-test-browser.md',
    skillFile: 'skills/ae-test-browser/SKILL.md',
  },
] satisfies AeAssetEntry[]

const PHASE_ONE_REQUIRED_AGENTS = [
  ['coherence-reviewer', 'document-review', '审查文档内部一致性'],
  ['feasibility-reviewer', 'document-review', '审查文档或计划是否可落地'],
  ['product-lens-reviewer', 'document-review', '审查产品价值与用户视角'],
  ['scope-guardian-reviewer', 'document-review', '审查范围是否失控'],
  ['adversarial-document-reviewer', 'document-review', '对文档做对抗式压力测试'],
  ['design-lens-reviewer', 'document-review', '审查界面与交互设计约束'],
  ['security-lens-reviewer', 'document-review', '审查文档中的安全边界'],
  ['repo-research-analyst', 'research', '研究仓库结构与已有模式'],
  ['learnings-researcher', 'research', '提炼已有经验与文档知识'],
  ['framework-docs-researcher', 'research', '收集框架和官方文档'],
  ['best-practices-researcher', 'research', '收集社区最佳实践'],
  ['spec-flow-analyzer', 'workflow', '分析阶段流转和边界情况'],
  ['correctness-reviewer', 'review', '审查逻辑正确性'],
  ['testing-reviewer', 'review', '审查测试覆盖与测试质量'],
  ['maintainability-reviewer', 'review', '审查可维护性与抽象质量'],
  ['project-standards-reviewer', 'review', '审查是否符合项目规范'],
  ['agent-native-reviewer', 'review', '审查能力是否对 agent 友好'],
  ['security-reviewer', 'review', '审查安全问题'],
  ['performance-reviewer', 'review', '审查性能问题'],
  ['api-contract-reviewer', 'review', '审查接口契约变更'],
  ['reliability-reviewer', 'review', '审查失败恢复与可靠性'],
  ['adversarial-reviewer', 'review', '对代码改动做对抗式审查'],
  ['cli-readiness-reviewer', 'review', '审查 CLI 可用性与 agent 可用性'],
  ['previous-comments-reviewer', 'review', '结合历史审查评论复审'],
  ['kieran-typescript-reviewer', 'review', '按严格 TS 标准审查实现'],
] as const satisfies ReadonlyArray<readonly [string, 'document-review' | 'review' | 'research' | 'workflow', string]>

const GILDED_AGENTS = [
  ['architecture-strategist', 'review', '从架构一致性角度审视设计'],
  ['code-simplicity-reviewer', 'review', '审查是否还能更简单'],
  ['pattern-recognition-specialist', 'review', '识别模式与重复'],
  ['performance-oracle', 'review', '做更深入的性能分析'],
  ['security-sentinel', 'review', '做更深入的安全审计'],
  ['cli-agent-readiness-reviewer', 'review', '审查 CLI 对 agent 的优化程度'],
  ['session-historian', 'research', '回溯历史 session 经验'],
  ['git-history-analyzer', 'research', '分析 git 历史背景'],
  ['issue-intelligence-analyst', 'research', '分析 issue 模式与痛点'],
  ['web-researcher', 'research', '补充通用 Web 研究'],
  ['design-implementation-reviewer', 'review', '比对设计稿与实现'],
  ['design-iterator', 'workflow', '推动多轮设计迭代'],
  ['figma-design-sync', 'workflow', '同步 Figma 与实现'],
] as const satisfies ReadonlyArray<readonly [string, 'review' | 'research' | 'workflow', string]>

const DEFERRED_AGENTS = [
  ['pr-comment-resolver', 'workflow', '处理 PR 评论线程'],
  ['schema-drift-detector', 'review', '检查 schema 漂移'],
  ['data-migrations-reviewer', 'review', '审查数据迁移'],
  ['deployment-verification-agent', 'workflow', '输出部署验证清单'],
  ['data-integrity-guardian', 'review', '审查数据完整性'],
  ['data-migration-expert', 'review', '审查迁移细节'],
  ['dhh-rails-reviewer', 'review', 'Rails 风格审查'],
  ['kieran-rails-reviewer', 'review', 'Rails 严格审查'],
  ['kieran-python-reviewer', 'review', 'Python 严格审查'],
  ['julik-frontend-races-reviewer', 'review', '前端竞态问题审查'],
  ['ankane-readme-writer', 'research', 'README 专项生成支持'],
] as const satisfies ReadonlyArray<readonly [string, 'review' | 'research' | 'workflow', string]>

function toAgentDefinitions(
  entries: ReadonlyArray<readonly [string, 'document-review' | 'review' | 'research' | 'workflow', string]>,
  tier: 'required' | 'gilded' | 'deferred',
): AgentDefinition[] {
  return entries.map(([name, stage, description]) =>
    AgentDefinitionSchema.parse({
      name,
      stage,
      tier,
      description,
      path: `agents/${stage}/${name}.md`,
    }),
  )
}

export function getPhaseOneEntries(): AeAssetEntry[] {
  return PHASE_ONE_ENTRIES.map((entry) => AeAssetEntrySchema.parse(entry))
}

export function getDefaultEntry(): AeAssetEntry {
  return getPhaseOneEntries().find((entry) => entry.defaultEntry) ?? getPhaseOneEntries()[0]
}

export function getRequiredAgents(): AgentDefinition[] {
  return toAgentDefinitions(PHASE_ONE_REQUIRED_AGENTS, 'required')
}

export function getGildedAgents(): AgentDefinition[] {
  return toAgentDefinitions(GILDED_AGENTS, 'gilded')
}

export function getDeferredAgents(): AgentDefinition[] {
  return toAgentDefinitions(DEFERRED_AGENTS, 'deferred')
}

export function getAllAgentDefinitions(): AgentDefinition[] {
  return [...getRequiredAgents(), ...getGildedAgents(), ...getDeferredAgents()]
}
