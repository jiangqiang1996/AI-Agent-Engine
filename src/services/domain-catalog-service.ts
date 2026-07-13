import {
  AGENT,
  DomainCatalogSchema,
  type DomainCatalog,
  type SpecialistDef,
} from '../schemas/ae-asset-schema.js'

const REVIEW_SPECIALISTS: SpecialistDef[] = [
  {
    name: AGENT.CORRECTNESS_REVIEWER,
    capabilities: ['逻辑正确性', '边界条件', '状态管理', '错误传播'],
    selectionCriteria: '代码审查常驻；任何代码变更自动选中',
    inputContract: '代码差异、变更上下文和文件列表',
    outputContract: '逻辑错误发现列表和修复建议',
  },
  {
    name: AGENT.TESTING_REVIEWER,
    capabilities: ['测试覆盖', '断言质量', '边界用例', '脆弱测试'],
    selectionCriteria: '代码审查常驻；任何代码变更自动选中',
    inputContract: '代码差异和测试文件列表',
    outputContract: '测试覆盖缺口和断言质量评估',
  },
  {
    name: AGENT.MAINTAINABILITY_REVIEWER,
    capabilities: ['过早抽象', '死代码', '命名模糊', '设计模式误用', '代码重复'],
    selectionCriteria: '代码审查常驻；任何代码变更自动选中',
    inputContract: '代码差异和文件列表',
    outputContract: '可维护性发现和重构建议',
  },
  {
    name: AGENT.STANDARDS_REVIEWER,
    capabilities: ['项目规范', '配置文件', 'frontmatter', '命名约定'],
    selectionCriteria: '代码审查常驻；任何代码变更自动选中',
    inputContract: '代码差异和项目规范文件',
    outputContract: '规范违规发现和修正建议',
  },
  {
    name: AGENT.RESEARCH_REVIEWER,
    capabilities: ['历史方案', '最佳实践', '框架文档', '经验提炼'],
    selectionCriteria: '代码审查常驻；搜索历史方案和最佳实践',
    inputContract: '变更上下文和代码差异',
    outputContract: '相关历史方案、最佳实践和框架文档',
  },
  {
    name: AGENT.COHERENCE_REVIEWER,
    capabilities: ['内部一致性', '术语漂移', '结构问题', '歧义识别'],
    selectionCriteria: '文档审查常驻；任何文档审查自动选中',
    inputContract: '文档内容和结构',
    outputContract: '一致性问题和术语漂移发现',
  },
  {
    name: AGENT.FEASIBILITY_REVIEWER,
    capabilities: ['架构冲突', '依赖缺口', '迁移风险', '可实现性'],
    selectionCriteria: '文档审查常驻；任何文档审查自动选中',
    inputContract: '文档内容和项目上下文',
    outputContract: '可行性评估和风险清单',
  },
  {
    name: AGENT.SECURITY_REVIEWER,
    capabilities: ['认证授权', '公共端点', '输入处理', '权限检查', '威胁模型'],
    selectionCriteria: '涉及安全边界时选中：hasSecurity=true',
    inputContract: '代码差异或文档内容和安全标记',
    outputContract: '安全漏洞或安全缺口发现',
  },
  {
    name: AGENT.ADVERSARIAL_REVIEWER,
    capabilities: ['对抗式测试', '故障场景', '前提质疑', '压力测试'],
    selectionCriteria: '变更>=50行、涉及安全/API/高风险/架构决策/新抽象时选中',
    inputContract: '代码差异或文档内容和上下文标记',
    outputContract: '对抗式发现和压力测试结果',
  },
  {
    name: AGENT.AGENT_NATIVE_REVIEWER,
    capabilities: ['代理操作', 'CLI 就绪', '工具配置', 'UI 能力'],
    selectionCriteria: '涉及 CLI/UI/工具/代理配置时选中',
    inputContract: '代码差异和代理/工具配置',
    outputContract: '代理就绪度和 CLI 友好性评估',
  },
  {
    name: AGENT.ARCHITECTURE_STRATEGIST,
    capabilities: ['架构分析', '架构边界', '跨模块依赖', '系统级抽象'],
    selectionCriteria: '代码变更涉及架构决策/新抽象/>=50行，或文档为含架构决策的设计时选中',
    inputContract: '代码差异或文档内容和架构标记',
    outputContract: '架构边界、跨模块依赖和系统级抽象评估',
  },
  {
    name: AGENT.PERFORMANCE_REVIEWER,
    capabilities: ['算法复杂度', '缓存策略', '数据库查询', '前端渲染'],
    selectionCriteria: '涉及性能敏感逻辑时选中：hasPerformance=true',
    inputContract: '代码差异和性能标记',
    outputContract: '性能瓶颈和优化建议',
  },
  {
    name: AGENT.API_CONTRACT_REVIEWER,
    capabilities: ['接口契约', '破坏性变更', '序列化', '版本控制'],
    selectionCriteria: '涉及 API 路由/请求响应类型/序列化时选中：hasApi=true',
    inputContract: '代码差异和 API 定义',
    outputContract: '契约破坏性变更和兼容性评估',
  },
  {
    name: AGENT.RELIABILITY_REVIEWER,
    capabilities: ['错误处理', '重试', '熔断器', '超时', '健康检查'],
    selectionCriteria: '涉及可靠性/容错/基础设施时选中',
    inputContract: '代码差异和可靠性标记',
    outputContract: '可靠性评估和故障模式分析',
  },
  {
    name: AGENT.DATA_MIGRATIONS_REVIEWER,
    capabilities: ['数据迁移', 'schema 变更', '数据转换', '回填脚本'],
    selectionCriteria: '涉及迁移文件/schema 变更/数据库时选中',
    inputContract: '代码差异和迁移文件',
    outputContract: '数据完整性和迁移安全性评估',
  },
  {
    name: AGENT.PREVIOUS_COMMENTS_REVIEWER,
    capabilities: ['历史评论', '反馈复查', '讨论串'],
    selectionCriteria: '存在 PR 元数据和历史审查评论时选中',
    inputContract: 'PR 元数据和评论历史',
    outputContract: '历史反馈处理情况',
  },
  {
    name: AGENT.PRODUCT_LENS_REVIEWER,
    capabilities: ['战略主张', '范围对齐', '复杂度评估', '机会成本'],
    selectionCriteria: '文档为设计、需求>=5 或含产品主张时选中',
    inputContract: '文档内容和需求列表',
    outputContract: '产品视角评估和范围对齐建议',
  },
  {
    name: AGENT.STEP_GRANULARITY_REVIEWER,
    capabilities: ['步骤粒度', '批量操作', '脚本化执行'],
    selectionCriteria: '文档为设计、目标类型包含设计、审查场景包含设计，或需求>=5 时选中',
    inputContract: '文档内容和步骤列表',
    outputContract: '步骤粒度评估和脚本化建议',
  },
  {
    name: AGENT.DESIGN_LENS_REVIEWER,
    capabilities: ['设计决策', '信息架构', '交互状态', '用户流程'],
    selectionCriteria: '涉及 UI 时选中：hasUi=true',
    inputContract: '文档内容和 UI 标记',
    outputContract: '缺失设计决策和用户流程分析',
  },
  {
    name: AGENT.TEST_CASE_REVIEWER,
    capabilities: ['测试文档', '覆盖完备性', '步骤可执行性', '结果可验证性'],
    selectionCriteria: '文档类型为测试时选中',
    inputContract: '文档内容',
    outputContract: '测试文档质量评估',
  },
  {
    name: AGENT.REQUIREMENTS_REVIEWER,
    capabilities: ['需求清晰度', '范围边界', '验收标准可验证性', '角色完整性', '未决问题'],
    selectionCriteria: '文档类型为需求 (documentType=requirements) 或 targetType 含 requirements 时选中',
    inputContract: '需求文档内容、目标和验收标准',
    outputContract: '需求质量评估、模糊点、验收标准缺口',
  },
  {
    name: AGENT.PROTOTYPE_REVIEWER,
    capabilities: ['原型完整性', '交互状态', '与需求一致性', '实现可行性提示'],
    selectionCriteria: '文档类型为原型 (documentType=prototype) 或 targetType 含 prototype 时选中',
    inputContract: '原型/线框/高保真说明文档',
    outputContract: '原型完整性评估、状态覆盖缺口、与需求差异',
  },
  {
    name: AGENT.TRACEABILITY_REVIEWER,
    capabilities: ['需求-设计-实现-测试追溯', '断裂引用', '孤儿条目', '未声明延期'],
    selectionCriteria: '混合产出物 (hasMixedTargets=true) 或 kind=general 时选中',
    inputContract: '多类型产出物（需求/设计/原型/测试用例/代码）的链路引用',
    outputContract: '追溯链断裂、孤儿条目、版本不一致发现',
  },
  {
    name: AGENT.EVIDENCE_REVIEWER,
    capabilities: ['事实性证据核验', '命令输出真实性', '外部引用可达性', '声明可证伪性'],
    selectionCriteria: '文档含交付证明/外部声明 (hasEvidenceClaim=true) 或 documentType=general 时选中',
    inputContract: '文档或交付报告中的事实声明、引用、证据列表',
    outputContract: '不可核验声明、虚假证据、可疑引用列表',
  },
  {
    name: AGENT.GOAL_ALIGNMENT_REVIEWER,
    capabilities: ['目标达成校验', '成功条件逐条比对', '偏离识别', '未达成项标记'],
    selectionCriteria: '提供审查目标时选中：hasGoalAlignment=true',
    inputContract: '变更内容和审查目标（成功条件列表）',
    outputContract: '逐条目标达成评估和未达成项发现',
  },
  {
    name: AGENT.DESIGN_CONSISTENCY_REVIEWER,
    capabilities: ['设计-需求一致性', '设计维度完整性', '架构可行性', '数据模型一致性', '安全设计覆盖', 'API 设计合理性'],
    selectionCriteria: '审查设计文档时选中：hasDesignContract=true',
    inputContract: '设计文档和需求文档',
    outputContract: '设计维度缺口、需求偏离、架构与数据模型风险列表',
  },
  {
    name: AGENT.UI_CONSISTENCY_REVIEWER,
    capabilities: ['UI/UX 交互流程完整性', '状态覆盖', 'UI-需求一致性', '可访问性设计'],
    selectionCriteria: '设计文档含 UI 维度或 hasUi=true 时选中',
    inputContract: '设计文档中的 UI/UX 维度和需求文档',
    outputContract: '交互流程缺口、状态遗漏、UI-需求偏离列表',
  },
  {
    name: AGENT.TEST_COVERAGE_REVIEWER,
    capabilities: ['测试用例覆盖完备性', '步骤可执行性', '需求对齐', '边界用例识别'],
    selectionCriteria: '设计文档含测试用例维度时选中：hasDesignContract=true',
    inputContract: '设计文档中的测试用例维度和需求文档',
    outputContract: '覆盖缺口、不可执行步骤、需求对齐问题列表',
  },
]

const DEVELOPMENT_SPECIALISTS: SpecialistDef[] = [
  {
    name: AGENT.FRONTEND_DEV,
    capabilities: ['UI 组件', '样式', '交互逻辑', '响应式设计', '前端', '页面', '表单', '组件', '视图', 'html', 'css'],
    selectionCriteria: '任务涉及前端/UI/组件/样式时选中',
    inputContract: '任务描述和前端上下文',
    outputContract: '前端实现和样式代码',
  },
  {
    name: AGENT.BACKEND_DEV,
    capabilities: ['API', '数据层', '业务逻辑', '中间件', '接口', '服务层', '逻辑', 'controller', 'service'],
    selectionCriteria: '任务涉及 API/数据库/服务/后端时选中',
    inputContract: '任务描述和后端上下文',
    outputContract: '后端实现和接口代码',
  },
  {
    name: AGENT.DEBUG_FIX,
    capabilities: ['错误分析', '根因定位', '修复实现', '回归验证', '问题', '报错', '异常', '崩溃', '排查'],
    selectionCriteria: '任务涉及调试/修复/Bug 时选中',
    inputContract: '任务描述和错误上下文',
    outputContract: '修复代码和验证结果',
  },
]

const DOMAIN_CATALOGS: DomainCatalog[] = [
  DomainCatalogSchema.parse({
    domain: 'review',
    domainAgent: {
      name: AGENT.REVIEW_DOMAIN,
      stage: 'domain',
      tier: 'required',
      description: '审查域代理：选择审查者、并行调度、综合发现',
      path: 'domains/review/DOMAIN.md',
    },
    specialists: REVIEW_SPECIALISTS,
  }),
  DomainCatalogSchema.parse({
    domain: 'development',
    domainAgent: {
      name: AGENT.DEVELOPMENT_DOMAIN,
      stage: 'domain',
      tier: 'required',
      description: '开发域代理：分析任务、选择专精、协调执行',
      path: 'domains/development/DOMAIN.md',
    },
    specialists: DEVELOPMENT_SPECIALISTS,
  }),
]

export function getDomainCatalog(domain?: string): DomainCatalog[] {
  if (!domain) return DOMAIN_CATALOGS
  return DOMAIN_CATALOGS.filter((c) => c.domain === domain)
}

export function getAllDomainCatalogs(): DomainCatalog[] {
  return DOMAIN_CATALOGS
}
