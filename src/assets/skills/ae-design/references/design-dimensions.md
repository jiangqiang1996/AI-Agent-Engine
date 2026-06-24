# 设计维度契约模板

每个维度遵循**可还原契约标准**：任意 AI 据此能生成一致性产物。按 prd 时段标注自动触发必产出维度。

## 维度触发规则

`ae:design` 启动时根据 prd 的时段标注和任务特征自动触发必产出维度：

| 任务特征 | 必产出维度 | 选产出维度 |
|---------|-----------|-----------|
| 纯前端 UI 任务 | overview、ui-ux、test-cases | architecture、security |
| 纯后端 API 任务 | overview、api、architecture、test-cases | database、security、observability、non-functional |
| 全栈功能任务 | overview、ui-ux、api、architecture、database、test-cases | security、observability、non-functional |
| 数据迁移/重构任务 | overview、database、architecture、test-cases | api、observability |
| 基础设施/DevOps 任务 | overview、architecture、observability | security、non-functional |
| 非软件任务 | overview、test-cases | 按需 |

---

## 1. 设计总览（overview）

**触发条件：** 必产出
**产出位置：** 始终内联在 `design.md` 中，不拆分为子文件
**可还原性目标：** 任意 AI 据此理解整体设计意图和维度间关系

### 契约内容

```markdown
## 设计总览

### 设计读数
（一句话声明设计意图、任务类型和设计家族）

### 范围映射
（prd 需求条目 → design 维度的对应关系表）

| prd 需求 | 对应设计维度 | 契约位置 |
|---------|-------------|---------|
| 需求 1 | architecture, api | architecture.md, api.md |
| 需求 2 | ui-ux | ui-ux.md（或内联） |

### 产物清单
（本次产出的维度文件列表和状态）

| 维度 | 文件 | 状态 | 版本 |
|------|------|------|------|
| overview | design.md（内联） | unified/split | 1.0 |
| architecture | architecture.md（或内联） | unified/split | 1.0 |

### 契约版本
- 版本号：1.0（初始）或递增
- 前序版本：无（初始）或前序版本号
- 变更摘要：本次变更概述

### 跨维度依赖关系
（记录维度间的一致性约束）

| 源维度 | 目标维度 | 一致性约束 |
|--------|---------|-----------|
| api | database | 请求/响应字段必须与表字段对齐 |
| ui-ux | api | 数据展示必须与响应字段对齐 |

### 设计决策记录（ADR）
（记录关键设计决策和理由）

#### ADR-001: [决策标题]
- **状态：** 已采纳
- **背景：** [决策背景]
- **决策：** [具体决策]
- **理由：** [选择理由]
- **后果：** [预期后果]
```

---

## 2. UI/UX 设计（ui-ux）

**触发条件：** prd 标注涉及前端/UI
**产出文件：** `ui-ux.md`（或内联）
**可还原性目标：** 任意 AI 据此生成一致性页面和交互

### 契约内容

```markdown
## UI/UX 设计

### 设计读数
- 页面类型：[落地页/仪表盘/作品集/编辑/应用]
- 受众：[B2B采购团队/设计敏感消费者/招聘者]
- 氛围：[极简/活泼/高端消费品/暗色科技]
- DESIGN_VARIANCE: [1-10]
- MOTION_INTENSITY: [1-10]
- VISUAL_DENSITY: [1-10]

### 信息架构
（页面树状结构、导航层级、主要入口）

### 页面流
（用户主要路径、状态转换图）

### 页面规格

#### 页面 1: [页面名]
- 布局家族：[Asymmetric Split / Bento Grid / Editorial Split]
- 段落顺序：[Hero → Features → CTA]
- Hero 规格：[标题/副文本/CTA 配置]
- CTA 配置：[主 CTA + 最多 1 个次 CTA]
- 移动端折叠：[< 768px 回退规则]

### 组件清单

| 组件名 | Props 契约 | 状态机 | 变体 | 复用位置 |
|--------|-----------|--------|------|---------|
| Button | variant, size, onClick | idle→loading→success | primary, secondary | 全局 |
| Card | title, children | - | default, highlighted | 列表页 |

### 设计 Token

#### 色彩
- 背景：[#hex]
- 前景：[#hex]
- 强调色：[#hex]（仅 1 个）
- 中性色阶：[#hex 阶梯]

#### 字号阶
- 展示：[text-4xl md:text-6xl]
- 正文：[text-base]
- 辅助：[text-sm]

#### 间距阶
- 段落间距：[py-24 to py-40]
- 组件间距：[gap-6]

#### 圆角
- 统一系统：[全锐角 / 全柔和 12-16px / 全药丸]

### 交互状态机

| 组件 | 状态 | 过渡动画 | 减少动效回退 |
|------|------|---------|-------------|
| Button | idle→loading→success→error | scale(0.98) | 即时切换 |
| Form | empty→filling→submitting→error | opacity fade | 无动画 |

### 响应式断点

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| sm | 640px | [变化规则] |
| md | 768px | [变化规则] |
| lg | 1024px | [变化规则] |

### 无障碍要求
- 对比度：[WCAG AA/AAA]
- 焦点环：[最低 2px 实线]
- aria 标注：[图标按钮 aria-label]
- 键盘导航：[Tab 顺序、快捷键]

### 视觉参考
- 参考产品：[产品名和具体参考点]
- 氛围关键词：[关键词列表]
- 禁止模式：[AI Tell 黑名单]
```

---

## 3. 架构设计（architecture）

**触发条件：** prd 标注涉及结构调整/新模块
**产出文件：** `architecture.md`（或内联）
**可还原性目标：** 任意 AI 据此理解模块职责和依赖关系，不破坏边界

### 契约内容

```markdown
## 架构设计

### 系统上下文图
（ASCII 图或结构化描述：系统与外部系统的边界和交互）

### 模块边界

| 模块名 | 职责 | 对外接口 | 依赖模块 |
|--------|------|---------|---------|
| [模块名] | [职责描述] | [接口列表] | [依赖列表] |

### 依赖方向
（允许的依赖方向，禁止的循环依赖）

### 分层规则
（如：Controller → Service → Repository → Model）

### 数据流
（主要数据流路径：从输入到输出）

### 部署拓扑
（服务部署关系、网络拓扑）

### 技术选型理由

| 决策点 | 选项 | 选择 | 理由 |
|--------|------|------|------|
| [决策点] | [选项列表] | [选择] | [理由] |

### 架构决策记录（ADR）
（关键架构决策，与 overview 的 ADR 对齐或补充）
```

---

## 4. 接口设计（api）

**触发条件：** prd 标注涉及 API/服务间通信
**产出文件：** `api.md`（或内联）
**可还原性目标：** 任意 AI 据此生成一致性的接口实现和客户端调用

### 契约内容

```markdown
## 接口设计

### OpenAPI 风格接口契约

### 端点清单

| 方法 | 路径 | 描述 | 认证 | 幂等 |
|------|------|------|------|------|
| POST | /api/v1/resources | 创建资源 | Bearer | 否 |
| GET | /api/v1/resources/{id} | 获取资源 | Bearer | 是 |

### 请求/响应 Schema

#### POST /api/v1/resources

请求：
```json
{
  "name": "string (required, max 100)",
  "type": "enum: [A, B, C] (required)"
}
```

响应（201）：
```json
{
  "id": "uuid",
  "name": "string",
  "type": "enum: [A, B, C]",
  "created_at": "ISO 8601"
}
```

### 认证授权
- 认证方式：[Bearer Token / OAuth 2.0 / API Key]
- 授权模型：[RBAC / ABAC]
- 权限矩阵：[角色 × 资源 → 操作]

### 错误码体系

| HTTP 状态 | 错误码 | 描述 | 处理建议 |
|-----------|--------|------|---------|
| 400 | INVALID_INPUT | 请求参数无效 | 检查字段格式 |
| 401 | UNAUTHORIZED | 未认证 | 刷新 Token |
| 403 | FORBIDDEN | 无权限 | 联系管理员 |
| 404 | NOT_FOUND | 资源不存在 | 检查 ID |
| 409 | CONFLICT | 资源冲突 | 检查唯一约束 |
| 500 | INTERNAL | 服务器错误 | 重试或联系支持 |

### 版本策略
- 当前版本：v1
- 版本位置：[URL 路径 / Header]
- 废弃策略：[时间线和通知机制]

### 幂等性
- 幂等端点：[GET, PUT, DELETE]
- 非幂等端点：[POST]
- 幂等键机制：[如适用]

### 限流
- 速率限制：[N req/s per user]
- 超限响应：429 + Retry-After
- 突发配额：[如适用]

### 接口分组与资源模型
（按业务域分组的端点集合和资源关系）
```

---

## 5. 数据库设计（database）

**触发条件：** prd 标注涉及数据层/持久化
**产出文件：** `database.md`（或内联）
**可还原性目标：** 任意 AI 据此生成一致性的 schema 和迁移脚本

### 契约内容

```markdown
## 数据库设计

### ER 模型
（实体关系图：ASCII 图或结构化描述）

### 表结构

#### 表: [table_name]

| 字段名 | 类型 | 约束 | 索引 | 描述 |
|--------|------|------|------|------|
| id | UUID | PK | 是 | 主键 |
| name | VARCHAR(100) | NOT NULL | 是 | 资源名称 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | - | 创建时间 |

### 关系与外键

| 源表.字段 | 目标表.字段 | 级联规则 |
|-----------|------------|---------|
| orders.user_id | users.id | ON DELETE CASCADE |

### 范式决策
- 范式级别：[3NF / BCNF / 反范式]
- 反范式理由：[如适用，性能优化理由]

### 迁移策略
- 初始迁移：[schema 创建]
- 数据迁移：[如适用，迁移脚本策略]
- 回滚策略：[down 迁移]

### 种子数据
（必需的初始数据：角色、配置项、枚举值等）

### 分库分表规则
（如适用：分片键、分片策略、跨分片查询处理）

### 数据生命周期
- 保留策略：[TTL / 归档 / 永久]
- 归档规则：[如适用]
- 清理策略：[如适用]

### 敏感字段标注

| 表.字段 | 敏感级别 | 保护措施 |
|---------|---------|---------|
| users.email | PII | 加密存储 |
| users.password_hash | 凭证 | bcrypt + salt |
| audit_logs.payload | 审计 | 不可篡改 |
```

---

## 6. 测试用例设计（test-cases）

**触发条件：** 必产出
**产出文件：** `test-cases.md`（或内联）
**可还原性目标：** 任意 AI 据此生成一致性的测试代码且覆盖度可验证

### 契约内容

```markdown
## 测试用例设计

### 覆盖矩阵
（需求 × 场景 × 边界 的交叉覆盖表）

| 需求 | 正常场景 | 边界场景 | 异常场景 |
|------|---------|---------|---------|
| 需求 1 | TC-001 | TC-005 | TC-008 |
| 需求 2 | TC-002 | TC-006 | TC-009 |

### 用例分级

#### P0 - 阻断级（必须覆盖）

| 用例 ID | 场景 | 前置条件 | 步骤 | 预期结果 | 断言要点 |
|---------|------|---------|------|---------|---------|
| TC-001 | 创建资源 | 已认证 | POST /resources | 201 + 资源对象 | id 非空, name 匹配 |

#### P1 - 重要级

| 用例 ID | 场景 | 前置条件 | 步骤 | 预期结果 | 断言要点 |
|---------|------|---------|------|---------|---------|
| TC-005 | 名称超长 | 已认证 | POST /resources (name 101字符) | 400 + INVALID_INPUT | 错误码匹配 |

#### P2 - 一般级

（用例表同上格式）

#### P3 - 可选级

（用例表同上格式）

### 断言要点
（每个用例的关键断言，不写实际代码，只描述断言意图）

### UI 测试用例（映射 ui-ux 状态机）

| 状态机路径 | 用例 ID | 断言要点 |
|-----------|---------|---------|
| idle → loading → success | TC-UI-001 | Loading 态显示, 成功后数据渲染 |
| idle → loading → error | TC-UI-002 | 错误提示显示, 可重试 |

### 验收映射（映射 prd 成功标准）

| prd 成功标准 | 对应用例 | 验证方式 |
|-------------|---------|---------|
| 用户可创建资源 | TC-001 | API 测试 |
| 表单验证友好 | TC-005, TC-006 | UI 测试 |

### 测试数据策略
- 测试数据生成：[Factory / Fixture / 随机]
- 数据隔离：[事务回滚 / 独立数据库 / 命名空间]
- 敏感数据：[脱敏 / 模拟]
```

---

## 7. 安全设计（security）

**触发条件：** prd 标注涉及安全边界/认证授权/敏感数据
**产出文件：** `security.md`（或内联）
**可还原性目标：** 任意 AI 据此实现不引入安全漏洞的代码

### 契约内容

```markdown
## 安全设计

### 威胁模型
（STRIDE 分析：Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege）

| 威胁类型 | 攻击场景 | 缓解措施 |
|---------|---------|---------|
| Spoofing | 伪造身份 | OAuth 2.0 + MFA |
| Tampering | 篡改数据 | HMAC 签名 + 审计日志 |

### 信任边界
（系统内外的信任域划分和边界验证点）

### 认证授权流程
（认证流程图、授权决策点、Token 生命周期）

### 数据分级与保护

| 数据级别 | 示例 | 存储保护 | 传输保护 | 访问控制 |
|---------|------|---------|---------|---------|
| 公开 | 公告 | 无 | HTTPS | 无 |
| 内部 | 用户名 | 加密 | HTTPS | 认证 |
| 机密 | 密码 | bcrypt | HTTPS | 认证+授权 |
| 绝密 | 密钥 | KMS | mTLS | 最小权限 |

### 密钥管理
- 存储方式：[环境变量 / KMS / Vault]
- 轮换策略：[周期]
- 访问控制：[最小权限原则]

### 输入验证策略
- 验证位置：[边界层 / 服务层]
- 验证规则：[白名单优先 / 长度限制 / 格式校验]
- 输出编码：[上下文相关编码]

### 审计日志要求
- 记录事件：[认证/授权/数据变更/管理操作]
- 日志内容：[who, what, when, where, result]
- 不可篡改：[追加写入 / 签名]

### 合规约束
- 适用法规：[GDPR / HIPAA / 等保 / PCI-DSS]
- 合规要求：[具体要求列表]
```

---

## 8. 可观测性设计（observability）

**触发条件：** prd 标注涉及运维/监控/生产部署
**产出文件：** `observability.md`（或内联）
**可还原性目标：** 任意 AI 据此实现一致性的日志/监控/告警代码

### 契约内容

```markdown
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

---

## 9. 非功能设计（non-functional）

**触发条件：** prd 标注涉及性能/并发/事务/容量
**产出文件：** `non-functional.md`（或内联）
**可还原性目标：** 任意 AI 据此实现满足非功能指标的代码

### 契约内容

```markdown
## 非功能设计

### 性能目标

| 指标 | 目标值 | 测量条件 |
|------|--------|---------|
| 响应延迟 p50 | < 100ms | 正常负载 |
| 响应延迟 p99 | < 500ms | 正常负载 |
| 吞吐量 | 1000 req/s | 峰值 |

### 并发模型与锁策略
- 并发模型：[线程池 / 事件循环 / Actor]
- 锁策略：[乐观锁 / 悲观锁 / 无锁]
- 死锁预防：[锁顺序 / 超时]

### 事务边界与隔离级别
- 事务边界：[操作范围]
- 隔离级别：[READ COMMITTED / REPEATABLE READ / SERIALIZABLE]
- 超时策略：[事务超时时间]

### 缓存策略

| 缓存层 | 存储内容 | TTL | 失效策略 |
|--------|---------|-----|---------|
| L1 (内存) | 热点数据 | 60s | LRU |
| L2 (Redis) | 会话数据 | 30min | TTL |

### 容量规划
- 初始容量：[QPS / 存储量 / 连接数]
- 扩容触发：[阈值]
- 扩容方式：[水平 / 垂直]

### 资源限制
- CPU 限制：[核数]
- 内存限制：[GB]
- 磁盘限制：[GB]
- 网络限制：[带宽]
```
