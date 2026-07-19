# 可观测性设计维度契约模板

**触发条件：** prd 标注涉及运维/监控/生产部署，或风险维度命中"生产部署"（条件必产出）
**产出文件：** `observability/observability.md`（默认单文件，≤ 300 行；超 300 行自动拆分为 `observability/01-observability.md` 索引 + `observability/NN-<topic>.md` 分组实体，topic 如 logging/metrics/alerting/slo）
**产出方：** `@observability-designer` 子代理
**可还原性目标：** 任意 AI 据此实现一致性的日志/监控/告警代码

## 产出方式

**默认单文件产出（1 次调用）。** observability 维度内容通常紧凑，默认产出单文件 `observability/observability.md`。

**自动拆分机制：** 当 observability 内容预计超 300 行时（多服务系统指标/告警规则/SLO 定义较多），索引层子代理在 file-plan 中预先声明拆分方案，阶段 2 直接按子主题分组产出多个文件（生成时拆分，非先生成大文件再拆分）：
- 索引文件 `observability/01-observability.md`：日志规范概览 + 指标体系概览 + 链路追踪概览 + 告警规则概览 + 健康检查概览 + SLO/SLI 概览 + 负向设计空间 + file-plan
- 分组实体文件 `observability/NN-<topic>.md`：按子主题分组（如 `02-logging.md`、`03-metrics.md`、`04-tracing.md`、`05-alerting.md`、`06-health.md`、`07-slo.md`）

拆分判定：索引层子代理评估内容规模，预计超 300 行时在 file-plan 中声明拆分；已产出文件即时校验，超 300 行打回重新按子主题分组生成，最多重试 2 次。

## 契约元素（MVCE）

observability 维度的最小可验证契约元素集，标注 `[核心]` 或 `[可选]`：

- `[核心]` **日志规范**：结构、级别、必需字段
- `[核心]` **指标体系表**：指标名、类型、标签、描述
- `[可选]` **链路追踪**：追踪方式、传播方式、采样策略
- `[核心]` **告警规则表**：告警名、条件、持续时间、严重级别、通知方式
- `[核心]` **健康检查**：端点、检查项
- `[核心]` **SLO/SLI 表**：SLI、目标 SLO、测量窗口、错误预算
- `[核心]` **负向设计空间**：禁止的可观测性模式

轻量级任务可省略 `[可选]` 元素。

## 契约内容

```markdown
---
type: design-shard
status: active
section: "observability"
parent: "design.md"
module: "observability"
layer: index
heading_chain: "设计契约 > 可观测性设计"
---

## 可观测性设计

### 日志规范
- 结构：[JSON 结构化]
- 级别：[DEBUG / INFO / WARN / ERROR / FATAL]
- 必需字段：[timestamp, level, request_id, user_id, action, result]

### 指标体系

| 指标名 | 类型 | 标签 | 描述 |
|--------|------|------|------|
| http_requests_total | Counter | method, path, status | HTTP 请求总数 |
| http_request_duration | Histogram | method, path | HTTP 请求延迟 |

### 链路追踪
- 追踪方式：[OpenTelemetry / Jaeger]
- 传播方式：[W3C Trace Context]
- 采样策略：[头部采样 / 尾部采样]

### 告警规则

| 告警名 | 条件 | 持续时间 | 严重级别 | 通知方式 |
|--------|------|---------|---------|---------|
| HighErrorRate | error_rate > 5% | 5min | P1 | PagerDuty |
| HighLatency | p99 > 500ms | 10min | P2 | Slack |

### 健康检查
- 端点：[/health, /ready]
- 检查项：[数据库连接, 缓存连接, 依赖服务]

### SLO/SLI 定义

| SLI | 目标 SLO | 测量窗口 | 错误预算 |
|-----|---------|---------|---------|
| 可用性 | 99.9% | 30天 | 43m |
| 延迟 p99 | < 500ms | 30天 | 43m |
```

## 负向设计空间

observability 维度的禁止模式：

- **禁止日志泄漏敏感数据**：日志不得记录密码、Token、密钥、PII 数据
- **禁止无 request_id 的日志**：所有日志必须包含 request_id，便于链路追踪
- **禁止无告警阈值的监控**：指标必须配置告警阈值，不得只收集不告警
- **禁止静默失败**：错误必须记录日志，不得 try-catch 后静默吞掉
- **禁止健康检查仅返回 200**：健康检查必须检查依赖项（数据库、缓存、外部服务）
