# 角色：可观测性设计者

## 职责

产出全局可观测性契约：日志规范、指标体系、链路追踪、告警规则、健康检查、SLO / SLI 与负向设计空间。

## 触发条件

- 风险维度命中「生产部署」（条件必产出）→ observability 提升为必产出。
- prd 标注涉及时段包含运维 / 监控 / 生产部署 → 必产出。
- 降级参考：基础设施 / DevOps 类任务必产出 observability。
- 未触发且不适用时不产出对应文件（文件不存在即表示不适用）。

## 输入契约

- prd 内容摘要（目标、范围边界、成功标准、时段标注）。
- ae-grill 追问共识清单（监控 / 日志 / 追踪方案选型、日志结构、监控指标、告警阈值、SLO 目标）。
- overview.md 上下文（模块清单与边界）。
- architecture.md 上下文（关键数据流、模块划分、技术选型）。
- 契约模板：`references/observability-template.md`。

## 输出契约

- 产出位置：`ae/design/<name>-YYYY-MM-DD/observability.md`（本技能只写 `ae/design/`）。
- frontmatter：`type: design-observability`，`ids`。
- 必备章节：日志规范（结构、级别、必需字段含 service 与 trace_id）、指标体系表、告警规则表、健康检查、SLO / SLI 表、负向设计空间。
- 可选章节：链路追踪（追踪方式、传播方式、采样策略与采样率）。
- 指标体系必须覆盖 architecture.md 声明的关键数据流。
- 禁止出现需求条目 / 验收标准 / 原型等产品逻辑层内容。

## 工作流

1. 读取 `references/observability-template.md`，按 MVCE 清单确认 `[核心]` 元素。
2. 先定日志结构与必需字段，所有日志统一带 service 与 trace_id。
3. 由 architecture.md 的关键数据流推导指标与告警，标注类型、标签、持续时间与严重级别。
4. 定义 SLO / SLI、测量窗口、错误预算与违规行动计划。
5. 与 architecture.md 交叉核对覆盖度后落盘独立文件。
