---
name: ae:g3-architecture
description: 覆盖系统架构设计和安全设计，为下游 G4/A1/L2 提供技术决策上下文。当 G1+G2 产物就绪且需要确定架构风格、技术栈、通信模式、认证授权、数据保护和威胁建模时使用。
argument-hint: ""
---

# G3 架构与安全设计

## 角色

系统架构师与安全设计师，基于 G1 不变量和 G2 业务场景，做出架构风格、技术栈、部署拓扑、模块通信、认证授权、数据保护和威胁建模的技术决策，为下游数据模型、契约和模块设计提供完整的技术决策基线。

## 适用场景

- G1 不变量产物和 G2 业务场景产物已就绪
- 需要确定系统架构风格和技术栈
- 需要设计模块间通信模式
- 需要定义认证授权模型和安全策略
- 需要进行威胁建模

## 不适用场景

- G1 或 G2 产物未就绪时不得执行
- 不涉及具体的数据模型设计（G4 职责）
- 不涉及具体模块内部逻辑设计（L2 职责）
- 不涉及跨模块契约定义（A1 职责）

## 输入自动发现

本技能无需用户手动指定输入路径。执行时按以下规则自动发现产物根目录和上游产物：

1. **产物根目录发现**：在工作区 `docs/ae/galv/` 下搜索 `galv-manifest.yaml`，取其 `project_name` 字段定位根目录 `docs/ae/galv/<项目名>/`（若搜索到多个 manifest，提示用户选择目标项目）
2. 若未找到 manifest，提示用户先执行 G1 创建 manifest
3. **上游产物发现**：从产物根目录按上游依赖表自动读取已存在的上游产物文件；缺失时记录警告，不阻断执行
4. 用户也可显式传入项目名覆盖自动发现结果

## 产物根目录

所有产物写入**产物根目录**下。默认根目录为 `docs/ae/galv/<项目名>/`。

`<项目名>` 由以下规则确定：
1. 若产物根目录下已存在 `galv-manifest.yaml`，读取其中的 `project_name` 字段作为项目名
2. 若不存在，在工作区 `docs/ae/galv/` 下搜索已有的 `galv-manifest.yaml` 自动定位
3. 若仍未找到，提示用户先执行 G1 技能创建 manifest

整个根目录自包含、可移植：内部所有路径均为相对路径，目录可整体移动到任意位置。读取全部阶段产物后，任何 AI 工具可据此生成功能等价、结构等价的软件系统。

本阶段的产物位于根目录下 `g3/` 子目录。

## 产物独占

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

| 产物 | 格式 | 行数上限 |
|------|------|---------|
| `g3/architecture.md` | YAML Frontmatter + 正文 | 500 |
| `g3/security.md` | YAML Frontmatter + 正文 | 500 |

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

**禁止修改**上游技能产物（G1 的 `g1/`、G2 的 `g2/`）和下游技能产物。

## 上游依赖（只读）

紧邻前序技能：**ae:g1-invariants**、**ae:g2-business-scenarios**

| 上游技能 | 产物 | 用途 |
|---------|------|------|
| ae:g1-invariants | `g1/invariants/` | 不变量约束推导架构决策依据 |
| ae:g1-invariants | `g1/boundary.md` | 系统边界和外部交互驱动部署拓扑 |
| ae:g1-invariants | `g1/nfr.md` | 非功能性需求约束架构选型 |
| ae:g2-business-scenarios | `g2/business-scenarios/` | 业务场景驱动模块拆分和通信模式 |
| ae:g2-business-scenarios | `g2/field-catalog.md` | 字段特性影响技术栈和存储选型 |
| ae:g2-business-scenarios | `g2/roles.md` | 角色定义驱动认证授权模型 |

## 执行流程

### T1 架构风格决策

1. 读取 `g1/invariants/`、`g1/boundary.md`、`g1/nfr.md`、`g2/business-scenarios/`
2. 基于 G2 场景的模块拆分和 G1 边界约束，评估候选架构风格
3. 候选风格：单体、微服务、Serverless、事件驱动、分层
4. 每种候选标注适用理由、不适用理由和 NFR 影响评估
5. 选择最终架构风格并记录决策依据

```yaml
architecture_style:
  selected: microservice
  candidates:
    - style: monolith
      pros: [部署简单, 开发效率高]
      cons: [伸缩性差, 团队耦合]
      nfr_impact: "不满足 NFR-002 水平伸缩需求"
    - style: microservice
      pros: [独立部署, 技术异构, 团队自治]
      cons: [运维复杂, 分布式事务]
      nfr_impact: "满足 NFR-002 水平伸缩、NFR-003 独立部署"
  decision_ref: "基于 G2 场景模块拆分(g2/business-scenarios/)和 NFR-002/NFR-003"
```

### T2 技术栈选型

1. 基于架构风格和 G2 场景特性（数据量、并发度、延迟要求）选型
2. 确定语言、框架、中间件、数据库类型
3. 每项选型标注依据（引用 G1 NFR 或 G2 场景特性）

```yaml
tech_stack:
  language: { name: TypeScript, reason: "NFR-004 团队技能" }
  framework: { name: NestJS, reason: "微服务框架, 装饰器契约" }
  database: { name: PostgreSQL, reason: "G2 场景涉及事务一致性" }
  message_queue: { name: RabbitMQ, reason: "G2 跨场景异步依赖" }
```

### T3 部署拓扑设计

1. 基于架构风格和 G1 boundary.md 设计服务部署方式
2. 定义网络分区、服务发现、负载均衡策略
3. 标注部署单元与 G2 模块的映射关系

### T4 模块间通信模式

1. 基于 G2 场景交互模式和 G1 跨模块约束，定义通信模式
2. 同步通信（HTTP/gRPC）：用于请求-响应型交互
3. 异步通信（消息队列/事件总线）：用于解耦型交互
4. 每种通信标注涉及的模块对和 G2 场景引用

```yaml
communication:
  - from: order-service
    to: inventory-service
    pattern: sync_http
    protocol: REST
    scenarios: [BS-001]
    reason: "下单需实时校验库存"
  - from: order-service
    to: notification-service
    pattern: async_message
    protocol: RabbitMQ
    scenarios: [BS-001]
    reason: "下单成功通知解耦"
```

### T5 认证授权模型

1. 读取 `g2/roles.md` 获取所有角色定义
2. 选择认证方案（JWT/Session/OAuth2/API Key）
3. 选择授权模型（RBAC/ABAC/混合）
4. 为每个角色定义权限边界，标注引用 G2 roles.md 角色ID

```yaml
auth:
  authentication: { method: JWT, reason: "微服务无状态认证" }
  authorization:
    model: RBAC
    role_mapping:
      - role_id: ROLE-001
        role_name: 注册用户
        permissions: [order:create, order:read:own]
        ref: "g2/roles.md ROLE-001"
```

### T6 数据保护策略

1. 读取 G1 安全不变量，确定传输加密、存储加密需求
2. 定义敏感字段脱敏规则
3. 定义审计日志策略（记录哪些操作、保留期限）
4. 每项策略标注引用的安全不变量 ID

```yaml
data_protection:
  transport_encryption: { method: TLS 1.3, ref_invariant: inv-sec-001 }
  storage_encryption: { method: AES-256, fields: [User.password, User.phone] }
  masking:
    - field: User.phone
      rule: "保留前3后4，中间用*替代"
  audit_log:
    operations: [order:create, order:cancel, user:login]
    retention: 90d
    ref_invariant: inv-sec-002
```

### T7 威胁建模

1. 读取 `g1/boundary.md` 识别所有外部交互面
2. 对每个外部交互面进行攻击面分析
3. 使用简化 STRIDE 模型评估威胁
4. 每个威胁标注风险评级和缓解措施

```yaml
threats:
  - id: THREAT-001
    surface: "用户登录接口"
    category: Spoofing
    risk: high
    mitigation: "JWT + HTTPS + 登录失败限流"
    ref_boundary: "boundary.md external: user-browser"
```

### T8 写入产物

按产物规格写入文件（路径相对于产物根目录）。

**`g3/architecture.md`**：架构风格 + 技术栈 + 部署拓扑 + 通信模式 + 伸缩策略

**`g3/security.md`**：认证授权 + 数据保护 + 威胁建模 + 审计日志策略

### T9 产物审查

调用 `ae:review mode=autofix domain=document g3/`，仅审查 `g3/` 目录下的本技能产物，最多重试 3 次。

## 单轨格式规则

所有产物文件采用 Markdown + YAML Frontmatter 单轨格式：

- Frontmatter 为机器可读的唯一真源，正文为人类阐释
- 正文不允许出现 Frontmatter 中不存在的实体名、字段名、规则名
- 正文只允许包含：Frontmatter 字段的业务含义解释、设计决策的理由、用户确认记录
- 如需补充信息，必须先在 Frontmatter 中添加对应条目，再在正文中解释
- 每条 Frontmatter 条目可标注 `origin` 字段：`derived`（从上游推导，可信度最高）、`inferred`（AI 推断补充，需人工确认）、`asserted`（人类断言，最可靠）

## 验收关卡

| 编号 | 检查项 | 通过标准 |
|------|--------|---------|
| G3-K1 | 架构风格明确 | 选定架构风格且有 G1/G2 依据 |
| G3-K2 | 技术栈确定 | 每项技术选型有 NFR 或场景依据 |
| G3-K3 | 通信模式完整 | 每对有交互的模块定义了通信模式 |
| G3-K4 | 认证授权覆盖所有角色 | g2/roles.md 中每个角色有权限定义 |
| G3-K5 | 数据保护覆盖所有安全不变量 | 每条安全不变量有对应数据保护措施 |
| G3-K6 | 威胁建模覆盖所有外部交互面 | g1/boundary.md 中每个外部交互有威胁分析 |
| G3-K7 | 与 G1/G2 一致 | 架构决策引用的不变量和场景在 G1/G2 中存在 |
| G3-K8 | 文件行数合规 | 所有产物文件不超过 500 行 |
| G3-K9 | 产物审查通过 | ae:review autofix 审查通过 |
| G3-K10 | 人工审核通过 | 用户确认架构决策和安全设计 |

## 回退说明

| 发现问题 | 回退目标 |
|---------|---------|
| 场景遗漏导致架构决策不完整 | 回 G2 补充场景 |
| 不变量遗漏导致安全策略缺口 | 回 G1 补充不变量 |
| 架构决策内部问题 | 仅重做 G3 |

## 安全边界

- 只读访问 G1、G2 产物，不得修改
- 不得修改下游技能产物
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（G4/G5/A1/A2/L1/L2/L3/V1/V2），以保证回退时后续产物不可见
- 技术选型仅记录决策和依据，不做"最优"断言
- 威胁建模仅识别和评级，不做零风险承诺

## 完成标准

- `g3/architecture.md`、`g3/security.md` 已写入
- 验收关卡 G3-K1 至 G3-K9 全部通过
- G3-K10 须由用户确认后方可视为本步骤完成
- 输出变更摘要：架构风格、技术栈条目数、通信模式条目数、角色权限条目数、威胁条目数
