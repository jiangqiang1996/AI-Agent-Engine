import {
  AGENT,
  DomainCatalogSchema,
  type DomainCatalog,
  type SpecialistDef,
} from '../schemas/ae-asset-schema.js'

const DEVELOPMENT_SPECIALISTS: SpecialistDef[] = [
  {
    name: AGENT.FRONTEND_DEV,
    capabilities: ['UI 组件', '样式', '交互逻辑', '响应式设计', '前端', '页面', '表单', '组件', '视图', 'html', 'css', '界面'],
    selectionCriteria: '任务涉及前端/UI/组件/样式时选中',
    inputContract: '任务描述和前端上下文',
    outputContract: '前端实现和样式代码',
  },
  {
    name: AGENT.BACKEND_DEV,
    capabilities: ['API', '数据层', '业务逻辑', '中间件', '接口', '服务层', '逻辑', 'controller', 'service', '后端'],
    selectionCriteria: '任务涉及 API/数据库/服务/后端时选中',
    inputContract: '任务描述和后端上下文',
    outputContract: '后端实现和接口代码',
  },
  {
    name: AGENT.BACKEND_FIX,
    capabilities: ['错误分析', '根因定位', '修复实现', '回归验证', '问题', '报错', '异常', '崩溃', '排查', '修复', 'bug'],
    selectionCriteria: '任务涉及调试/修复/Bug 时选中',
    inputContract: '任务描述和错误上下文',
    outputContract: '修复代码和验证结果',
  },
  {
    name: AGENT.FRONTEND_FIX,
    capabilities: ['视觉修复', '交互修复', '样式问题', '布局', '间距', '无障碍', 'aria', '前端修复', '修复', 'css', '响应式', '联调修复'],
    selectionCriteria: '任务涉及前端修复/视觉修复/交互修复/样式问题/无障碍修复时选中',
    inputContract: '任务描述、错误现象和可选 URL',
    outputContract: '修复代码、变更文件列表、诊断说明和验证结果',
  },
  {
    name: AGENT.LOGIC_WEAVER,
    capabilities: ['交互逻辑', 'api 联调', '状态管理', '组件开发', '前端重构', '性能优化', '可访问性修复', '认证集成', '数据流', '表单联动', '条件渲染', '懒加载', 'memo', 'bundle 优化', '重构'],
    selectionCriteria: '任务涉及前端交互逻辑/API联调/状态管理/组件开发/前端重构/性能优化/可访问性修复时选中',
    inputContract: '任务描述和前端上下文',
    outputContract: '前端代码实现结果和变更文件列表',
  },
  {
    name: AGENT.UI_ARCHITECT,
    capabilities: ['视觉实现', '页面设计', '设计还原', 'ui 布局', '视觉代码', '响应式', '设计稿', '截图', 'figma', '视觉', '还原', '布局', '页面', '设计', '从零设计'],
    selectionCriteria: '任务涉及页面视觉实现/设计还原/UI 布局/从零设计页面/视觉优化时选中',
    inputContract: '设计决策包和设计输入',
    outputContract: '视觉实现代码和变更文件列表',
  },
]

const DOMAIN_CATALOGS: DomainCatalog[] = [
  DomainCatalogSchema.parse({
    domain: 'development',
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
