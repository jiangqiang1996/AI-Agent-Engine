# 可观测性设计维度契约模板

**触发条件：** prd 标注涉及运维/监控/生产部署，或风险维度命中"生产部署"（条件必产出）
**产出位置：** `observability.md`
**产出方：** 通用 omp task 子代理（observability 设计 persona，prompt 按本模板构建）
**可还原性目标：** 任意 AI 据此实现一致性的日志/监控/告警代码

## 产出方式

**独立文件产出（1 次调用）。** observability 维度内容产出为 `observability.md` 独立文件。

## 契约元素（MVCE）

observability 维度的最小可验证契约元素集，标注 `[核心]` 或 `[可选]`：

- `[核心]` **日志规范**：结构、级别、必需字段（含 service、trace_id）
- `[核心]` **指标体系表**：指标名、类型、标签、描述（含 Gauge 类型和业务关键路径指标）
- `[可选]` **链路追踪**：追踪方式、传播方式、采样策略、采样率/条件、request_id 与 trace_id 关系
- `[核心]` **告警规则表**：告警名、条件、持续时间、严重级别、通知方式（含 P0 可用性 SLO 告警和抑制分组规则）
- `[核心]` **健康检查**：Liveness 探针、Readiness 探针、检查项、失败行为
- `[核心]` **SLO/SLI 表**：SLI、目标 SLO、测量窗口、错误预算、违规行动计划
- `[核心]` **负向设计空间**：禁止的可观测性模式（含高基数标签禁令和 SLO 行动计划禁令）

轻量级任务可省略 `[可选]` 元素。

## 契约内容

```markdown
---
type: design-observability
ids: [SLO-001, SLO-002]
---

## 可观测性设计

### 日志规范
- 结构：[JSON 结构化]
- 级别：[DEBUG / INFO / WARN / ERROR / FATAL]
- 必需字段：[timestamp, level, service, request_id, trace_id, user_id, action, result]

### 指标体系

| 指标名 | 类型 | 标签 | 描述 |
|--------|------|------|------|
| http_requests_total | Counter | method, path, status | HTTP 请求总数 |
| http_request_duration | Histogram | method, path | HTTP 请求延迟 |
| active_connections | Gauge | service | 活跃连接数 |
| [业务关键路径指标] | [Counter/Histogram/Gauge] | [标签] | [业务描述，如订单创建数、支付成功率] |

### 链路追踪
- 追踪方式：[OpenTelemetry / Jaeger]
- 传播方式：[W3C Trace Context]
- 采样策略：[头部采样 / 尾部采样]
- 采样率/条件：[如 10% 头部采样，或延迟 > 500ms 必采样尾部采样]
- request_id 与 trace_id 关系：[request_id 为请求级唯一标识，trace_id 为跨服务链路标识；单服务内 request_id 可等于 trace_id，跨服务时 trace_id 传播到下游]

### 告警规则

| 告警名 | 条件 | 持续时间 | 严重级别 | 通知方式 |
|--------|------|---------|---------|---------|
| HighErrorRate | error_rate > 5% | 5min | P1 | PagerDuty |
| HighLatency | p99 > 500ms | 10min | P2 | Slack |
| LowAvailability | success_rate < 99.9% | 5min | P0 | PagerDuty |
| [业务告警] | [条件] | [持续时间] | [P0/P1/P2/P3] | [通知方式] |

告警抑制与分组规则：[如级联故障时抑制非根因告警，按 service + severity 分组]

### 健康检查
- Liveness 探针：[/health] — 检查进程存活，不检查依赖项（避免误重启）
- Readiness 探针：[/ready] — 检查依赖项（数据库连接、缓存连接、依赖服务），失败时从负载均衡摘除
- 失败行为：Liveness 失败 → 触发重启；Readiness 失败 → 摘除流量

### SLO/SLI 定义

| SLI | 目标 SLO | 测量窗口 | 错误预算 | 违规行动计划 |
|-----|---------|---------|---------|------------|
| 可用性 | 99.9% | 30天 | 43m | 错误预算耗尽时冻结功能开发，工程资源转向可靠性修复 |
| 延迟 p99 | < 500ms | 30天 | 43m | 错误预算耗尽时降低发布频率，优先修复延迟瓶颈 |
```

## 负向设计空间

observability 维度的禁止模式：

- **禁止日志泄漏敏感数据**：日志不得记录密码、Token、密钥、PII 数据
- **禁止无 request_id 的日志**：所有日志必须包含 request_id，便于链路追踪
- **禁止无告警阈值的监控**：指标必须配置告警阈值，不得只收集不告警
- **禁止静默失败**：错误必须记录日志，不得 try-catch 后静默吞掉
- **禁止健康检查仅返回 200**：健康检查必须检查依赖项（数据库、缓存、外部服务）
- **禁止高基数标签**：禁止将 user_id、request_id 等高基数值作为指标标签，防止指标爆炸
- **禁止无行动计划的 SLO**：SLO 必须定义错误预算耗尽时的行动计划，不得只设目标不设响应


## 维度子代理执行清单

> 本清单由 AE observability 维度专精代理正文合并而来。维度子代理不注册为 omp 代理：派通用 omp task 子代理，prompt = 本模板全文 + 需求上下文，outputSchema 收结构化产物摘要（files / coreElements / optionalElements / stableIds / mappingRows / crossDimensionDeps / lineCount）。

### 输入上下文

- **prd 内容摘要**：需求条目、目标、范围边界、时段标注、运维相关需求
- **深度追问结果**：已确认的可观测性相关设计决策（日志结构、监控指标、告警阈值）
- **overview 上下文**：设计读数、范围映射、跨维度依赖关系
- **跨维度依赖**：architecture 维度的错误传播链、api 维度的错误码

### 执行步骤

1. 读取本模板获取契约元素清单和内容模板，结合 prd 需求、深度追问结果、architecture 维度的错误传播链和 api 维度的错误码，确定本维度需要产出的契约元素。
2. 按模板产出 `observability.md` 独立文件。
3. 返回产出摘要：产出文件路径、契约元素完成情况（核心/可选）、跨维度依赖关系（与 architecture/api 的一致性约束）、行数统计。

> observability 维度不直接贡献跨维度映射表行项，返回跨维度依赖关系供主代理记录即可。

### 关键约束

- 日志规范必须与 architecture 维度的错误传播链对齐
- 指标体系必须覆盖 api 维度的关键端点
- 告警规则必须指明具体条件和持续时间
- 健康检查必须检查依赖项（数据库、缓存、外部服务）
- SLO/SLI 必须量化（如 99.9% 可用性）
- 遵守 observability 维度的负向设计空间


### 边界

- 只产出本维度的设计契约，不产出其他维度
- 不写实现代码
- 不执行 Git 操作
- 不修改代码库文件（除产出 `observability.md` 独立文件 外）


### 范围严格性约束（硬约束）

- 严格按需求范围产出，禁止镀金
- 需求没有提及的一律不产出
- 即使某特性达不到最佳实践，如果需求没提及，不做
- 只产出需求中已明确提及的内容对应的设计契约
- 不主动添加需求未提及的功能、抽象、配置项或防御逻辑
- 维度触发不等于必须产出全部模板内容 - 只产出需求已提及的部分
