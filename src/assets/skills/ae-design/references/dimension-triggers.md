# 维度触发规则

`ae:design` 启动时根据 prd 的时段标注和风险维度确定必产出维度。触发逻辑分为全局维度触发和模块维度触发两层。

## 全局维度触发（按风险维度）

全局维度触发决定设计目录根下必须产出的全局独立文件。主触发逻辑基于风险维度。

| 风险维度 | 触发条件 | 必产出全局文件 | 条件必产出规则 |
|---------|---------|--------------|--------------|
| 不可逆决策 | API 签名/schema/认证模型变更 | architecture、security | - |
| 结构性变更 | 新增模块/跨模块依赖/公共配置 | overview、architecture | - |
| 用户界面变更 | 页面/交互/组件变更 | design-spec | - |
| 生产部署 | 涉及生产环境部署或变更 | observability | - |
| 性能敏感 | 涉及性能敏感逻辑（高并发/大数据量/实时性） | non-functional | - |

### 显式否定机制

对于未触发且不适用的全局维度，不产出对应文件即可。文件不存在即表示该维度不适用。

### 降级参考表（仅在风险信号无法识别时使用）

| 任务特征 | 必产出全局文件 | 选产出全局文件 |
|---------|--------------|--------------|
| 纯前端 UI 任务 | overview、design-spec | architecture、security |
| 纯后端 API 任务 | overview、architecture | security、observability、non-functional |
| 全栈功能任务 | overview、design-spec、architecture | security、observability、non-functional |
| 数据迁移/重构任务 | overview、architecture | observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview | 按需 |

## 模块维度触发（按模块内特征）

模块维度触发决定每个 `modules/<NN>-<m>/` 子目录中必须产出的独立维度文件。每个模块根据其涉及的特征独立触发。

| 模块内特征 | 触发维度文件 | 产出位置 | 说明 |
|-----------|---------|---------|------|
| 涉及 API 端点 | api.md | `modules/<NN>-<m>/api.md` | 端点清单、OpenAPI 规格、认证、错误码 |
| 涉及持久化 | database.md | `modules/<NN>-<m>/database.md` | ER 模型、DDL、迁移策略、敏感字段 |
| 涉及 UI | ui-ux.md + pages/ | `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/` | 页面设计、组件、状态机、设计 Token |
| 涉及测试 | test-cases.md | `modules/<NN>-<m>/test-cases.md` | 覆盖矩阵、用例、行为契约 |

### 模块章节组合规则

- 每个模块至少产出 1 个维度文件（空模块不产出文件）
- 各维度独立产出为独立文件
- 模块未涉及的特征对应的维度文件省略，不产出空文件

### 模块清单确定

模块清单在 `overview.md` 模块清单与边界 中声明。每个模块根据 prd 需求条目映射确定其涉及的维度：

| prd 需求 | 映射模块 | 触发维度文件 |
|---------|---------|---------|
| 用户登录注册 | auth | api.md, database.md, ui-ux.md, test-cases.md |
| 资源 CRUD | resource | api.md, database.md, ui-ux.md, test-cases.md |
| 操作审计 | audit | database.md, test-cases.md |

## 维度清单与模板索引

| 维度 | 模板文件 | 产出位置 |
|------|---------|---------|
| overview | `overview-template.md` | `overview.md` |
| architecture | `architecture-template.md` | `architecture.md` |
| design-spec | `ui-ux-template.md`（设计规范部分） | `design-spec.md`（由 `@ui-designer` mode=spec 产出） |
| 跨模块映射 | `cross-dimension-mapping.md` | `cross-mapping.md` |
| 模块 api | `api-template.md` | `modules/<NN>-<m>/api.md` |
| 模块 database | `database-template.md` | `modules/<NN>-<m>/database.md` |
| 模块 ui-ux | `ui-ux-template.md` | `modules/<NN>-<m>/ui-ux.md` + `modules/<NN>-<m>/pages/` |
| 模块 test-cases | `test-cases-template.md` | `modules/<NN>-<m>/test-cases.md` |
| security | `security-template.md` | `security.md` |
| observability | `observability-template.md` | `observability.md` |
| non-functional | `non-functional-template.md` | `non-functional.md` |
