# 维度触发规则

`ae:design` 启动时根据 prd 的时段标注和**风险维度**确定必产出维度。主触发逻辑基于风险维度，原"任务特征"表仅在风险信号无法识别时作为降级参考。

## 风险维度主触发规则

| 风险维度 | 触发条件 | 必产出维度 | 条件必产出规则 |
|---------|---------|-----------|--------------|
| 不可逆决策 | API 签名/schema/认证模型变更 | api、database、security | - |
| 结构性变更 | 新增模块/跨模块依赖/公共配置 | overview、architecture | - |
| 用户界面变更 | 页面/交互/组件变更 | overview、design-spec、ui-ux、test-cases | - |
| 数据持久化 | 新建表/字段变更/迁移 | overview、database、test-cases | - |
| 用户数据输入 | 涉及用户提交数据 | - | security 提升为必产出 |
| 生产部署 | 涉及生产环境部署或变更 | - | observability 提升为必产出 |
| 性能敏感 | 涉及性能敏感逻辑（高并发/大数据量/实时性） | - | non-functional 提升为必产出 |

## 显式否定机制

对于未触发且不适用的维度，必须显式否定（`<维度名>: explicitly-omitted`），消除"默认值黑洞"。必产出维度不得使用显式否定。

- 格式：`<维度名>: explicitly-omitted`
- 含义：该维度不是本设计关注点，使用最简默认实现，不产出独立契约
- 必产出维度不得使用显式否定；显式否定需在 overview 的范围映射中记录理由

## 降级参考表（仅在风险信号无法识别时使用）

| 任务特征 | 必产出维度 | 选产出维度 |
|---------|-----------|-----------|
| 纯前端 UI 任务 | overview、ui-ux、test-cases | architecture、security |
| 纯后端 API 任务 | overview、api、architecture、test-cases | database、security、observability、non-functional |
| 全栈功能任务 | overview、ui-ux、api、architecture、database、test-cases | security、observability、non-functional |
| 数据迁移/重构任务 | overview、database、architecture、test-cases | api、observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview、test-cases | 按需 |

## 维度清单与模板索引

每个维度有独立的模板文件，位于 `references/` 目录：

| 维度 | 模板文件 | 子代理 | 产出文件 | 始终内联 |
|------|---------|--------|---------|---------|
| overview | `overview-template.md` | 主代理产出 | `design.md`（内联） | 是 |
| design-spec | 无（透传维度） | `@ui-design-spec` | N/A（透传） | N/A（透传） |
| ui-ux | `ui-ux-template.md` | `@ui-ux-designer` | `ui-ux/ui-ux.md` | 否 |
| architecture | `architecture-template.md` | `@architecture-designer` | `architecture/architecture.md` | 否 |
| api | `api-template.md` | `@api-designer` | `api/api.md` | 否 |
| database | `database-template.md` | `@database-designer` | `database/database.md` | 否 |
| test-cases | `test-cases-template.md` | `@test-cases-designer` | `test-cases/test-cases.md` | 否 |
| security | `security-template.md` | `@security-designer` | `security/security.md` | 否 |
| observability | `observability-template.md` | `@observability-designer` | `observability/observability.md` | 否 |
| non-functional | `non-functional-template.md` | `@non-functional-designer` | `non-functional/non-functional.md` | 否 |

跨维度映射表模板见 `references/cross-dimension-mapping.md`，始终内联在 `design.md` 中。
