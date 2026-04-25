import { AeAssetEntrySchema, type AeAssetEntry, AgentDefinitionSchema, type AgentDefinition, SKILL, COMMAND, AGENT, skillDir, PO_SUFFIX, PA_SUFFIX, AUTO_SUFFIX } from '../schemas/ae-asset-schema.js'

const PHASE_ONE_ENTRIES = [
  {
    skillName: SKILL.IDEATE,
    skillSlug: skillDir(SKILL.IDEATE),
    commandName: COMMAND.IDEATE,
    description: '生成并批判性评估关于某个主题的落地想法',
    argumentHint: '[功能、关注领域或约束]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.IDEATE)}/SKILL.md`,
  },
  {
    skillName: SKILL.BRAINSTORM,
    skillSlug: skillDir(SKILL.BRAINSTORM),
    commandName: COMMAND.BRAINSTORM,
    description: '围绕需求进行头脑风暴并产出需求文档',
    argumentHint: '[需求描述|需求文档路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.BRAINSTORM)}/SKILL.md`,
  },
  {
    skillName: SKILL.DOCUMENT_REVIEW,
    skillSlug: skillDir(SKILL.DOCUMENT_REVIEW),
    commandName: COMMAND.DOCUMENT_REVIEW,
    description: '面向文档的专项审查，对需求文档、计划文档等任意文档进行多角色审查',
    argumentHint: '[mode:*] [文档路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.DOCUMENT_REVIEW)}/SKILL.md`,
  },
  {
    skillName: SKILL.PLAN,
    skillSlug: skillDir(SKILL.PLAN),
    commandName: COMMAND.PLAN,
    description: '基于需求或输入生成 AE 技术计划',
    argumentHint: '[计划路径|需求文档路径|需求描述]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PLAN)}/SKILL.md`,
  },
  {
    skillName: SKILL.WORK,
    skillSlug: skillDir(SKILL.WORK),
    commandName: COMMAND.WORK,
    description: '按演进式计划执行工作并尽量委派给子代理',
    argumentHint: '[计划路径|工作描述]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK)}/SKILL.md`,
  },
  {
    skillName: SKILL.REVIEW,
    skillSlug: skillDir(SKILL.REVIEW),
    commandName: COMMAND.REVIEW,
    description: '全能审查：支持 Git 差异、全量扫描、指定路径、会话变更等多种范围确定方式，对代码和配置进行分层角色审查',
    argumentHint: '[mode:*] [from:<ref>] [full] [full:<path>] [session] [plan:<path>]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.REVIEW)}/SKILL.md`,
  },
  {
    skillName: SKILL.LFG,
    skillSlug: skillDir(SKILL.LFG),
    commandName: COMMAND.LFG,
    description: '默认入口：从需求到执行驱动 AE 主流程',
    argumentHint: '[需求描述|已有产物路径]',
    defaultEntry: true,
    skillFile: `src/assets/skills/${skillDir(SKILL.LFG)}/SKILL.md`,
  },
  {
    skillName: SKILL.SETUP,
    skillSlug: skillDir(SKILL.SETUP),
    commandName: COMMAND.SETUP,
    description: '诊断并安装 AE 前端设计所需的外部依赖',
    argumentHint: '',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SETUP)}/SKILL.md`,
  },
  {
    skillName: SKILL.TEST_BROWSER,
    skillSlug: skillDir(SKILL.TEST_BROWSER),
    commandName: COMMAND.TEST_BROWSER,
    description: '使用 agent-browser 执行端到端浏览器测试',
    argumentHint: '[URL|路由]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.TEST_BROWSER)}/SKILL.md`,
  },
  {
    skillName: SKILL.FRONTEND_DESIGN,
    skillSlug: skillDir(SKILL.FRONTEND_DESIGN),
    commandName: COMMAND.FRONTEND_DESIGN,
    description: '构建具有设计品质的前端界面',
    argumentHint: '[描述|路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.FRONTEND_DESIGN)}/SKILL.md`,
  },
  {
    skillName: SKILL.HANDOFF,
    skillSlug: skillDir(SKILL.HANDOFF),
    commandName: COMMAND.HANDOFF,
    description: '会话交接：提取当前会话核心结论，创建独立新会话并注入上下文',
    argumentHint: '',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.HANDOFF)}/SKILL.md`,
  },
  {
    skillName: SKILL.PROMPT_OPTIMIZE,
    skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE),
    commandName: COMMAND.PROMPT_OPTIMIZE,
    description: '提示词优化：将用户随意输入优化为结构化 AI 对话提示词，确认后在新会话中自动执行',
    argumentHint: '[auto] [提示词内容]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.PROMPT_OPTIMIZE,
    skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE),
    commandName: `${COMMAND.PROMPT_OPTIMIZE}${AUTO_SUFFIX}`,
    description: '提示词优化（auto 模式）：优化后跳过确认直接在新会话中执行',
    argumentHint: '[提示词内容]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.TASK_LOOP,
    skillSlug: skillDir(SKILL.TASK_LOOP),
    commandName: COMMAND.TASK_LOOP,
    description: '循环执行任务并自动验证，直到达成目标后退出',
    argumentHint: '[一句话目标描述]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.TASK_LOOP)}/SKILL.md`,
  },
  {
    skillName: SKILL.SQL,
    skillSlug: skillDir(SKILL.SQL),
    commandName: COMMAND.SQL,
    description: '通过 JDBC 连接任意数据库并执行 SQL',
    argumentHint: '[SQL 语句]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SQL)}/SKILL.md`,
  },
  {
    skillName: SKILL.SAVE_RULES,
    skillSlug: skillDir(SKILL.SAVE_RULES),
    commandName: COMMAND.SAVE_RULES,
    description: '总结当前会话中有价值的项目规范并保存到 .opencode/rules/',
    argumentHint: '[规范类型]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SAVE_RULES)}/SKILL.md`,
  },
  {
    skillName: SKILL.HELP,
    skillSlug: skillDir(SKILL.HELP),
    commandName: COMMAND.HELP,
    description: '列出 AE 插件中所有可调用的技能、命令和代理的帮助信息',
    argumentHint: '[技能名或关键词]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.HELP)}/SKILL.md`,
  },
  {
    skillName: SKILL.UPDATE,
    skillSlug: skillDir(SKILL.UPDATE),
    commandName: COMMAND.UPDATE,
    description: '拉取 AE 插件最新代码并重新构建，完成本地更新',
    argumentHint: '[安装路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.UPDATE)}/SKILL.md`,
  },
] satisfies AeAssetEntry[]

const PHASE_ONE_PO_ENTRIES: AeAssetEntry[] = PHASE_ONE_ENTRIES
  .filter((e) => e.skillName !== SKILL.PROMPT_OPTIMIZE)
  .map((e) => ({
    skillName: SKILL.PROMPT_OPTIMIZE,
    skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE),
    commandName: `${e.commandName}${PO_SUFFIX}`,
    description: `先优化提示词，再用 ${e.description}`,
    argumentHint: e.argumentHint,
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  } satisfies AeAssetEntry))

const PHASE_ONE_PA_ENTRIES: AeAssetEntry[] = PHASE_ONE_ENTRIES
  .filter((e) => e.skillName !== SKILL.PROMPT_OPTIMIZE)
  .map((e) => ({
    skillName: SKILL.PROMPT_OPTIMIZE,
    skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE),
    commandName: `${e.commandName}${PA_SUFFIX}`,
    description: `先优化提示词（auto 模式），再用 ${e.description}`,
    argumentHint: e.argumentHint,
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  } satisfies AeAssetEntry))

type AgentStage = 'document-review' | 'review' | 'research' | 'workflow'

const REQUIRED_AGENTS: ReadonlyArray<readonly [string, AgentStage, string]> = [
  [AGENT.COHERENCE_REVIEWER, 'document-review', '审查文档内部一致性'],
  [AGENT.FEASIBILITY_REVIEWER, 'document-review', '评估方案落地可行性'],
  [AGENT.PRODUCT_LENS_REVIEWER, 'document-review', '从产品价值与用户视角审查'],
  [AGENT.SCOPE_GUARDIAN_REVIEWER, 'document-review', '审查范围是否蔓延'],
  [AGENT.ADVERSARIAL_DOCUMENT_REVIEWER, 'document-review', '对文档做对抗式压力测试'],
  [AGENT.DESIGN_LENS_REVIEWER, 'document-review', '审查界面与交互设计约束'],
  [AGENT.SECURITY_LENS_REVIEWER, 'document-review', '审查文档中的安全边界'],
  [AGENT.STEP_GRANULARITY_REVIEWER, 'document-review', '审查计划步骤是否拆解至最小不可再分单元'],
  [AGENT.BATCH_OPERATION_REVIEWER, 'document-review', '审查多文件操作是否可脚本化批量执行'],
  [AGENT.TEST_CASE_REVIEWER, 'document-review', '审查测试用例文档的可测性、完备性、步骤可执行性和与需求对齐程度'],
  [AGENT.REPO_RESEARCH_ANALYST, 'research', '研究仓库结构与已有模式'],
  [AGENT.LEARNINGS_RESEARCHER, 'research', '提炼已有经验与文档知识'],
  [AGENT.BEST_PRACTICES_RESEARCHER, 'research', '收集社区最佳实践与框架文档'],
  [AGENT.WEB_RESEARCHER, 'research', '搜索并总结网络信息'],
  [AGENT.FRAMEWORK_DOCS_RESEARCHER, 'research', '收集框架、库或依赖的完整文档和最佳实践'],
  [AGENT.SPEC_FLOW_ANALYZER, 'workflow', '分析阶段流转和边界情况'],
  [AGENT.CORRECTNESS_REVIEWER, 'review', '审查逻辑正确性与边界条件'],
  [AGENT.TESTING_REVIEWER, 'review', '审查测试覆盖与断言质量'],
  [AGENT.PROJECT_STANDARDS_REVIEWER, 'review', '审查是否遵守项目规范'],
  [AGENT.AGENT_NATIVE_REVIEWER, 'review', '审查代理操作友好性'],
  [AGENT.API_CONTRACT_REVIEWER, 'review', '审查接口契约破坏性变更'],
  [AGENT.RELIABILITY_REVIEWER, 'review', '审查故障恢复与可靠性'],
  [AGENT.ADVERSARIAL_REVIEWER, 'review', '对抗式构造故障场景'],
  [AGENT.MAINTAINABILITY_REVIEWER, 'review', '审查可维护性与抽象合理性及设计模式识别'],
  [AGENT.SECURITY_REVIEWER, 'review', '基于 OWASP 标准执行安全漏洞审计'],
  [AGENT.PERFORMANCE_REVIEWER, 'review', '审查算法复杂度、缓存策略及前端渲染性能'],
  [AGENT.ARCHITECTURE_STRATEGIST, 'review', '从架构视角分析代码变更，检查模式合规性和设计完整性'],
  [AGENT.PATTERN_RECOGNITION_SPECIALIST, 'review', '分析代码中的设计模式、反模式、命名规范和重复代码'],
  [AGENT.DATA_MIGRATIONS_REVIEWER, 'review', '审查数据迁移方案与执行细节'],
  [AGENT.KIERAN_TYPESCRIPT_REVIEWER, 'review', '按严格 TS 标准审查实现'],
  [AGENT.PREVIOUS_COMMENTS_REVIEWER, 'review', '复查历史审查评论处理情况'],
]

const GILDED_AGENTS: ReadonlyArray<readonly [string, AgentStage, string]> = [
  [AGENT.CLI_AGENT_READINESS_REVIEWER, 'review', '评估 CLI 对代理的友好程度'],
  [AGENT.DESIGN_ITERATOR, 'workflow', '推动多轮设计迭代'],
  [AGENT.FIGMA_DESIGN_SYNC, 'workflow', '同步 Figma 设计稿与代码实现'],
]

function buildAgentList(
  tuples: ReadonlyArray<readonly [string, AgentStage, string]>,
  tier: 'required' | 'gilded',
): AgentDefinition[] {
  return tuples.map(([name, stage, desc]) =>
    AgentDefinitionSchema.parse({ name, stage, tier, description: desc, path: `src/assets/agents/${stage}/${name}.md` }),
  )
}

export function getPhaseOneEntries(): AeAssetEntry[] {
  return PHASE_ONE_ENTRIES.map((e) => AeAssetEntrySchema.parse(e))
}

export function getPhaseOnePoEntries(): AeAssetEntry[] {
  return PHASE_ONE_PO_ENTRIES.map((e) => AeAssetEntrySchema.parse(e))
}

export function getPhaseOnePaEntries(): AeAssetEntry[] {
  return PHASE_ONE_PA_ENTRIES.map((e) => AeAssetEntrySchema.parse(e))
}

export function getDefaultEntry(): AeAssetEntry {
  return getPhaseOneEntries().find((e) => e.defaultEntry) ?? getPhaseOneEntries()[0]
}

export function getRequiredAgents(): AgentDefinition[] {
  return buildAgentList(REQUIRED_AGENTS, 'required')
}

export function getGildedAgents(): AgentDefinition[] {
  return buildAgentList(GILDED_AGENTS, 'gilded')
}

export function getAllAgentDefinitions(): AgentDefinition[] {
  return [...getRequiredAgents(), ...getGildedAgents()]
}
