import {
  AGENT,
  DomainCatalogSchema,
  type DomainCatalog,
  type SpecialistDef,
} from '../schemas/ae-asset-schema.js'

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
