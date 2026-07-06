import {
  AeAssetEntrySchema,
  type AeAssetEntry,
  AgentDefinitionSchema,
  type AgentDefinition,
  SKILL,
  COMMAND,
  AGENT,
  skillDir,
} from '../schemas/ae-asset-schema.js'
import { getLifecycleCatalogDescription } from './lifecycle-contract.js'

const PHASE_ONE_ENTRIES: AeAssetEntry[] = [
  {
    skillName: SKILL.BRAINSTORM,
    commandName: COMMAND.BRAINSTORM,
    description: '多模型多视角头脑风暴：通过 ae-brainstorm 工具执行两阶段结构化讨论（纯视角生成 + 跨模型碰撞汇总），自动识别真分歧、共识和盲区',
    argumentHint: '[讨论主题] [perspectives=optimist,critic,pragmatist] [rounds=1]',
    skillFile: `src/assets/skills/${skillDir(SKILL.BRAINSTORM)}/SKILL.md`,
  },
  {
    skillName: SKILL.PRD,
    commandName: COMMAND.PRD,
    description: getLifecycleCatalogDescription('prd'),
    argumentHint: '[目标描述|需求文档路径]',
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
    skillName: SKILL.CHROME_DEVTOOLS,
    commandName: COMMAND.CHROME_DEVTOOLS,
    description: 'chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。',
    argumentHint: '[url] [action] [mode] [browser] [port] [headless] [task=任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.CHROME_DEVTOOLS)}/SKILL.md`,
  },
  {
    skillName: SKILL.WEB_FORGE,
    commandName: COMMAND.WEB_FORGE,
    description: `统一前端能力入口：通过四问题分析选择子代理，强制浏览器验收收尾，最多 3 轮返工修复+回归。需先完成 ${SKILL.CHROME_DEVTOOLS} MCP 注册，子代理 @ui-architect、@ui-matcher、@logic-weaver、@browser-inspector`,
    argumentHint: '[描述|Figma URL|截图路径|页面路由] [--design|--match|--logic|--inspect]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WEB_FORGE)}/SKILL.md`,
    customTemplate: [
      `先使用 \`${SKILL.CHROME_DEVTOOLS} action=register mode=autoConnect\` 技能完成浏览器 MCP 动态注册；`,
      '未完成 MCP 注册前不得执行任何浏览器控制命令。',
      `MCP 就绪后，再使用 \`${SKILL.WEB_FORGE}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
    ].join(''),
  },
  {
    skillName: SKILL.SLIDES_OUTLINE,
    commandName: COMMAND.SLIDES_OUTLINE,
    description: '幻灯片大纲生成与交互修改：根据主题、需求描述、现有大纲文件或现有 HTML 幻灯片生成逐页完整内容大纲，支持对话反复修改直到用户确认',
    argumentHint: '[主题|需求描述|大纲文件路径|现有 HTML 幻灯片文件路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SLIDES_OUTLINE)}/SKILL.md`,
  },
  {
    skillName: SKILL.PPTX_FROM_OUTLINE,
    commandName: COMMAND.PPTX_FROM_OUTLINE,
    description: '传入确认后的幻灯片大纲文件，解析布局提示词与图表/线框描述，调用 ae-pptx 工具生成 PPTX 演示文稿；内容必须完全符合大纲，禁止镀金',
    argumentHint: '[大纲文件路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PPTX_FROM_OUTLINE)}/SKILL.md`,
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
    skillName: SKILL.LIBREOFFICE,
    commandName: COMMAND.LIBREOFFICE,
    description: 'LibreOffice 运行时管理：检测、下载、配置和管理 LibreOffice（ae.jsonc 配置、系统安装或便携版），供 ae:pptx、ae:docx、ae:pdf、ae:xlsx 技能进行文档转换或视觉验证时调用',
    argumentHint: '[action=check|install|config|set-path]',
    skillFile: `src/assets/skills/${skillDir(SKILL.LIBREOFFICE)}/SKILL.md`,
  },
  {
    skillName: SKILL.IMAGE,
    commandName: COMMAND.IMAGE,
    description: '当当前模型不支持图像处理且需要读取或理解图片内容时，必须使用本技能将图片转为 Markdown 描述。支持 JPG/PNG/GIF/WebP/BMP 格式，支持 outputMode 和 prompt 参数控制输出方式和识别重点。模型支持 vision 时可直接用 Read 工具读取图片；模型不支持 vision 时禁止尝试直接读取图片文件，必须通过本技能转换。',
    argumentHint: 'file=图片路径 [format=jpg|png|gif|webp|bmp] [outputMode=file|inline] [prompt=识别提示词] [outputPath=路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.IMAGE)}/SKILL.md`,
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
    skillName: SKILL.PROMPT_OPTIMIZE,
    commandName: COMMAND.PROMPT_OPTIMIZE,
    description: '提示词优化工具：分析用户提示词与当前工作空间相关性后做最小优化，经用户确认后通过 ae-create-session 新开会话自动执行或暂停等待，禁止与原始逻辑违背。当用户原始提示词不清晰、模糊或信息不足时，先通过追问澄清意图再优化。支持 mode=auto 直接提交并自动执行、mode=pause 直接提交并暂停，跳过提交确认提问。',
    argumentHint: '[提示词内容] [mode=auto|pause]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
  },
  {
    skillName: SKILL.SKILL_CREATOR,
    commandName: COMMAND.SKILL_CREATOR,
    description: '创建或更新 OpenCode 原生技能和命令，支持只创建技能、只创建命令或同时创建；--from-session 模式从当前会话提取可复用流程',
    argumentHint: '<技能名或需求描述> [--global] [--no-command|--command-only] [--from-session]',
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
    skillName: SKILL.DOCX,
    commandName: COMMAND.DOCX,
    description: '创建、编辑、分析、追加、更新块 Word 文档（.docx），支持格式保留、修订追踪和文本提取；to-markdown 操作可将 DOCX 转为 Markdown，本技能输出仍为 .docx',
    argumentHint: '[创建|编辑|分析|修订|追加|更新块] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.DOCX)}/SKILL.md`,
  },
  {
    skillName: SKILL.PDF,
    commandName: COMMAND.PDF,
    description: '处理 PDF 文档：创建、合并、拆分、提取文本/表格、填写表单、追加页面、局部更新；to-markdown 操作可将 PDF 转为 Markdown，本技能输出仍为 PDF 或结构化数据',
    argumentHint: '[创建|合并|拆分|提取|表单|旋转|删除|水印|追加|更新] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PDF)}/SKILL.md`,
  },
  {
    skillName: SKILL.PPTX,
    commandName: COMMAND.PPTX,
    description: '创建、编辑、分析、追加、更新 PowerPoint 演示文稿（.pptx），支持模板、布局和设计原则；to-markdown 操作可将 PPTX 转为 Markdown，本技能输出仍为 .pptx',
    argumentHint: '[创建|编辑|分析|追加|更新] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PPTX)}/SKILL.md`,
  },
  {
    skillName: SKILL.XLSX,
    commandName: COMMAND.XLSX,
    description: '创建、编辑、分析、追加行、追加表 Excel 电子表格（.xlsx），支持公式、格式、数据分析和图表；to-markdown 操作可将 XLSX 转为 Markdown，本技能输出仍为 .xlsx',
    argumentHint: '[创建|编辑|分析|追加行|添加工作表] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.XLSX)}/SKILL.md`,
  },
  {
    skillName: SKILL.HELP,
    commandName: COMMAND.HELP,
    description: '列出 AE 插件中所有可调用的技能、命令和代理的帮助信息',
    argumentHint: '[技能名或关键词]',
    skillFile: `src/assets/skills/${skillDir(SKILL.HELP)}/SKILL.md`,
  },
  {
    skillName: SKILL.GRILL,
    commandName: COMMAND.GRILL,
    description: '深度追问方案决策，一问一答推进共识；适用于用户提示词模糊信息不明确需要逐层澄清的场景，以及对已有计划或设计做构建前压力测试',
    argumentHint: '[计划文档路径|设计文档路径|方案描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRILL)}/SKILL.md`,
  },
  {
    skillName: SKILL.INSTALL,
    commandName: COMMAND.INSTALL,
    description: '安装或更新 AE 插件，自动判断已装则更新、未装则安装；不传参数默认全局，一次授权直接执行',
    argumentHint: '[global|project]',
    skillFile: `src/assets/skills/${skillDir(SKILL.INSTALL)}/SKILL.md`,
  },
  {
    skillName: SKILL.UNINSTALL,
    commandName: COMMAND.UNINSTALL,
    description: '卸载 AE 插件，自动检测已安装范围后让用户选择卸载全局或项目级；一次授权直接执行',
    argumentHint: '',
    skillFile: `src/assets/skills/${skillDir(SKILL.UNINSTALL)}/SKILL.md`,
  },
]

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
]

const GILDED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]> = [
  [AGENT.UI_ARCHITECT, 'workflow', '自由设计：无 Figma 约束的初版 UI 设计实现与视觉验证'],
  [AGENT.UI_MATCHER, 'workflow', '设计还原：以 Figma 设计稿、截图或文字设计规格为准精确还原实现'],
  [AGENT.LOGIC_WEAVER, 'workflow', '交互逻辑：前端交互实现与 API 集成'],
  [AGENT.BROWSER_INSPECTOR, 'workflow', '浏览器验收：端到端浏览器测试与回归验证'],
  [AGENT.DOC_ARCHITECT, 'workflow', '文档架构师：为 PPTX/DOCX/PDF/XLSX 制定风格规格和内容结构'],
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

export function getRequiredAgents(): AgentDefinition[] {
  return buildAgentList(REQUIRED_AGENTS, 'required')
}

export function getGildedAgents(): AgentDefinition[] {
  return buildAgentList(GILDED_AGENTS, 'gilded')
}

export function getAllAgentDefinitions(): AgentDefinition[] {
  return [...getRequiredAgents(), ...getGildedAgents()]
}
