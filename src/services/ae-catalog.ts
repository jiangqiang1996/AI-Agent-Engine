import { AeAssetEntrySchema, type AeAssetEntry, AgentDefinitionSchema, type AgentDefinition } from '../schemas/ae-asset-schema.js'

const PHASE_ONE_ENTRIES = [
  {
    skillName: 'ae:brainstorm',
    skillSlug: 'ae-brainstorm',
    commandName: 'ae-brainstorm',
    description: '围绕需求进行头脑风暴并产出需求文档',
    argumentHint: '[需求描述|需求文档路径]',
    defaultEntry: false,
    skillFile: 'skills/ae-brainstorm/SKILL.md',
  },
  {
    skillName: 'ae:document-review',
    skillSlug: 'ae-document-review',
    commandName: 'ae-review-doc',
    description: '对需求文档进行多角色审查',
    argumentHint: '[mode:*] [文档路径]',
    defaultEntry: false,
    skillFile: 'skills/ae-document-review/SKILL.md',
  },
  {
    skillName: 'ae:plan',
    skillSlug: 'ae-plan',
    commandName: 'ae-plan',
    description: '基于需求或输入生成 AE 技术计划',
    argumentHint: '[计划路径|需求文档路径|需求描述]',
    defaultEntry: false,
    skillFile: 'skills/ae-plan/SKILL.md',
  },
  {
    skillName: 'ae:plan-review',
    skillSlug: 'ae-plan-review',
    commandName: 'ae-review-plan',
    description: '对计划文档进行多角色审查',
    argumentHint: '[mode:*] [计划路径]',
    defaultEntry: false,
    skillFile: 'skills/ae-plan-review/SKILL.md',
  },
  {
    skillName: 'ae:work',
    skillSlug: 'ae-work',
    commandName: 'ae-work',
    description: '按演进式计划执行工作并尽量委派给子代理',
    argumentHint: '[计划路径|工作描述]',
    defaultEntry: false,
    skillFile: 'skills/ae-work/SKILL.md',
  },
  {
    skillName: 'ae:review',
    skillSlug: 'ae-review',
    commandName: 'ae-review-code',
    description: '使用分层角色代理和置信度门控对代码改动进行结构化审查',
    argumentHint: '[mode:*] [plan:<path>] [base:<ref>]',
    defaultEntry: false,
    skillFile: 'skills/ae-review/SKILL.md',
  },
  {
    skillName: 'ae:lfg',
    skillSlug: 'ae-lfg',
    commandName: 'ae-lfg',
    description: '默认入口：从需求到执行驱动 AE 主流程',
    argumentHint: '[需求描述|已有产物路径]',
    defaultEntry: true,
    skillFile: 'skills/ae-lfg/SKILL.md',
  },
  {
    skillName: 'ae:save-rules',
    skillSlug: 'ae-save-rules',
    commandName: 'ae-save-rules',
    description: '总结当前会话中有价值的项目规范并保存到 .opencode/rules/',
    argumentHint: '[规范类型]',
    defaultEntry: false,
    skillFile: 'skills/ae-save-rules/SKILL.md',
  },
  {
    skillName: 'ae:frontend-design',
    skillSlug: 'ae-frontend-design',
    commandName: 'ae-frontend-design',
    description: '构建具有设计品质的前端界面',
    argumentHint: '[描述|路径]',
    defaultEntry: false,
    skillFile: 'skills/ae-frontend-design/SKILL.md',
  },
  {
    skillName: 'ae:setup',
    skillSlug: 'ae-setup',
    commandName: 'ae-setup',
    description: '诊断并安装 AE 前端设计所需的外部依赖',
    argumentHint: '',
    defaultEntry: false,
    skillFile: 'skills/ae-setup/SKILL.md',
  },
  {
    skillName: 'ae:test-browser',
    skillSlug: 'ae-test-browser',
    commandName: 'ae-test-browser',
    description: '使用 agent-browser 执行端到端浏览器测试',
    argumentHint: '[URL|路由]',
    defaultEntry: false,
    skillFile: 'skills/ae-test-browser/SKILL.md',
  },
  {
    skillName: 'ae:sql',
    skillSlug: 'ae-sql',
    commandName: 'ae-sql',
    description: '通过 JDBC 连接任意数据库并执行 SQL',
    argumentHint: '[SQL 语句]',
    defaultEntry: false,
    skillFile: 'skills/ae-sql/SKILL.md',
  },
  {
    skillName: 'ae:task-loop',
    skillSlug: 'ae-task-loop',
    commandName: 'ae-task-loop',
    description: '循环执行任务并自动验证，直到达成目标后退出',
    argumentHint: '[一句话目标描述]',
    defaultEntry: false,
    skillFile: 'skills/ae-task-loop/SKILL.md',
  },
  {
    skillName: 'ae:update',
    skillSlug: 'ae-update',
    commandName: 'ae-update',
    description: '拉取 AE 插件最新代码并重新构建，完成本地更新',
    argumentHint: '[安装路径]',
    defaultEntry: false,
    skillFile: 'skills/ae-update/SKILL.md',
  },
  {
    skillName: 'ae:help',
    skillSlug: 'ae-help',
    commandName: 'ae-help',
    description: '列出 AE 插件中所有可调用的技能和代理的帮助信息',
    argumentHint: '[技能名或关键词]',
    defaultEntry: false,
    skillFile: 'skills/ae-help/SKILL.md',
  },
  {
    skillName: 'ae:handoff',
    skillSlug: 'ae-handoff',
    commandName: 'ae-handoff',
    description: '会话交接：提取当前会话核心结论，创建独立新会话并注入上下文',
    argumentHint: '',
    defaultEntry: false,
    skillFile: 'skills/ae-handoff/SKILL.md',
  },
] satisfies AeAssetEntry[]

const PHASE_ONE_REQUIRED_AGENTS = [
  ['coherence-reviewer', 'document-review', '审查文档内部一致性'],
  ['feasibility-reviewer', 'document-review', '评估方案落地可行性'],
  ['product-lens-reviewer', 'document-review', '从产品价值与用户视角审查'],
  ['scope-guardian-reviewer', 'document-review', '审查范围是否蔓延'],
  ['adversarial-document-reviewer', 'document-review', '对文档做对抗式压力测试'],
  ['design-lens-reviewer', 'document-review', '审查界面与交互设计约束'],
  ['security-lens-reviewer', 'document-review', '审查文档中的安全边界'],
  ['repo-research-analyst', 'research', '研究仓库结构与已有模式'],
  ['learnings-researcher', 'research', '提炼已有经验与文档知识'],
  ['framework-docs-researcher', 'research', '收集框架和官方文档'],
  ['best-practices-researcher', 'research', '收集社区最佳实践'],
  ['web-researcher', 'research', '搜索并总结网络信息'],
  ['spec-flow-analyzer', 'workflow', '分析阶段流转和边界情况'],
  ['correctness-reviewer', 'review', '审查逻辑正确性与边界条件'],
  ['testing-reviewer', 'review', '审查测试覆盖与断言质量'],
  ['maintainability-reviewer', 'review', '审查可维护性与抽象合理性'],
  ['project-standards-reviewer', 'review', '审查是否遵守项目规范'],
  ['agent-native-reviewer', 'review', '审查代理操作友好性'],
  ['security-reviewer', 'review', '审查安全漏洞'],
  ['performance-reviewer', 'review', '审查性能瓶颈'],
  ['api-contract-reviewer', 'review', '审查接口契约破坏性变更'],
  ['reliability-reviewer', 'review', '审查故障恢复与可靠性'],
  ['adversarial-reviewer', 'review', '对抗式构造故障场景'],
  ['cli-readiness-reviewer', 'review', '审查 CLI 与代理调用体验'],
  ['previous-comments-reviewer', 'review', '复查历史审查评论处理情况'],
  ['kieran-typescript-reviewer', 'review', '按严格 TS 标准审查实现'],
] as const satisfies ReadonlyArray<readonly [string, 'document-review' | 'review' | 'research' | 'workflow', string]>

const GILDED_AGENTS = [
  ['architecture-strategist', 'review', '从架构一致性角度审视设计'],
  ['pattern-recognition-specialist', 'review', '识别设计模式与重复代码'],
  ['performance-oracle', 'review', '深入分析性能瓶颈'],
  ['security-sentinel', 'review', '深入执行安全审计'],
  ['cli-agent-readiness-reviewer', 'review', '评估 CLI 对代理的友好程度'],
  ['session-historian', 'research', '回溯历史会话经验'],
  ['git-history-analyzer', 'research', '分析 git 历史背景'],
  ['design-implementation-reviewer', 'review', '比对设计稿与实现'],
  ['design-iterator', 'workflow', '推动多轮设计迭代'],
  ['figma-design-sync', 'workflow', '同步 Figma 与实现'],
] as const satisfies ReadonlyArray<readonly [string, 'review' | 'research' | 'workflow', string]>

const DEFERRED_AGENTS = [
  ['schema-drift-detector', 'review', '检查 schema 漂移'],
  ['data-migrations-reviewer', 'review', '审查数据迁移'],
  ['deployment-verification-agent', 'workflow', '输出部署验证清单'],
  ['data-integrity-guardian', 'review', '审查数据完整性'],
  ['data-migration-expert', 'review', '审查迁移细节'],
  ['kieran-python-reviewer', 'review', 'Python 严格审查'],
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
