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
    tier: 'core',
  },
  {
    skillName: SKILL.PRD,
    commandName: COMMAND.PRD,
    description: getLifecycleCatalogDescription('prd'),
    argumentHint: '[目标描述|需求文档路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PRD)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.DESIGN,
    commandName: COMMAND.DESIGN,
    description: getLifecycleCatalogDescription('design'),
    argumentHint: '[需求文档路径|design|裸描述] [dimensions=architecture,database] [refactor=true]',
    skillFile: `src/assets/skills/${skillDir(SKILL.DESIGN)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.AGENT_CREATOR,
    commandName: COMMAND.AGENT_CREATOR,
    description: '创建或更新 OpenCode 原生代理，默认项目级，支持显式全局级和可选同级命令',
    argumentHint: '[代理用途|代理名称] [--global] [--command]',
    skillFile: `src/assets/skills/${skillDir(SKILL.AGENT_CREATOR)}/SKILL.md`,
    tier: 'meta',
  },
  {
    skillName: SKILL.WORK,
    commandName: COMMAND.WORK,
    description: getLifecycleCatalogDescription('work'),
    argumentHint: '[设计路径|交接文件路径|任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.WORK_REPORT,
    commandName: COMMAND.WORK_REPORT,
    description: '基于 Git 提交与未提交变更生成日报、周报或指定时间段工作总结',
    argumentHint: '[日报|周报|时间段|提交范围]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WORK_REPORT)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.MY_CODE_CHANGES,
    commandName: COMMAND.MY_CODE_CHANGES,
    description: '获取指定时间内本人提交的所有代码变更（含本机未提交的），只取最终状态，不输出中间过程',
    argumentHint: 'since=<date> [until=<date>]',
    skillFile: `src/assets/skills/${skillDir(SKILL.MY_CODE_CHANGES)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.MERGE_BRANCH,
    commandName: COMMAND.MERGE_BRANCH,
    description: '将来源分支或本地 worktree 的变更合并到接收分支，并用来源分支的 AE 交接、需求和设计验证合并结果',
    argumentHint: '[来源分支名|本地 worktree 路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.MERGE_BRANCH)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.REVIEW,
    commandName: COMMAND.REVIEW,
    description: `${getLifecycleCatalogDescription('outcome-review')}；通用审查入口，默认自动识别审查场景，支持代码、需求、设计、原型、测试用例、配置、技能、命令等单一或混合范围`,
    argumentHint: '[mode] [scenes=<list>] [targets=<list>] [from=<ref>] [full] [full=<path>] [session] [design=<path>] [goals=<text>] [路径...]',
    skillFile: `src/assets/skills/${skillDir(SKILL.REVIEW)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.CHROME_DEVTOOLS,
    commandName: COMMAND.CHROME_DEVTOOLS,
    description: 'chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。',
    argumentHint: '[url] [action] [mode] [browser] [port] [headless] [task=任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.CHROME_DEVTOOLS)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.WEB_FORGE,
    commandName: COMMAND.WEB_FORGE,
    description: `前端开发统一入口：自动识别技术栈与可复用资产，自适应组合设计/实现/验收阶段，支持无人值守模式。需先完成 ${SKILL.CHROME_DEVTOOLS} MCP 注册，子代理 @ui-design-spec、@ui-architect、@logic-weaver、@browser-inspector`,
    argumentHint: '[描述|Figma URL|截图路径|页面路由] [--inspect <url>|--no-inspect|--yes]',
    skillFile: `src/assets/skills/${skillDir(SKILL.WEB_FORGE)}/SKILL.md`,
    tier: 'tools',
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
    tier: 'docs',
  },
  {
    skillName: SKILL.HANDOFF,
    commandName: COMMAND.HANDOFF,
    description: '会话交接：提取当前会话核心结论，创建独立新会话并注入上下文',
    argumentHint: '',
    skillFile: `src/assets/skills/${skillDir(SKILL.HANDOFF)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.TASK_LOOP,
    commandName: COMMAND.TASK_LOOP,
    description: '循环执行任务并自动验证，直到达成目标后退出',
    argumentHint: '[一句话目标描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.TASK_LOOP)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.SQL,
    commandName: COMMAND.SQL,
    description: '通过 JDBC 连接任意数据库并执行 SQL',
    argumentHint: '[SQL 语句]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SQL)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.SWAGGER_PARSER,
    commandName: COMMAND.SWAGGER_PARSER,
    description: '解析 Swagger/OpenAPI JSON/YAML 并输出接口联调摘要',
    argumentHint: '[source] [method] [path] [tag=TAG] [keyword=TEXT] [mode]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SWAGGER_PARSER)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.API_TESTER,
    commandName: COMMAND.API_TESTER,
    description: '以真实业务流程编排为主、接口边界测试为辅的自动化接口测试，支持登录认证与接口请求脚本生成',
    argumentHint: '[接口文档|接口描述|已有脚本路径|业务流程描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.API_TESTER)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.IMAGE,
    commandName: COMMAND.IMAGE,
    description: '将本地图片转换为 Markdown 描述。通过 ae.jsonc 中 modelScenarios.vision 配置的模型识别图片内容，未配置时由 opencode 自行分配模型。支持 JPG/PNG/GIF/WebP/BMP 格式，识别提示词由调用方通过 prompt 参数传入。模型支持 vision 时可直接用 Read 工具读取图片；模型不支持 vision 时禁止尝试直接读取图片文件，必须通过本技能转换。',
    argumentHint: 'file=图片路径 [format=jpg|jpeg|png|gif|webp|bmp] [outputMode=file|inline] [prompt=识别提示词] [outputPath=路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.IMAGE)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.AUDIO,
    commandName: COMMAND.AUDIO,
    description: '将本地音频转换为 Markdown 描述。通过 ae.jsonc 中 modelScenarios.audio 配置的模型识别音频内容，未配置时由 opencode 自行分配模型。支持 MP3/WAV/OGG/FLAC/M4A/AAC 格式，识别提示词由调用方通过 prompt 参数传入。模型支持音频输入时可直接用 Read 工具读取；模型不支持音频时禁止尝试直接读取音频文件，必须通过本技能转换。',
    argumentHint: 'file=音频路径 [format=mp3|wav|ogg|flac|m4a|aac] [outputMode=file|inline] [prompt=识别提示词] [outputPath=路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.AUDIO)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.VIDEO,
    commandName: COMMAND.VIDEO,
    description: '将本地视频转换为 Markdown 描述。通过 ae.jsonc 中 modelScenarios.video 配置的模型识别视频内容，未配置时由 opencode 自行分配模型。支持 MP4/WebM/AVI/MOV/MKV/FLV 格式，识别提示词由调用方通过 prompt 参数传入。模型支持视频输入时可直接用 Read 工具读取；模型不支持视频时禁止尝试直接读取视频文件，必须通过本技能转换。',
    argumentHint: 'file=视频路径 [format=mp4|webm|avi|mov|mkv|flv] [outputMode=file|inline] [prompt=识别提示词] [outputPath=路径]',
    skillFile: `src/assets/skills/${skillDir(SKILL.VIDEO)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.GRAPH_BUILD,
    commandName: COMMAND.GRAPH_BUILD,
    description: '构建或增量维护项目文件关系图谱',
    argumentHint: '[target] [mode] [depth] [include=...] [exclude=...]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_BUILD)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.GRAPH_QUERY,
    commandName: COMMAND.GRAPH_QUERY,
    description: '查询项目文件关系图谱中的依赖、影响范围和健康状态',
    argumentHint: '[mode] [file=<PATH>] [target=<PATH>] [directory=<PATH>]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRAPH_QUERY)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.PROJECT_EXPLORE,
    commandName: COMMAND.PROJECT_EXPLORE,
    description: '探索和分析任意文件集合的结构与关系——代码项目、文档库、配置仓库、数据目录、复刻前调研。@explore 增强版：增加分类识别、关系映射、模式推断和复刻指南',
    argumentHint: '[target] [focus=structure|content|relations|patterns|all] [depth=quick|standard|deep] [output=summary|profile|both]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PROJECT_EXPLORE)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.SAVE_EXPERIENCE,
    commandName: COMMAND.SAVE_EXPERIENCE,
    description: '统一经验沉淀入口：先保存 solution，再按需提炼 rules',
    argumentHint: '[经验摘要|保存目标]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SAVE_EXPERIENCE)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.PROMPT_OPTIMIZE,
    commandName: COMMAND.PROMPT_OPTIMIZE,
    description: '提示词优化工具：分析用户提示词与当前工作空间相关性后做最小优化，经用户确认后通过 ae-create-session 新开会话自动执行或暂停等待，禁止与原始逻辑违背。当用户原始提示词不清晰、模糊或信息不足时，先通过追问澄清意图再优化。支持 mode=auto 直接提交并自动执行、mode=pause 直接提交并暂停，跳过提交确认提问。',
    argumentHint: '[提示词内容] [mode=auto|pause]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PROMPT_OPTIMIZE)}/SKILL.md`,
    tier: 'tools',
  },
  {
    skillName: SKILL.SKILL_CREATOR,
    commandName: COMMAND.SKILL_CREATOR,
    description: '创建或更新 OpenCode 原生技能和命令，支持只创建技能、只创建命令或同时创建；--from-session 模式从当前会话提取可复用流程',
    argumentHint: '<技能名或需求描述> [--global] [--no-command|--command-only] [--from-session]',
    skillFile: `src/assets/skills/${skillDir(SKILL.SKILL_CREATOR)}/SKILL.md`,
    tier: 'meta',
  },
  {
    skillName: SKILL.DOCX,
    commandName: COMMAND.DOCX,
    description: 'ae:officecli 的 .docx 专属包装技能。创建、编辑、分析 Word 文档，支持段落、表格、修订追踪、页眉页脚、目录等全部 OOXML 能力。底层通过 ae-officecli 工具执行',
    argumentHint: '[创建|编辑|分析|读取|追加|格式转换] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.DOCX)}/SKILL.md`,
    tier: 'docs',
  },
  {
    skillName: SKILL.PDF,
    commandName: COMMAND.PDF,
    description: '处理 PDF 文档：创建、合并、拆分、提取文本/表格、填写表单、追加页面、局部更新；to-markdown 操作可将 PDF 转为 Markdown，本技能输出仍为 PDF 或结构化数据',
    argumentHint: '[创建|合并|拆分|提取|表单|旋转|删除|水印|追加|更新] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PDF)}/SKILL.md`,
    tier: 'docs',
  },
  {
    skillName: SKILL.PPTX,
    commandName: COMMAND.PPTX,
    description: 'ae:officecli 的 .pptx 专属包装技能。创建、编辑、分析 PowerPoint 演示文稿，支持幻灯片、形状、图片、图表、表格、动画、过渡、母版等全部 OOXML 能力。底层通过 ae-officecli 工具执行',
    argumentHint: '[创建|编辑|分析|读取|追加|更新|预览] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.PPTX)}/SKILL.md`,
    tier: 'docs',
  },
  {
    skillName: SKILL.XLSX,
    commandName: COMMAND.XLSX,
    description: 'ae:officecli 的 .xlsx 专属包装技能。创建、编辑、分析 Excel 电子表格，支持公式计算、数据透视表、条件格式、图表、数据验证等全部 OOXML 能力。底层通过 ae-officecli 工具执行',
    argumentHint: '[创建|编辑|分析|读取|追加|公式|透视表] [文件路径] [任务描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.XLSX)}/SKILL.md`,
    tier: 'docs',
  },
  {
    skillName: SKILL.GRILL,
    commandName: COMMAND.GRILL,
    description: '深度追问方案决策，一问一答推进共识；适用于用户提示词模糊信息不明确需要逐层澄清的场景，以及对已有需求或设计做构建前压力测试',
    argumentHint: '[需求文档路径|设计文档路径|方案描述]',
    skillFile: `src/assets/skills/${skillDir(SKILL.GRILL)}/SKILL.md`,
    tier: 'core',
  },
  {
    skillName: SKILL.OFFICECLI,
    commandName: COMMAND.OFFICECLI,
    description: '通过 ae-officecli 工具调用 OfficeCLI 原生二进制操作 Office 文档（.docx/.xlsx/.pptx），支持 L1 读取/L2 DOM 编辑/L3 raw XML，内置公式引擎和 HTML 渲染；跨平台自动下载二进制，用户无需手动安装',
    argumentHint: '[文件路径] [command=...] [path=...] [props=...]',
    skillFile: `src/assets/skills/${skillDir(SKILL.OFFICECLI)}/SKILL.md`,
    tier: 'docs',
  },
  {
    skillName: SKILL.OCR,
    commandName: COMMAND.OCR,
    description: '通过 ae-ocr 工具调用 OpenCodeReview CLI 执行 AI 代码审查，覆盖 bug/安全/性能/可维护性/测试覆盖/风格',
    argumentHint: '[review|scan] [路径或 ref]',
    skillFile: `src/assets/skills/${skillDir(SKILL.OCR)}/SKILL.md`,
    tier: 'tools',
  },
]

const REVIEW_SPECIALIST_AGENT_NAMES = new Set<string>([
  AGENT.OCR_REVIEWER,
  AGENT.DOCUMENT_REVIEWER,
  AGENT.SECURITY_DESIGN_REVIEWER,
  AGENT.ARCHITECTURE_DESIGN_REVIEWER,
  AGENT.API_DESIGN_REVIEWER,
  AGENT.DATABASE_DESIGN_REVIEWER,
  AGENT.UI_UX_DESIGN_REVIEWER,
  AGENT.TEST_CASES_DESIGN_REVIEWER,
  AGENT.OBSERVABILITY_DESIGN_REVIEWER,
  AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER,
  AGENT.TRACEABILITY_REVIEWER,
  AGENT.GOAL_ALIGNMENT_REVIEWER,
  AGENT.DESIGN_INTEGRITY_REVIEWER,
])

const REQUIRED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string, string?]> = [
  [AGENT.DOCUMENT_REVIEWER, 'review', '文档审查主引擎：审查内部一致性、可行性、产品视角、步骤粒度、需求质量和证据核验', 'reviewers/document-reviewer.md'],
  [AGENT.SECURITY_DESIGN_REVIEWER, 'review', '文档域安全审查：评估设计文档中的安全缺口、认证授权假设、数据暴露和威胁模型', 'reviewers/security-design-reviewer.md'],
  [AGENT.REPO_RESEARCH_ANALYST, 'research', '研究仓库结构与已有模式'],
  [AGENT.WEB_RESEARCHER, 'research', '搜索并总结网络信息'],
  [AGENT.SPEC_FLOW_ANALYZER, 'workflow', '分析阶段流转和边界情况'],
  [AGENT.OCR_REVIEWER, 'review', 'OCR 代码审查主引擎：通过 ae-ocr 工具覆盖 bug/安全/性能/可维护性/测试覆盖/风格/规范/对抗式/代理就绪/可靠性', 'reviewers/ocr-reviewer.md'],
  [AGENT.API_DESIGN_REVIEWER, 'review', '审查接口契约破坏性变更和兼容性', 'reviewers/api-design-reviewer.md'],
  [AGENT.ARCHITECTURE_DESIGN_REVIEWER, 'review', '从架构视角分析代码变更，检查架构边界、跨模块依赖和系统级抽象', 'reviewers/architecture-design-reviewer.md'],
  [AGENT.DATABASE_DESIGN_REVIEWER, 'review', '审查数据迁移方案与执行细节（含数据库审查）', 'reviewers/database-design-reviewer.md'],
  [AGENT.UI_UX_DESIGN_REVIEWER, 'review', '审查 UI/UX 设计维度的交互流程完整性、状态覆盖、与需求的一致性以及原型完整性', 'reviewers/ui-ux-design-reviewer.md'],
  [AGENT.TEST_CASES_DESIGN_REVIEWER, 'review', '审查测试用例维度的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度', 'reviewers/test-cases-design-reviewer.md'],
  [AGENT.OBSERVABILITY_DESIGN_REVIEWER, 'review', '审查可观测性维度产物：日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义', 'reviewers/observability-design-reviewer.md'],
  [AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER, 'review', '审查非功能维度产物：性能目标、并发模型、事务边界、缓存策略和容量规划', 'reviewers/non-functional-design-reviewer.md'],
  [AGENT.GOAL_ALIGNMENT_REVIEWER, 'review', '对照审查目标逐条校验变更是否达成，识别未达成项和偏离', 'reviewers/goal-alignment-reviewer.md'],
  [AGENT.TRACEABILITY_REVIEWER, 'review', '审查需求-设计-原型-实现-测试链路追溯，识别断裂引用、孤儿条目和未声明延期', 'reviewers/traceability-reviewer.md'],
  [AGENT.DESIGN_INTEGRITY_REVIEWER, 'review', '审查设计文档与需求的一致性、设计维度完整性、架构与数据模型可行性和安全设计覆盖', 'reviewers/design-integrity-reviewer.md'],
  [AGENT.FRONTEND_DEV, 'development', '前端开发专精代理：处理 UI 组件、样式、交互逻辑和响应式设计', 'developers/frontend-dev.md'],
  [AGENT.BACKEND_DEV, 'development', '后端开发专精代理：处理 API、数据层、业务逻辑和中间件', 'developers/backend-dev.md'],
  [AGENT.DEBUG_FIX, 'development', '调试修复专精代理：处理错误分析、根因定位、修复实现和回归验证', 'developers/debug-fix.md'],
]

const GILDED_AGENTS: ReadonlyArray<readonly [string, AgentDefinition['stage'], string]> = [
  [AGENT.UI_DESIGN_SPEC, 'workflow', 'UI 设计规范与决策专家：推断设计读数、配置三旋钮、选择设计体系、推荐风格变体，产出结构化设计决策包'],
  [AGENT.UI_ARCHITECT, 'workflow', 'Web 视觉实现：根据设计决策包和设计输入，完成页面的视觉代码实现'],
  [AGENT.LOGIC_WEAVER, 'workflow', '前端代码实现：交互逻辑、API联调、状态管理、组件开发、重构、性能优化'],
  [AGENT.BROWSER_INSPECTOR, 'workflow', '浏览器验收：端到端浏览器测试与回归验证'],
  [AGENT.UI_UX_DESIGNER, 'workflow', 'UI/UX 设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 ui-ux.md 设计契约，含设计读数、信息架构、页面规格、组件契约、设计 Token 和交互状态机'],
  [AGENT.ARCHITECTURE_DESIGNER, 'workflow', '架构设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 architecture.md 设计契约，含模块边界、依赖方向、分层规则、数据流和错误传播链'],
  [AGENT.API_DESIGNER, 'workflow', '接口设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 api.md 设计契约，含端点清单、TypeScript interface、认证授权、错误码体系和幂等性声明'],
  [AGENT.DATABASE_DESIGNER, 'workflow', '数据库设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 database.md 设计契约，含 ER 模型、表结构、关系与外键、迁移策略和敏感字段标注'],
  [AGENT.TEST_CASES_DESIGNER, 'workflow', '测试用例设计维度专精代理：根据 prd 需求、其他维度契约和 ae:grill 追问结果产出 test-cases.md 设计契约，含覆盖矩阵、P0-P3 用例、行为契约规格和维度覆盖追溯'],
  [AGENT.SECURITY_DESIGNER, 'workflow', '安全设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 security.md 设计契约，含威胁模型、信任边界、认证授权流程、数据分级和密钥管理'],
  [AGENT.OBSERVABILITY_DESIGNER, 'workflow', '可观测性设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 observability.md 设计契约，含日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义'],
  [AGENT.NON_FUNCTIONAL_DESIGNER, 'workflow', '非功能设计维度专精代理：根据 prd 需求和 ae:grill 追问结果产出 non-functional.md 设计契约，含性能目标、并发模型、事务边界、缓存策略和容量规划'],
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
        ?? (REVIEW_SPECIALIST_AGENT_NAMES.has(name)
          ? `reviewers/${name}.md`
          : stage === 'development'
            ? `developers/${name}.md`
            : `${stage}/${name}.md`),
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
