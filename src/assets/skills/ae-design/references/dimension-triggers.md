# 维度触发规则

`ae:design` 启动时根据 prd 的时段标注和风险维度确定必产出维度。触发逻辑分为全局维度触发和模块维度触发两层。

## 全局维度触发（按风险维度）

全局维度触发决定 `global.md` 中必须产出的全局章节。主触发逻辑基于风险维度。

| 风险维度 | 触发条件 | 必产出全局章节 | 条件必产出规则 |
|---------|---------|--------------|--------------|
| 不可逆决策 | API 签名/schema/认证模型变更 | architecture、security | - |
| 结构性变更 | 新增模块/跨模块依赖/公共配置 | overview、architecture | - |
| 用户界面变更 | 页面/交互/组件变更 | design-spec | - |
| 生产部署 | 涉及生产环境部署或变更 | observability | - |
| 性能敏感 | 涉及性能敏感逻辑（高并发/大数据量/实时性） | non-functional | - |

### 显式否定机制

对于未触发且不适用的全局维度，必须显式否定（`<维度名>: explicitly-omitted`），消除"默认值黑洞"。必产出维度不得使用显式否定。

- 格式：`<维度名>: explicitly-omitted`
- 含义：该维度不是本设计关注点，使用最简默认实现，不产出独立契约
- 必产出维度不得使用显式否定；显式否定需在 global.md 的设计读数中记录理由

### 降级参考表（仅在风险信号无法识别时使用）

| 任务特征 | 必产出全局章节 | 选产出全局章节 |
|---------|--------------|--------------|
| 纯前端 UI 任务 | overview、design-spec | architecture、security |
| 纯后端 API 任务 | overview、architecture | security、observability、non-functional |
| 全栈功能任务 | overview、design-spec、architecture | security、observability、non-functional |
| 数据迁移/重构任务 | overview、architecture | observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview | 按需 |

## 模块维度触发（按模块内特征）

模块维度触发决定每个 `modules/<m>.md`（或拆分后的子文件）中必须产出的章节。每个模块根据其涉及的特征独立触发。

| 模块内特征 | 触发章节 | 产出位置 | 说明 |
|-----------|---------|---------|------|
| 涉及 API 端点 | §API {#api} | `modules/<m>.md` 或 `modules/<m>/module.md` | 端点清单、OpenAPI 规格、认证、错误码 |
| 涉及持久化 | §Database {#database} | `modules/<m>.md` 或 `modules/<m>/module.md` | ER 模型、DDL、迁移策略、敏感字段 |
| 涉及 UI | §UI/UX {#ui-ux} | `modules/<m>.md` 或 `modules/<m>/ui-ux.md` | 页面设计、组件、状态机、设计 Token |
| 涉及测试 | §Test Cases {#test-cases} | `modules/<m>.md` 或 `modules/<m>/test-cases.md` | 覆盖矩阵、用例、行为契约 |

### 模块章节组合规则

- 每个模块至少产出 1 个章节（空模块不产出文件）
- §API 和 §Database 通常高内聚，合并产出到 `module.md`
- §UI/UX 和 §Test Cases 独立产出（拆分模式）或作为章节合并（单文件模式）
- 模块未涉及的特征对应的章节显式省略，不产出空章节

### 模块清单确定

模块清单在 `global.md` §模块清单与边界 中声明。每个模块根据 prd 需求条目映射确定其涉及的章节：

| prd 需求 | 映射模块 | 触发章节 |
|---------|---------|---------|
| 用户登录注册 | auth | §API, §Database, §UI/UX, §Test Cases |
| 资源 CRUD | resource | §API, §Database, §UI/UX, §Test Cases |
| 操作审计 | audit | §Database, §Test Cases |

## 维度清单与模板索引

| 维度 | 模板文件 | 产出位置 |
|------|---------|---------|
| global（设计读数+架构+跨模块映射） | `overview-template.md` + `architecture-template.md` | `global.md` |
| 跨模块映射 | `cross-dimension-mapping.md` | `global.md` §跨模块映射 |
| 模块 §API | `api-template.md` | `modules/<m>.md` 或 `modules/<m>/module.md` |
| 模块 §Database | `database-template.md` | `modules/<m>.md` 或 `modules/<m>/module.md` |
| 模块 §UI/UX | `ui-ux-template.md` | `modules/<m>.md` 或 `modules/<m>/ui-ux.md` |
| 模块 §Test Cases | `test-cases-template.md` | `modules/<m>.md` 或 `modules/<m>/test-cases.md` |
| 全局 §安全 | `security-template.md` | `global.md` §安全 |
| 全局 §可观测性 | `observability-template.md` | `global.md` §可观测性 |
| 全局 §非功能 | `non-functional-template.md` | `global.md` §非功能 |
