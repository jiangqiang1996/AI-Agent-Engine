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
import { getLifecycleCatalogDescription } from './lifecycle-contract.js'

const PHASE_ONE_ENTRIES: AeAssetEntry[] = [
  {
    skillName: SKILL.IDEATE,
    commandName: COMMAND.IDEATE,
    description: getLifecycleCatalogDescription('ideate'),
    argumentHint: '[主题、机会、约束或痛点]',
    skillFile: `src/assets/skills/${skillDir(SKILL.IDEATE)}/SKILL.md`,
  },
  {
    skillName: SKILL.BRAINSTORM,
    commandName: COMMAND.BRAINSTORM,
    description: '头脑风暴：使用多个子代理从不同视角进行多轮讨论，汇总讨论结果',
    argumentHint: '[讨论主题]',
    skillFile: `src/assets/skills/${skillDir(SKILL.BRAINSTORM)}/SKILL.md`,
  },
  {
    skillName: SKILL.PRD,
    commandName: COMMAND.PRD,
    description: getLifecycleCatalogDescription('prd'),
    argumentHint: '[目标描述|需求文档路径|构思结果]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PRD)}/SKILL.md`,
  },
  {
    skillName: SKILL.DESIGN,
    commandName: COMMAND.DESIGN,
    description: getLifecycleCatalogDescription('design'),
    argumentHint: '[需求文档路径|旧 design|裸描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.DESIGN)}/SKILL.md`,
  },
  {
    skillName: SKILL.DOCUMENT_REVIEW,
    commandName: COMMAND.DOCUMENT_REVIEW,
    description: '面向文档的专项审查（通过 ae:review 统一技能执行），核心流程审查需求和计划文档，也支持审查任意文档',
    argumentHint: '[mode] [文档路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.DOCUMENT_REVIEW)}/SKILL.md`,
    customTemplate: `使用 \`${SKILL.REVIEW}\` 技能处理这次请求，指定 domain=document，并沿用参数：\`$ARGUMENTS\`。`,
  },
  {
    skillName: SKILL.PLAN,
    commandName: COMMAND.PLAN,
    description: getLifecycleCatalogDescription('plan'),
    argumentHint: '[计划路径|需求文档路径|目标描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PLAN)}/SKILL.md`,
  },
  {
    skillName: SKILL.REFACTOR,
    commandName: COMMAND.REFACTOR,
    description: getLifecycleCatalogDescription('refactor-plan'),
    argumentHint: '[重构目标|计划路径|需求文档路径|旧机制描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.REFACTOR)}/SKILL.md`,
  },
  {
    skillName: SKILL.AGENT_CREATOR,
    commandName: COMMAND.AGENT_CREATOR,
    description: '创建或更新 OpenCode 原生代理，默认项目级，支持显式全局级和可选同级命令',
    argumentHint: '[代理用途|代理名称] [--global] [--command]',
    skillFile: `src/assets/skills/${skillDir(SKILL.AGENT_CREATOR)}/SKILL.md`,
  },
  {
    skillName: SKILL.WORK,
    commandName: COMMAND.WORK,
    description: getLifecycleCatalogDescription('work'),
    argumentHint: '[计划路径|交接文件路径|任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK)}/SKILL.md`,
  },
  {
    skillName: SKILL.WORK_REPORT,
    commandName: COMMAND.WORK_REPORT,
    description: '基于 Git 提交与未提交变更生成日报、周报或指定时间段工作总结',
    argumentHint: '[日报|周报|时间段|提交范围]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK_REPORT)}/SKILL.md`,
  },
  {
    skillName: SKILL.MY_CODE_CHANGES,
    commandName: COMMAND.MY_CODE_CHANGES,
    description: '获取指定时间内本人提交的所有代码变更（含本机未提交的），只取最终状态，不输出中间过程',
    argumentHint: 'since=<date> [until=<date>]',
    skillFile: `src/assets/skills/${skillDir(SKILL.MY_CODE_CHANGES)}/SKILL.md`,
  },
  {
    skillName: SKILL.MERGE_BRANCH,
    commandName: COMMAND.MERGE_BRANCH,
    description: '将来源分支或本地 worktree 的变更合并到接收分支，并用来源分支的 AE 交接、需求和计划验证合并结果',
    argumentHint: '[来源分支名|本地 worktree 路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.MERGE_BRANCH)}/SKILL.md`,
  },
  {
    skillName: SKILL.REVIEW,
    commandName: COMMAND.REVIEW,
    description: `${getLifecycleCatalogDescription('outcome-review')}；通用审查入口，默认自动识别审查场景，支持代码、需求、设计、原型、计划、配置、技能、命令、测试用例等单一或混合范围`,
    argumentHint: '[mode] [domain] [scenes=<list>] [targets=<list>] [from=<ref>] [full] [full=<path>] [session] [plan=<path>] [goals=<text>] [路径...]',
    skillFile: `src/assets/skills/${skillDir(SKILL.REVIEW)}/SKILL.md`,
  },
  {
    skillName: SKILL.LFG,
    commandName: COMMAND.LFG,
    description: '自包含一站式管道技能：内联澄清需求、设计、实施，仅调用 ae:review 审查；一次澄清后静默执行到底；同时支持软件和非软件任务',
    argumentHint: '[task] [--compatible=true|false]',
    skillFile: `src/assets/skills/${skillDir(SKILL.LFG)}/SKILL.md`,
  },
  {
    skillName: SKILL.CHROME_DEVTOOLS,
    commandName: COMMAND.CHROME_DEVTOOLS,
    description: 'chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。',
    argumentHint: '[url] [action] [mode] [browser] [port] [task=任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.CHROME_DEVTOOLS)}/SKILL.md`,
  },
  {
    skillName: SKILL.WEB_FORGE,
    commandName: COMMAND.WEB_FORGE,
    description: `统一前端能力入口：自由设计、设计还原、交互逻辑与浏览器验收。需先完成 ${SKILL.CHROME_DEVTOOLS} MCP 注册，再通过子代理 @ui-architect、@ui-matcher、@logic-weaver、@browser-inspector 交错执行`,
    argumentHint: '[描述|Figma URL|截图路径|页面路由] [--design|--match|--logic|--inspect]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WEB_FORGE)}/SKILL.md`,
    customTemplate: [
      `先使用 \`${SKILL.CHROME_DEVTOOLS} action=register mode=autoConnect\` 技能完成浏览器 MCP 动态注册；`,
      '未完成 MCP 注册前不得执行任何浏览器控制命令。',
      `MCP 就绪后，再使用 \`${SKILL.WEB_FORGE}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
    ].join(''),
  },
  {
    skillName: SKILL.COURSE_AUTO_PLAYER,
    commandName: COMMAND.COURSE_AUTO_PLAYER,
    description: `通过 ${SKILL.CHROME_DEVTOOLS} 完成浏览器 MCP 注册后，自动播放在线课程列表`,
    argumentHint: '[browser] <课程列表页面URL>',
    skillFile: `src/assets/skills/${skillDir(SKILL.COURSE_AUTO_PLAYER)}/SKILL.md`,
    customTemplate: [
      `先使用 \`${SKILL.CHROME_DEVTOOLS} action=register mode=autoConnect\` 技能完成浏览器 MCP 动态注册；`,
      '未完成 MCP 注册前不得执行任何浏览器控制命令。',
      `MCP 就绪后，再使用 \`${SKILL.COURSE_AUTO_PLAYER}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
    ].join(''),
  },
  {
    skillName: SKILL.HANDOFF,
    commandName: COMMAND.HANDOFF,
    description: '会话交接：提取当前会话核心结论，创建独立新会话并注入上下文',
    argumentHint: '',
    skillFile: `src/assets/skills/${skillDir(SKILL.HANDOFF)}/SKILL.md`,
  },
  {
    skillName: SKILL.PROMPT_OPTIMIZE,
    commandName: COMMAND.PROMPT_OPTIMIZE,
    description: '提示词优化：将用户随意输入优化为结构化 AI 对话提示词，确认后在新会话中自动执行',
    argumentHint: '[auto] [提示词内容]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.PROMPT_OPTIMIZE,
    commandName: `${COMMAND.PROMPT_OPTIMIZE}${AUTO_SUFFIX}`,
    description: '提示词优化（auto 模式）：优化后跳过确认直接在新会话中执行',
    argumentHint: '[提示词内容]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.TASK_LOOP,
    commandName: COMMAND.TASK_LOOP,
    description: '循环执行任务并自动验证，直到达成目标后退出',
    argumentHint: '[一句话目标描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.TASK_LOOP)}/SKILL.md`,
  },
  {
    skillName: SKILL.SQL,
    commandName: COMMAND.SQL,
    description: '通过 JDBC 连接任意数据库并执行 SQL',
    argumentHint: '[SQL 语句]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SQL)}/SKILL.md`,
  },
  {
    skillName: SKILL.SWAGGER_PARSER,
    commandName: COMMAND.SWAGGER_PARSER,
    description: '解析 Swagger/OpenAPI JSON/YAML 并输出接口联调摘要',
    argumentHint: '[source] [method] [path] [tag=TAG] [keyword=TEXT] [mode]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SWAGGER_PARSER)}/SKILL.md`,
  },
  {
    skillName: SKILL.API_TESTER,
    commandName: COMMAND.API_TESTER,
    description: '以真实业务流程编排为主、接口边界测试为辅的自动化接口测试，支持登录认证与接口请求脚本生成',
    argumentHint: '[接口文档|接口描述|已有脚本路径|业务流程描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.API_TESTER)}/SKILL.md`,
  },
  {
    skillName: SKILL.HTML_BUNDLE,
    commandName: COMMAND.HTML_BUNDLE,
    description: '将显式入口 HTML 及其本地静态资源收敛为自包含 bundle.html',
    argumentHint: '[entry] [output] [external=keep|fail]',
    skillFile: `src/assets/skills/${skillDir(SKILL.HTML_BUNDLE)}/SKILL.md`,
  },
  {
    skillName: SKILL.MARKITDOWN,
    commandName: COMMAND.MARKITDOWN,
    description: '将本地文件转换为 Markdown，支持 HTML/CSV/TSV/JSON/DOCX/XLSX/PDF/PPTX/JPG/PNG',
    argumentHint: 'file=路径 [format=格式] [outputPath=路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.MARKITDOWN)}/SKILL.md`,
  },
  {
    skillName: SKILL.GRAPH_BUILD,
    commandName: COMMAND.GRAPH_BUILD,
    description: '构建或增量维护项目文件关系图谱',
    argumentHint: '[target] [mode] [depth] [include=...] [exclude=...]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_BUILD)}/SKILL.md`,
  },
  {
    skillName: SKILL.GRAPH_QUERY,
    commandName: COMMAND.GRAPH_QUERY,
    description: '查询项目文件关系图谱中的依赖、影响范围和健康状态',
    argumentHint: '[mode] [file=<PATH>] [target=<PATH>] [directory=<PATH>]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_QUERY)}/SKILL.md`,
  },
  {
    skillName: SKILL.SAVE_EXPERIENCE,
    commandName: COMMAND.SAVE_EXPERIENCE,
    description: '统一经验沉淀入口：先保存 solution，再按需提炼 rules',
    argumentHint: '[经验摘要|保存目标]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SAVE_EXPERIENCE)}/SKILL.md`,
  },
  {
    skillName: SKILL.SKILL_FROM_SESSION,
    commandName: COMMAND.SKILL_FROM_SESSION,
    description: '从当前会话创建或更新 OpenCode 原生技能',
    argumentHint: '[目标技能名|流程关注点|资产名|纠偏摘要] [--global] [--no-command]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SKILL_FROM_SESSION)}/SKILL.md`,
  },
  {
    skillName: SKILL.SKILL_CREATOR,
    commandName: COMMAND.SKILL_CREATOR,
    description: '创建或更新 OpenCode 原生技能和命令，支持只创建技能、只创建命令或同时创建',
    argumentHint: '<技能名或需求描述> [--global] [--no-command|--command-only]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SKILL_CREATOR)}/SKILL.md`,
  },
  {
    skillName: SKILL.STATIC_SERVER,
    commandName: COMMAND.STATIC_SERVER,
    description: '使用 JavaScript 创建静态服务器，用于预览指定静态页面，支持传入文件路径/目录路径，并返回访问 URL',
    argumentHint: '<路径> [port=端口号] [-k]',
    skillFile: `src/assets/skills/${skillDir(SKILL.STATIC_SERVER)}/SKILL.md`,
  },
  {
    skillName: SKILL.HELP,
    commandName: COMMAND.HELP,
    description: '列出 AE 插件中所有可调用的技能、命令和代理的帮助信息',
    argumentHint: '[技能名或关键词]',
    skillFile: `src/assets/skills/${skillDir(SKILL.HELP)}/SKILL.md`,
  },
  {
    skillName: SKILL.UPDATE,
    commandName: COMMAND.UPDATE,
    description: '拉取 AE 插件最新代码并重新构建，完成本地更新',
    argumentHint: '[project]',
    skillFile: `src/assets/skills/${skillDir(SKILL.UPDATE)}/SKILL.md`,
  },
]

function buildPromptOptimizeVariantEntries(suffix: string, descriptionPrefix: string): AeAssetEntry[] {
  return PHASE_ONE_ENTRIES
    .filter((e) => e.allowPromptOptimizeVariant !== false && hasPromptOptimizeVariant(e.skillName))
    .map((e) => ({
      skillName: SKILL.PROMPT_OPTIMIZE,
      commandName: `${e.commandName}${suffix}`,
      description: `${descriptionPrefix}${e.description}`,
      argumentHint: e.argumentHint,
      skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
    } satisfies AeAssetEntry))
}

const PHASE_ONE_PO_ENTRIES: AeAssetEntry[] = buildPromptOptimizeVariantEntries(PO_SUFFIX, '先优化提示词，再用 ')

const PHASE_ONE_PA_ENTRIES: AeAssetEntry[] = buildPromptOptimizeVariantEntries(PA_SUFFIX, '先优化提示词（auto 模式），再用 ')

const REVIEW_SPECIALIST_AGENT_NAMES = new Set<string>([
  AGENT.COHERENCE_REVIEWER,
  AGENT.FEASIBILITY_REVIEWER,
  AGENT.PRODUCT_LENS_REVIEWER,
  AGENT.ADVERSARIAL_REVIEWER,
  AGENT.DESIGN_LENS_REVIEWER,
  AGENT.SECURITY_REVIEWER,
  AGENT.STEP_GRANULARITY_REVIEWER,
  AGENT.TEST_CASE_REVIEWER,
  AGENT.RESEARCH_REVIEWER,
  AGENT.CORRECTNESS_REVIEWER,
  AGENT.TESTING_REVIEWER,
  AGENT.STANDARDS_REVIEWER,
  AGENT.AGENT_NATIVE_REVIEWER,
  AGENT.API_CONTRACT_REVIEWER,
  AGENT.RELIABILITY_REVIEWER,
  AGENT.MAINTAINABILITY_REVIEWER,
  AGENT.PERFORMANCE_REVIEWER,
  AGENT.ARCHITECTURE_STRATEGIST,
  AGENT.DATA_MIGRATIONS_REVIEWER,
  AGENT.PREVIOUS_COMMENTS_REVIEWER,
  AGENT.GOAL_ALIGNMENT_REVIEWER,
  AGENT.REQUIREMENTS_REVIEWER,
  AGENT.PROTOTYPE_REVIEWER,
  AGENT.TRACEABILITY_REVIEWER,
  AGENT.EVIDENCE_REVIEWER,
  AGENT.DESIGN_CONSISTENCY_REVIEWER,
  AGENT.UI_CONSISTENCY_REVIEWER,
  AGENT.TEST_COVERAGE_REVIEWER,
])

const REQUIRED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string, string?]> = [
  [AGENT.COHERENCE_REVIEWER, 'review', '审查文档的内部一致性'],
  [AGENT.FEASIBILITY_REVIEWER, 'review', '评估文档中提出的技术方法能否经受现实考验'],
  [AGENT.PRODUCT_LENS_REVIEWER, 'review', '以高级产品负责人的视角审查文档，质疑前提和范围对齐'],
  [AGENT.ADVERSARIAL_REVIEWER, 'review', '跨域对抗式审查：代码域构造故障场景，文档域质疑前提假设'],
  [AGENT.DESIGN_LENS_REVIEWER, 'review', '审查文档中缺失的设计决策'],
  [AGENT.SECURITY_REVIEWER, 'review', '跨域安全审查：代码域漏洞审计，文档域安全缺口评估'],
  [AGENT.STEP_GRANULARITY_REVIEWER, 'review', '审查计划步骤粒度与批量操作可脚本化'],
  [
    AGENT.TEST_CASE_REVIEWER,
    'review',
    '审查测试用例文档的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度',
  ],
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
  [AGENT.ARCHITECTURE_STRATEGIST, 'review', '从架构视角分析代码变更，检查架构边界、跨模块依赖和系统级抽象'],
  [AGENT.DATA_MIGRATIONS_REVIEWER, 'review', '审查数据迁移方案与执行细节（含数据库审查）'],
  [AGENT.PREVIOUS_COMMENTS_REVIEWER, 'review', '复查历史审查评论处理情况'],
  [AGENT.GOAL_ALIGNMENT_REVIEWER, 'review', '对照审查目标逐条校验变更是否达成，识别未达成项和偏离'],
  [AGENT.REQUIREMENTS_REVIEWER, 'review', '审查需求文档清晰度、范围边界、验收标准可验证性、角色完整性和未决问题'],
  [AGENT.PROTOTYPE_REVIEWER, 'review', '审查原型/线框/高保真完整性、交互状态覆盖、与需求一致性和实现可行性提示'],
  [AGENT.TRACEABILITY_REVIEWER, 'review', '审查需求-设计-原型-计划-实现-测试链路追溯，识别断裂引用、孤儿条目和未声明延期'],
  [AGENT.EVIDENCE_REVIEWER, 'review', '核验文档或交付报告中的事实声明、命令输出真实性、外部引用可达性和声明可证伪性'],
  [AGENT.DESIGN_CONSISTENCY_REVIEWER, 'review', '审查设计文档与需求的一致性、设计维度完整性、架构与数据模型可行性和安全设计覆盖'],
  [AGENT.UI_CONSISTENCY_REVIEWER, 'review', '审查 UI/UX 设计维度的交互流程完整性、状态覆盖和与需求的一致性'],
  [AGENT.TEST_COVERAGE_REVIEWER, 'review', '审查设计文档中测试用例维度的覆盖完备性、步骤可执行性和需求对齐程度'],
  [AGENT.REVIEW_DOMAIN, 'domain', '审查域代理：选择审查者、并行调度、综合发现', 'domains/review/DOMAIN.md'],
  [AGENT.DEVELOPMENT_DOMAIN, 'domain', '开发域代理：分析任务、选择专精、协调执行', 'domains/development/DOMAIN.md'],
  [AGENT.FRONTEND_DEV, 'domain', '前端开发专精代理：处理 UI 组件、样式、交互逻辑和响应式设计', 'domains/development/specialists/frontend-dev.md'],
  [AGENT.BACKEND_DEV, 'domain', '后端开发专精代理：处理 API、数据层、业务逻辑和中间件', 'domains/development/specialists/backend-dev.md'],
  [AGENT.DEBUG_FIX, 'domain', '调试修复专精代理：处理错误分析、根因定位、修复实现和回归验证', 'domains/development/specialists/debug-fix.md'],
  [AGENT.REFACTOR_DEV, 'domain', '重构改造专精代理（占位）：处理代码重构、架构优化和技术债清理', 'domains/development/specialists/refactor-dev.md'],
]

const GILDED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]> = [
  [AGENT.UI_ARCHITECT, 'workflow', '自由设计：无 Figma 约束的初版 UI 设计实现与视觉验证'],
  [AGENT.UI_MATCHER, 'workflow', '设计还原：以 Figma 设计稿、截图或文字设计规格为准精确还原实现'],
  [AGENT.LOGIC_WEAVER, 'workflow', '交互逻辑：前端交互实现与 API 集成'],
  [AGENT.BROWSER_INSPECTOR, 'workflow', '浏览器验收：端到端浏览器测试与回归验证'],
]

function buildAgentList(
  tuples: ReadonlyArray<readonly [string, AgentDefinition['stage'], string, string?]>,
  tier: 'required' | 'gilded',
): AgentDefinition[] {
  return tuples.map(([name, stage, desc, customPath]) =>
    AgentDefinitionSchema.parse({
      name,
      stage,
      tier,
      description: desc,
      path: customPath
        ?? (REVIEW_SPECIALIST_AGENT_NAMES.has(name) ? `domains/review/specialists/${name}.md` : `${stage}/${name}.md`),
    }),
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

export function getRequiredAgents(): AgentDefinition[] {
  return buildAgentList(REQUIRED_AGENTS, 'required')
}

export function getGildedAgents(): AgentDefinition[] {
  return buildAgentList(GILDED_AGENTS, 'gilded')
}

export function getAllAgentDefinitions(): AgentDefinition[] {
  return [...getRequiredAgents(), ...getGildedAgents()]
}
