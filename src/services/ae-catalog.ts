import {
  AeAssetEntrySchema,
  type AeAssetEntry,
  AgentDefinitionSchema,
  type AgentDefinition,
  SKILL,
  COMMAND,
  AGENT,
  skillDir,
  PO_SUFFIX,
  PA_SUFFIX,
  AUTO_SUFFIX,
  hasPromptOptimizeVariant,
} from '../schemas/ae-asset-schema.js'

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
    description: '面向文档的专项审查（通过 ae:review 统一技能执行），核心流程审查需求和计划文档，也支持审查任意文档',
    argumentHint: '[mode:*] [文档路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.DOCUMENT_REVIEW)}/SKILL.md`,
    customTemplate: `使用 \`${SKILL.REVIEW}\` 技能处理这次请求，指定 domain:document，并沿用参数：\`$ARGUMENTS\`。`,
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
    skillName: SKILL.REFACTOR,
    skillSlug: skillDir(SKILL.REFACTOR),
    commandName: COMMAND.REFACTOR,
    description: '重构专项计划入口：识别原计划的非技术需求后，以尽可能消除技术债务的方式调用 ae:plan',
    argumentHint: '[重构目标|计划路径|需求文档路径|代码异味描述]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.REFACTOR)}/SKILL.md`,
  },
  {
    skillName: SKILL.AGENT_CREATOR,
    skillSlug: skillDir(SKILL.AGENT_CREATOR),
    commandName: COMMAND.AGENT_CREATOR,
    description: '创建或更新 OpenCode 原生代理，默认项目级，支持显式全局级和可选同级命令',
    argumentHint: '[代理用途|代理名称] [--global] [--command]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.AGENT_CREATOR)}/SKILL.md`,
  },
  {
    skillName: SKILL.WORK,
    skillSlug: skillDir(SKILL.WORK),
    commandName: COMMAND.WORK,
    description: '按计划高效执行工作，保持质量并完成功能交付',
    argumentHint: '[计划路径|工作描述]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK)}/SKILL.md`,
  },
  {
    skillName: SKILL.WORK_REPORT,
    skillSlug: skillDir(SKILL.WORK_REPORT),
    commandName: COMMAND.WORK_REPORT,
    description: '基于 Git 提交与未提交变更生成日报、周报或指定时间段工作总结',
    argumentHint: '[日报|周报|时间段|提交范围]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK_REPORT)}/SKILL.md`,
  },
  {
    skillName: SKILL.MERGE_BRANCH,
    skillSlug: skillDir(SKILL.MERGE_BRANCH),
    commandName: COMMAND.MERGE_BRANCH,
    description: '将来源分支或本地 worktree 的变更合并到接收分支，并用来源分支的 AE 交接、需求和计划验证合并结果',
    argumentHint: '[来源分支名|本地 worktree 路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.MERGE_BRANCH)}/SKILL.md`,
  },
  {
    skillName: SKILL.REVIEW,
    skillSlug: skillDir(SKILL.REVIEW),
    commandName: COMMAND.REVIEW,
    description: '统一审查：支持代码域（Git 差异、全量扫描、会话变更等）和文档域的分层角色审查',
    argumentHint: '[mode:*] [domain:code|domain:document] [from:<ref>] [full] [full:<path>] [session] [plan:<path>] [文档路径]',
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
    skillName: SKILL.DOC_HUMANIZE,
    skillSlug: skillDir(SKILL.DOC_HUMANIZE),
    commandName: COMMAND.DOC_HUMANIZE,
    description: '将 AE 结构化产物转换为完全自包含的人读需求文档或详细设计文档',
    argumentHint: '[需求文档路径|计划文档路径|目录路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.DOC_HUMANIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.DOC_STRUCTURE,
    skillSlug: skillDir(SKILL.DOC_STRUCTURE),
    commandName: COMMAND.DOC_STRUCTURE,
    description: '将人读需求文档或详细设计文档转换为更利于 AI 识别的结构化文件',
    argumentHint: '[需求文档路径|详细设计文档路径]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.DOC_STRUCTURE)}/SKILL.md`,
  },
  {
    skillName: SKILL.SETUP,
    skillSlug: skillDir(SKILL.SETUP),
    commandName: COMMAND.SETUP,
    description: '诊断并安装 AE 浏览器能力所需的外部依赖',
    argumentHint: '',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SETUP)}/SKILL.md`,
  },
  {
    skillName: SKILL.TEST_BROWSER,
    skillSlug: skillDir(SKILL.TEST_BROWSER),
    commandName: COMMAND.TEST_BROWSER,
    description: `先完成 ${SKILL.SETUP}，再使用 agent-browser 执行浏览器端到端验收`,
    argumentHint: '[URL|路由]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.TEST_BROWSER)}/SKILL.md`,
    customTemplate: [
      `先使用 \`${SKILL.SETUP}\` 技能完成 agent-browser 环境检查；`,
      '未完成 setup 前不得执行任何 agent-browser 命令。',
      `环境就绪后，再使用 \`${SKILL.TEST_BROWSER}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
    ].join(''),
  },
  {
    skillName: SKILL.FRONTEND_DESIGN,
    skillSlug: skillDir(SKILL.FRONTEND_DESIGN),
    commandName: COMMAND.FRONTEND_DESIGN,
    description: '构建设计质量更高的前端初版界面，并做一轮视觉验证',
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
    skillName: SKILL.SWAGGER_PARSER,
    skillSlug: skillDir(SKILL.SWAGGER_PARSER),
    commandName: COMMAND.SWAGGER_PARSER,
    description: '解析 Swagger/OpenAPI JSON/YAML 并输出接口联调摘要',
    argumentHint: '[source] [method:<HTTP_METHOD>] [path:<PATH>] [tag:<TAG>] [keyword:<TEXT>] [mode:overview|detail]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SWAGGER_PARSER)}/SKILL.md`,
  },
  {
    skillName: SKILL.GRAPH_BUILD,
    skillSlug: skillDir(SKILL.GRAPH_BUILD),
    commandName: COMMAND.GRAPH_BUILD,
    description: '构建或增量维护项目文件关系图谱',
    argumentHint: '[target:<PATH>] [mode:auto|full|incremental] [depth:shallow] [exclude:<PATH>...]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_BUILD)}/SKILL.md`,
  },
  {
    skillName: SKILL.GRAPH_QUERY,
    skillSlug: skillDir(SKILL.GRAPH_QUERY),
    commandName: COMMAND.GRAPH_QUERY,
    description: '查询项目文件关系图谱中的依赖、影响范围和健康状态',
    argumentHint: '[mode:deps|impact|health|filter|path|core|stats|pattern] [file:<PATH>] [target:<PATH>]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_QUERY)}/SKILL.md`,
  },
  {
    skillName: SKILL.SAVE_EXPERIENCE,
    skillSlug: skillDir(SKILL.SAVE_EXPERIENCE),
    commandName: COMMAND.SAVE_EXPERIENCE,
    description: '统一经验沉淀入口：先保存 solution，再按需提炼 rules',
    argumentHint: '[经验摘要|保存目标]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SAVE_EXPERIENCE)}/SKILL.md`,
  },
  {
    skillName: SKILL.SKILL_FROM_SESSION,
    skillSlug: skillDir(SKILL.SKILL_FROM_SESSION),
    commandName: COMMAND.SKILL_FROM_SESSION,
    description: '从当前会话创建或更新 OpenCode 原生技能',
    argumentHint: '[目标技能名|流程关注点|资产名|纠偏摘要] [--global] [--no-command]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SKILL_FROM_SESSION)}/SKILL.md`,
  },
  {
    skillName: SKILL.SKILL_CREATOR,
    skillSlug: skillDir(SKILL.SKILL_CREATOR),
    commandName: COMMAND.SKILL_CREATOR,
    description: '创建或更新 OpenCode 原生技能和命令，支持只创建技能、只创建命令或同时创建',
    argumentHint: '<技能名或需求描述> [--global] [--no-command|--command-only]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.SKILL_CREATOR)}/SKILL.md`,
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
    argumentHint: '[project]',
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.UPDATE)}/SKILL.md`,
  },
] satisfies AeAssetEntry[]

const PHASE_ONE_PO_ENTRIES: AeAssetEntry[] = PHASE_ONE_ENTRIES
  .filter((e) => hasPromptOptimizeVariant(e.skillName))
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
  .filter((e) => hasPromptOptimizeVariant(e.skillName))
  .map((e) => ({
    skillName: SKILL.PROMPT_OPTIMIZE,
    skillSlug: skillDir(SKILL.PROMPT_OPTIMIZE),
    commandName: `${e.commandName}${PA_SUFFIX}`,
    description: `先优化提示词（auto 模式），再用 ${e.description}`,
    argumentHint: e.argumentHint,
    defaultEntry: false,
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  } satisfies AeAssetEntry))

const REQUIRED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]> = [
  [AGENT.COHERENCE_REVIEWER, 'review', '审查文档的内部一致性'],
  [AGENT.FEASIBILITY_REVIEWER, 'review', '评估文档中提出的技术方法能否经受现实考验'],
  [AGENT.PRODUCT_LENS_REVIEWER, 'review', '以高级产品负责人的视角审查文档，质疑前提和范围对齐'],
  [AGENT.ADVERSARIAL_REVIEWER, 'review', '跨域对抗式审查：代码域构造故障场景，文档域质疑前提假设'],
  [AGENT.DESIGN_LENS_REVIEWER, 'review', '审查文档中缺失的设计决策'],
  [AGENT.SECURITY_REVIEWER, 'review', '跨域安全审查：代码域漏洞审计，文档域安全缺口评估'],
  [AGENT.STEP_GRANULARITY_REVIEWER, 'review', '审查计划步骤粒度与批量操作可脚本化'],
  [AGENT.TEST_CASE_REVIEWER, 'review', '审查测试用例文档的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度'],
  [AGENT.DOC_EQUIVALENCE_REVIEWER, 'review', '审查文档转换前后是否语义等价、结构兼容且未镀金'],
  [AGENT.REPO_RESEARCH_ANALYST, 'research', '研究仓库结构与已有模式'],
  [AGENT.RESEARCH_REVIEWER, 'review', '提炼已有经验、搜索最佳实践与框架文档'],
  [AGENT.WEB_RESEARCHER, 'research', '搜索并总结网络信息'],
  [AGENT.SPEC_FLOW_ANALYZER, 'workflow', '分析阶段流转和边界情况'],
  [AGENT.CORRECTNESS_REVIEWER, 'review', '审查逻辑正确性与边界条件'],
  [AGENT.TESTING_REVIEWER, 'review', '审查测试覆盖与断言质量'],
  [AGENT.STANDARDS_REVIEWER, 'review', '审查是否遵守项目规范（含配置文件审查）'],
  [AGENT.AGENT_NATIVE_REVIEWER, 'review', '审查代理操作友好性与 CLI 就绪度'],
  [AGENT.API_CONTRACT_REVIEWER, 'review', '审查接口契约破坏性变更'],
  [AGENT.RELIABILITY_REVIEWER, 'review', '审查故障恢复与可靠性（含基础设施审查）'],
  [AGENT.MAINTAINABILITY_REVIEWER, 'review', '审查可维护性与抽象合理性（含脚本审查）'],
  [AGENT.PERFORMANCE_REVIEWER, 'review', '审查算法复杂度、缓存策略及前端渲染性能'],
  [AGENT.ARCHITECTURE_STRATEGIST, 'review', '从架构视角分析代码变更，检查模式合规性和设计完整性'],
  [AGENT.PATTERN_RECOGNITION_SPECIALIST, 'review', '分析代码中的设计模式、反模式、命名规范和重复代码'],
  [AGENT.DATA_MIGRATIONS_REVIEWER, 'review', '审查数据迁移方案与执行细节（含数据库审查）'],
  [AGENT.PREVIOUS_COMMENTS_REVIEWER, 'review', '复查历史审查评论处理情况'],
]

const GILDED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]> = [
  [AGENT.DESIGN_ITERATOR, 'workflow', '对已实现 UI 做多轮小步审美打磨'],
  [AGENT.FIGMA_DESIGN_SYNC, 'workflow', '以 Figma 为准同步设计稿与代码实现'],
]

function buildAgentList(
  tuples: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]>,
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
