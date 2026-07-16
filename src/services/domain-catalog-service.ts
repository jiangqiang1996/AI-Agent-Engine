import {
  AGENT,
  DomainCatalogSchema,
  type DomainCatalog,
  type SpecialistDef,
} from '../schemas/ae-asset-schema.js'

const REVIEW_SPECIALISTS: SpecialistDef[] = [
  {
    name: AGENT.OCR_REVIEWER,
    capabilities: ['bug检测', '安全漏洞', '性能问题', '可维护性', '测试覆盖', '代码风格', '配置文件审查', 'SQL审查', 'CI/CD审查', '项目规范', 'frontmatter', '命名约定', '历史方案', '最佳实践', '框架文档', '对抗式测试', '故障场景', '压力测试', '代理操作', 'CLI 就绪', '工具配置', '错误处理', '重试', '熔断器', '超时', '健康检查'],
    selectionCriteria: '代码审查常驻；通过 ae-ocr 工具调用 OpenCodeReview CLI 执行 AI 代码审查，覆盖规范/研究/对抗式/代理就绪/可靠性',
    inputContract: '审查范围（文件列表/Git diff）、意图摘要（业务上下文）、排除规则',
    outputContract: '结构化审查发现（severity/category/suggestion）',
  },
  {
    name: AGENT.DOCUMENT_REVIEWER,
    capabilities: ['内部一致性', '术语漂移', '结构问题', '歧义识别', '架构冲突', '依赖缺口', '迁移风险', '可实现性', '战略主张', '范围对齐', '复杂度评估', '机会成本', '步骤粒度', '批量操作', '脚本化执行', '需求清晰度', '验收标准可验证性', '角色完整性', '未决问题', '事实性证据核验', '命令输出真实性', '外部引用可达性', '声明可证伪性'],
    selectionCriteria: '文档审查常驻；任何文档审查自动选中，覆盖一致性/可行性/产品视角/步骤粒度/需求/证据',
    inputContract: '文档内容、结构、需求列表和事实声明',
    outputContract: '一致性问题、可行性评估、产品视角建议、需求质量评估、证据核验列表',
  },
  {
    name: AGENT.SECURITY_DESIGN_REVIEWER,
    capabilities: ['认证授权缺口', '数据暴露', '威胁模型', '攻击面清单', '信任边界'],
    selectionCriteria: '文档审查常驻；评估设计文档中的安全缺口',
    inputContract: '文档内容和安全相关标记',
    outputContract: '安全缺口发现和威胁模型评估',
  },
  {
    name: AGENT.ARCHITECTURE_DESIGN_REVIEWER,
    capabilities: ['架构分析', '架构边界', '跨模块依赖', '系统级抽象'],
    selectionCriteria: '代码变更涉及架构决策/新抽象/>=50行，或文档为含架构决策的设计时选中',
    inputContract: '代码差异或文档内容和架构标记',
    outputContract: '架构边界、跨模块依赖和系统级抽象评估',
  },
  {
    name: AGENT.API_DESIGN_REVIEWER,
    capabilities: ['接口契约', '破坏性变更', '序列化', '版本控制'],
    selectionCriteria: '涉及 API 路由/请求响应类型/序列化时选中：hasApi=true',
    inputContract: '代码差异和 API 定义',
    outputContract: '契约破坏性变更和兼容性评估',
  },
  {
    name: AGENT.DATABASE_DESIGN_REVIEWER,
    capabilities: ['数据迁移', 'schema 变更', '数据转换', '回填脚本'],
    selectionCriteria: '涉及迁移文件/schema 变更/数据库时选中',
    inputContract: '代码差异和迁移文件',
    outputContract: '数据完整性和迁移安全性评估',
  },
  {
    name: AGENT.UI_UX_DESIGN_REVIEWER,
    capabilities: ['设计决策', '信息架构', '交互状态', '用户流程', '原型完整性', '与需求一致性', '实现可行性提示', 'UI/UX 交互流程完整性', '状态覆盖', 'UI-需求一致性', '可访问性设计'],
    selectionCriteria: '涉及 UI 或文档类型为原型时选中：hasUi=true',
    inputContract: '文档内容和 UI 标记',
    outputContract: '缺失设计决策、用户流程分析、原型完整性评估、交互流程缺口列表',
  },
  {
    name: AGENT.TEST_CASES_DESIGN_REVIEWER,
    capabilities: ['测试文档', '覆盖完备性', '步骤可执行性', '结果可验证性', '测试用例覆盖完备性', '需求对齐', '边界用例识别'],
    selectionCriteria: '文档类型为测试或设计文档含测试用例维度时选中',
    inputContract: '文档内容或设计文档中的测试用例维度和需求文档',
    outputContract: '测试文档质量评估、覆盖缺口、不可执行步骤、需求对齐问题列表',
  },
  {
    name: AGENT.TRACEABILITY_REVIEWER,
    capabilities: ['需求-设计-实现-测试追溯', '断裂引用', '孤儿条目', '未声明延期'],
    selectionCriteria: '混合产出物 (hasMixedTargets=true) 或 kind=general 时选中',
    inputContract: '多类型产出物（需求/设计/原型/测试用例/代码）的链路引用',
    outputContract: '追溯链断裂、孤儿条目、版本不一致发现',
  },
  {
    name: AGENT.GOAL_ALIGNMENT_REVIEWER,
    capabilities: ['目标达成校验', '成功条件逐条比对', '偏离识别', '未达成项标记'],
    selectionCriteria: '提供审查目标时选中：hasGoalAlignment=true',
    inputContract: '变更内容和审查目标（成功条件列表）',
    outputContract: '逐条目标达成评估和未达成项发现',
  },
  {
    name: AGENT.OBSERVABILITY_DESIGN_REVIEWER,
    capabilities: ['日志规范', '指标体系', '告警规则', '健康检查', 'SLO/SLI 定义'],
    selectionCriteria: '审查设计文档 observability 维度时选中：hasDesignContract=true OR targetTypes 包含 design',
    inputContract: '设计文档中的 observability 维度产物',
    outputContract: '可观测性维度缺口和 SLO/SLI 合理性评估',
  },
  {
    name: AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER,
    capabilities: ['性能目标', '并发模型', '事务边界', '缓存策略', '容量规划'],
    selectionCriteria: '审查设计文档 non-functional 维度时选中：hasDesignContract=true OR targetTypes 包含 design',
    inputContract: '设计文档中的 non-functional 维度产物',
    outputContract: '非功能性维度缺口和性能/容量合理性评估',
  },
  {
    name: AGENT.DESIGN_INTEGRITY_REVIEWER,
    capabilities: ['设计-需求一致性', '设计维度完整性', '架构可行性', '数据模型一致性', '安全设计覆盖', 'API 设计合理性'],
    selectionCriteria: '审查设计文档时选中：hasDesignContract=true',
    inputContract: '设计文档和需求文档',
    outputContract: '设计维度缺口、需求偏离、架构与数据模型风险列表',
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
