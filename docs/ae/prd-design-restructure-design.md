# ae:prd 与 ae:design 产物结构重构设计

> 本文档是 AE 插件源码仓库的开发设计文档，不是插件用户侧资产。
> 本文档记录 ae:prd 和 ae:design 技能产物结构的完整重构方案，包括产物结构、维度触发、调度策略、元数据精简、范围严格性约束等所有决策。

## 目录

- [一、问题诊断](#一问题诊断)
- [二、设计原则](#二设计原则)
- [三、ae:prd 产物结构](#三aeprd-产物结构)
- [四、ae:design 产物结构](#四aedesign-产物结构)
- [五、维度触发逻辑](#五维度触发逻辑)
- [六、子代理调度策略](#六子代理调度策略)
- [七、元数据精简规范](#七元数据精简规范)
- [八、范围严格性约束](#八范围严格性约束不镀金硬约束)
- [九、按需读取矩阵](#九按需读取矩阵)
- [十、prd 不追问实现方式约束](#十prd-不追问实现方式约束硬约束)
- [十一、响应式默认为否约束](#十一响应式默认为否约束)
- [十二、产物自包含约束](#十二产物自包含约束)
- [十三、关键不变项](#十三关键不变项)
- [十四、移除的机制](#十四移除的机制)
- [十五、变更影响对比](#十五变更影响对比)
- [十六、需要修改的文件清单](#十六需要修改的文件清单)

---

## 一、问题诊断

### 1. ae:prd 与 ae:design 边界模糊和重复内容

| 维度 | ae:prd 当前产出 | ae:design 当前产出 | 重复程度 |
|------|----------------|------------------|---------|
| 页面清单/路由 | `prototype/01-prototype.md` | `ui-ux/01-ui-ux.md` | 几乎完全重复 |
| 布局结构/交互流程 | `prototype/NN-pages-*.md` | `ui-ux/NN-pages-*.md` | 高度重复 |
| 表单字段/必填规则 | prototype 页面元素清单 | ui-ux 组件 Props | 重复 |
| 主题色/响应式断点 | prototype 主题声明 | ui-ux 设计 Token | 重复 |
| 技术栈声明 | `09-tech-stack.md` | `ui-ux/01-ui-ux.md` + `architecture/01-architecture.md` ADR | design 阶段又重新决策一次 |

**根因**：prd 的 prototype 与 design 的 ui-ux 在"页面结构/路由/交互"层面是同一份内容的两种精度，强行分成两套产物。

### 2. 文件耦合导致变更放大

**prd 当前问题**：改一条"用户登录需求"可能要同步改 `01-problem.md`、`02-scope.md`、`03-requirements-auth.md`、`05-success-criteria.md`、`prototype/02-pages-auth.md` 等 5~7 个散落文件。

**design 当前问题**：改 auth 模块的"用户登录接口字段"要改 `api/02-endpoints-auth.md`、`database/02-tables-core.md`、`ui-ux/02-pages-auth.md`、`test-cases/02-backend-auth.md`、`test-cases/03-frontend-auth.md`、`traceability.md`、`architecture/02-module-boundary.md` 等 5~6 个跨目录文件。

**traceability.md 是耦合信号**：4 类映射表（api↔db、api-error↔ui-state、test↔contract、ui-component↔api）本质是把"被维度横切打散的同一模块实体"重新拼回去的胶水。

### 3. 横切维度问题

`api/02-endpoints-auth.md`、`database/02-tables-core.md`、`ui-ux/02-pages-auth.md` 是按"功能域"分组的横切文件，但模块的同一组实体被切成 4~5 个跨目录文件，模块内聚性低。

---

## 二、设计原则

| # | 原则 | 含义 |
|---|------|------|
| 1 | 全局-局部分离 | 跨模块共识放 `global/`，模块特定细节放 `modules/<m>/`，物理隔离 |
| 2 | 模块内聚 | 同一模块的需求/原型/API/DB/UI/测试集中在一个子目录，变更局部化 |
| 3 | 全局不关注模块内部 | `global/*` 只承载跨模块共识，不内联任何模块内部细节 |
| 4 | 按需读取 | 处理某模块时只读 `global/*` + `modules/<target>/*`，不扫描全部产物 |
| 5 | prd 不追问实现方式 | prd 只记录用户明确指定的技术栈约束；技术选型与实现路线由 ae:design 决策 |
| 6 | 原型与 UI 设计分层合并 | prd 模块内 `prototype.md`（产品逻辑层）-> design 模块内 `ui-ux.md`（代码层），分层而非重复 |
| 7 | 破坏性变更 | 新结构直接替换旧结构，不双轨兼容 |
| 8 | 模块边界在 prd 阶段识别 | prd 产出 `modules/<m>/` 子目录，design 直接复用 |
| 9 | 需求未提及的一律不做 | 即使是加密存储、加密传输、响应式等"基础特性"，需求未提及时也不产出 |
| 10 | 统一序号前缀 | 所有产物文件名带 `NN-` 前缀，按逻辑顺序排列 |
| 11 | 移除行数元数据 | 产物文件中不出现行数列/lines 字段（行数校验仍是生成时机制，不写入产物） |
| 12 | 元数据精简 | 移除不必要的 frontmatter 字段 |
| 13 | 产物自包含 | 产物文件不引用外部 md，必要内容直接内化 |

---

## 三、ae:prd 产物结构

```
ae/prds/<topic>-YYYY-MM-DD/
├── prd.md                           # 纯索引（无序号前缀，作为入口）
│                                    #   - frontmatter
│                                    #   - 模块清单表（模块名 / 描述 / 涉及 UI / 需求 ID 范围 / 目录路径）
│                                    #   - 全局文件索引表（文件 / 章节 / 摘要 / 稳定 ID）
│                                    #   - 不承载任何模块内部细节
│
├── global/                          # 跨模块共识（变更影响所有模块时才动这里）
│   ├── 01-problem.md                # 问题框架（用户目标、当前痛点、成功判据）
│   ├── 02-scope.md                  # 范围边界（含模块清单 + 跨模块边界声明）
│   ├── 03-decisions.md              # 跨模块关键决策（D1, D2...，含理由）
│   ├── 04-dependencies.md           # 全局依赖与假设
│   ├── 05-open-questions.md         # 全局待定问题（标注影响模块）
│   ├── 06-non-functional.md         # 全局非功能需求（NFR1, NFR2...）
│   ├── 07-tech-stack.md             # 用户明确指定的技术栈约束（仅当存在时产出）
│   │                                #   - prd 不主动追问技术栈
│   │                                #   - 用户在需求描述中已明确指定的技术栈记录于此
│   │                                #   - design 必须遵循，不得擅自更换
│   └── 08-design-vision.md          # 视觉决策（仅当涉及 UI 时产出）
│                                    #   - 主题色 HEX、次要颜色 HEX
│                                    #   - 响应式断点定义（仅当用户明确要求响应式时）
│                                    #   - 视觉风格关键词
│                                    #   - 跨模块共享的视觉共识，模块内 prototype.md 引用
│
└── modules/                         # 模块需求（每个模块自包含）
    └── <module-name>/               # kebab-case，与 design 模块目录一一对应
        ├── 01-module.md             # 模块索引（< 80 行）
        │                            #   - 模块需求条目 ID 清单
        │                            #   - 模块验收条件映射
        │                            #   - 模块文件清单
        ├── 02-requirements.md       # 模块需求条目（R1, R2...，含 -> 验收: 语法）
        │                            #   - 仅本模块的产品行为，无技术实现
        │                            #   - 含模块内依赖
        ├── 03-success-criteria.md   # 模块级成功标准（仅本模块可验证部分）
        │                            #   - 若与全局 SC 重复，引用全局 SC ID 而非复制
        ├── 04-prototype.md          # 模块原型（仅涉及 UI 时产出）
        │                            #   - 页面清单、路由、布局结构、交互流程、表单字段
        │                            #   - 产品逻辑层语义，禁止技术栈名称
        │                            #   - 视觉决策引用 global/08-design-vision.md
        │                            #   - 响应式章节默认标注"不支持响应式，固定布局"
        └── 05-open-questions.md     # 模块级待定问题（可选，无则不产出）
```

### prd.md 索引模板

```markdown
---
type: prd
status: drafted
date: YYYY-MM-DD
topic: <kebab-case-topic>
time_scope: [frontend, backend, data, security, ops]
origin: <上游路径，若无则删除此行>
originFingerprint: <上游指纹，若无则删除此行>
shards:
  - file: global/01-problem.md
    module: problem
  - file: global/02-scope.md
    module: scope
  - file: modules/auth/01-module.md
    module: auth
    requirements: [R1, R2, R3, R4, R5]
  - file: modules/resource/01-module.md
    module: resource
    requirements: [R6, R7, R8, R9, R10, R11, R12]
  - file: modules/audit/01-module.md
    module: audit
    requirements: [R13, R14]
---

# <主题标题>

## 模块清单

| 模块 | 描述 | 涉及 UI | 需求 ID 范围 | 目录 |
|------|------|--------|-------------|------|
| auth | 用户认证 | 是 | R1-R5 | modules/auth/ |
| resource | 资源管理 | 是 | R6-R12 | modules/resource/ |
| audit | 审计日志 | 否 | R13-R14 | modules/audit/ |

## 全局文件索引

| 文件 | 章节 | 摘要 | 稳定 ID |
|------|------|------|---------|
| [global/01-problem.md](global/01-problem.md) | 问题框架 | 一句话摘要 | - |
| [global/02-scope.md](global/02-scope.md) | 范围边界 | In/Out 摘要 | - |
| [global/03-decisions.md](global/03-decisions.md) | 跨模块决策 | N 条 | D1~DN |
| [global/06-non-functional.md](global/06-non-functional.md) | 全局非功能 | NFR1~NFRN | - |
| [global/07-tech-stack.md](global/07-tech-stack.md) | 用户指定技术栈 | （仅当存在时） | - |
| [global/08-design-vision.md](global/08-design-vision.md) | 视觉决策 | 主题色/断点 | - |
```

### prd 模块子文件 frontmatter

```markdown
---
type: prd-shard
parent: "prd.md"
module: "auth"
---
```

### modules/\<m\>/01-module.md frontmatter

```yaml
---
type: prd-shard
parent: "prd.md"
module: "auth"
shards:
  - file: 02-requirements.md
  - file: 03-success-criteria.md
  - file: 04-prototype.md
---
```

### prd 模块识别时机

- **阶段 1.3 协作对话结束后**：基于已澄清的需求，主代理识别模块边界
- **模块划分依据**：业务域内聚（同域实体高内聚），跨模块耦合点通过 API 暴露
- **跨模块依赖**：记录在 `global/04-dependencies.md`，标注依赖类型（API 调用、数据共享、事件订阅）
- **模块边界一旦在 prd 阶段确定，design 阶段不得擅自拆分或合并**；如需调整，回退 prd 阶段

---

## 四、ae:design 产物结构

```
ae/designs/<topic>-YYYY-MM-DD/
├── design.md                       # 纯索引（无序号前缀，作为入口）
│                                   #   - frontmatter
│                                   #   - 模块清单表（模块 / 涉及维度 / 稳定 ID 范围 / 目录路径）
│                                   #   - 全局文件索引表（文件 / 维度 / 摘要 / 稳定 ID）
│                                   #   - 不承载任何模块内部细节
│
├── global/                         # 跨模块共识（架构决策、跨模块契约）
│   ├── 01-overview.md              # 设计总览（精简）
│                                   #   - 设计读数（一句话声明设计意图和美学家族）
│                                   #   - 契约版本
│                                   #   - 跨模块一致性约束声明（哪些维度间有一致性要求）
│   ├── 02-architecture.md          # 系统架构
│                                   #   - 技术选型（前端/后端/数据层/基础设施，含版本范围和选型理由）
│                                   #   - ADR 真源（ADR-001~N，含技术选型决策）
│                                   #   - 系统上下文图（Mermaid）
│                                   #   - 模块清单与边界（与 prd 模块一一对应）
│                                   #   - 跨模块依赖关系图（Mermaid，定义权在此）
│                                   #   - 全局数据流（跨模块的，定义权在此；traceability.md 仅引用）
│                                   #   - 技术栈依赖审查（社区活跃度、采用理由）
│   ├── 03-constraints.md           # 实施约束
│                                   #   - 环境变量清单
│                                   #   - 依赖版本约束
│                                   #   - 目录结构约定
│                                   #   - 构建命令
│   ├── 04-security.md              # 全局安全
│                                   #   - 威胁模型（仅当需求提及安全威胁时）
│                                   #   - 信任边界（仅当需求涉及跨系统/跨模块边界时）
│                                   #   - 全局认证授权体系（仅当需求提及认证/授权时）
│                                   #   - 数据分级标准（仅当需求涉及敏感数据时）
│   ├── 05-observability.md         # 全局可观测性
│                                   #   - 日志规范、指标体系、告警规则、SLO
│                                   #   - 仅产出需求已提及的内容
│   ├── 06-non-functional.md        # 全局非功能
│                                   #   - 性能目标、并发模型、事务边界、缓存策略、容量规划
│                                   #   - 仅产出需求已提及的内容
│   ├── 07-design-spec.md           # 全局设计规范（仅当涉及 UI 时产出）
│                                   #   - 设计读数、三旋钮取值、设计体系选择、风格变体、负向设计空间
│                                   #   - 透传给所有模块的 ui-ux-designer
│   └── 08-traceability.md          # 跨模块映射（仅跨模块的）
│                                   #   - 跨模块 API 调用关系（引用 architecture.md 的依赖图，补充字段级映射）
│                                   #   - 跨模块数据流（引用 architecture.md 的全局数据流，补充字段级映射）
│                                   #   - 跨模块状态同步
│                                   #   - 不再包含模块内映射（模块内映射通过 ID 引用实现）
│                                   #   - 不重复 architecture.md 的依赖关系图和数据流定义，仅做引用和字段级补充
│
└── modules/                        # 模块设计（每个模块自包含）
    └── <module-name>/              # 与 prd 模块目录一一对应
        ├── 01-module.md            # 模块索引（< 80 行）
        │                           #   - 维度清单（声明该模块触发了哪些维度，未触发的标注 explicitly-omitted）
        │                           #   - 稳定 ID 表（EP-XXX / T-XXX / PAGE-XXX / TC-XXX / ST-XXX 的定义位置和范围）
        │                           #   - 模块对外暴露契约清单（API 端点、事件、共享表）
        │                           #   - 只读索引，不被其他文件引用
        ├── 02-api.md                # 模块 API 契约（仅涉及 API 时产出）
        │                           #   - 端点 OpenAPI 规格
        │                           #   - 请求/响应 Schema
        │                           #   - 错误码（本模块定义的）
        │                           #   - 通过 ID 引用 database/security
        ├── 03-database.md           # 模块数据库表（仅涉及持久化时产出）
        │                           #   - 表 DDL（不含 FOREIGN KEY，引用用逻辑软约束）
        │                           #   - 索引
        │                           #   - 跨表引用声明（引用他模块表的逻辑外键）
        │                           #   - 敏感字段标注（引用 global/04-security.md 的数据分级）
        ├── 04-ui-ux.md              # 模块 UI/UX（仅涉及 UI 时产出）
        │                           #   - 引用 global/07-design-spec.md 的设计决策包
        │                           #   - 引用 prd 的 modules/<m>/04-prototype.md 的产品逻辑层
        │                           #   - HTML 结构片段
        │                           #   - CSS 样式片段
        │                           #   - 组件 Props 契约
        │                           #   - 交互状态机（ST-XXX）
        │                           #   - 技术栈声明（引用 global/02-architecture.md 的前端技术栈 ADR）
        ├── 05-test-cases.md         # 模块测试用例
        │                           #   - 按测试层分组（前端 / 后端 / 集成 / 契约）
        │                           #   - 引用本模块的 EP-XXX / T-XXX / PAGE-XXX / ST-XXX
        ├── 06-design-spec.md        # 模块级设计规范（可选，仅当与全局不同时）
        └── 07-constraints.md        # 模块级约束（可选，仅当与全局不同时）
```

### design.md 索引模板

```markdown
---
type: design
status: active
date: "YYYY-MM-DD"
topic: "<kebab-case-topic>"
version: "1.0"
origin: ae/prds/<topic>-YYYY-MM-DD/prd.md
originFingerprint: <上游指纹>
shards:
  - file: global/01-overview.md
    module: overview
  - file: global/02-architecture.md
    module: architecture
  - file: global/03-constraints.md
    module: constraints
  - file: global/04-security.md
    module: security
  - file: global/05-observability.md
    module: observability
  - file: global/06-non-functional.md
    module: non-functional
  - file: global/07-design-spec.md
    module: design-spec
  - file: global/08-traceability.md
    module: traceability
  - file: modules/auth/01-module.md
    module: auth
  - file: modules/resource/01-module.md
    module: resource
  - file: modules/audit/01-module.md
    module: audit
---

# 设计契约：<标题>

## 模块清单

| 模块 | 涉及维度 | 稳定 ID 范围 | 目录 |
|------|---------|-------------|------|
| auth | api, database, ui-ux, test-cases | EP-001~005, T-users, PAGE-001~003 | modules/auth/ |
| resource | api, database, ui-ux, test-cases | EP-006~010, T-resources, PAGE-004~006 | modules/resource/ |
| audit | api, database, test-cases | EP-011, T-audit-log | modules/audit/ |

## 全局文件索引

| 文件 | 维度 | 摘要 | 稳定 ID |
|------|------|------|---------|
| [global/01-overview.md](global/01-overview.md) | 总览 | 设计读数、版本 | - |
| [global/02-architecture.md](global/02-architecture.md) | 架构 | 技术选型、模块边界、依赖图 | ADR-001~005 |
| [global/03-constraints.md](global/03-constraints.md) | 约束 | 环境变量、依赖、目录 | - |
| [global/04-security.md](global/04-security.md) | 安全 | 威胁模型、认证授权 | - |
| [global/05-observability.md](global/05-observability.md) | 可观测性 | 日志、指标、SLO | - |
| [global/06-non-functional.md](global/06-non-functional.md) | 非功能 | 性能、并发、容量 | - |
| [global/07-design-spec.md](global/07-design-spec.md) | 设计规范 | 三旋钮、设计体系 | - |
| [global/08-traceability.md](global/08-traceability.md) | 跨模块映射 | 模块间调用关系 | - |
```

### design 模块子文件 frontmatter

```markdown
---
type: design-shard
parent: "design.md"
module: "auth"
---
```

### modules/\<m\>/01-module.md frontmatter

```yaml
---
type: design-shard
parent: "design.md"
module: "auth"
shards:
  - file: 02-api.md
    dimension: api
  - file: 03-database.md
    dimension: database
  - file: 04-ui-ux.md
    dimension: ui-ux
  - file: 05-test-cases.md
    dimension: test-cases
---
```

---

## 五、维度触发逻辑

### 全局维度触发（按风险维度）

| 风险维度 | 触发条件 | 必产出全局文件 |
|---------|---------|--------------|
| 不可逆决策 | API 签名/schema/认证模型变更 | `global/02-architecture.md`、`global/04-security.md` |
| 结构性变更 | 新增模块/跨模块依赖/公共配置 | `global/01-overview.md`、`global/02-architecture.md` |
| 用户界面变更 | 涉及任何 UI | `global/07-design-spec.md`（ui-ux 维度的前置输入） |
| 生产部署 | 涉及生产部署 | `global/05-observability.md` |
| 性能敏感 | 高并发/大数据量/实时性 | `global/06-non-functional.md` |

`global/01-overview.md`、`global/03-constraints.md`、`global/08-traceability.md` 始终必产出（`global/08-traceability.md` 即使无跨模块关系也产出空骨架，内容仅记录跨模块关系）。

### 模块维度触发（按模块内特征）

| 模块特征 | 该模块产出 |
|---------|----------|
| 模块涉及 API 端点 | `modules/<m>/02-api.md` |
| 模块涉及持久化（新建表/字段变更/数据存储到数据库/文件系统/缓存层） | `modules/<m>/03-database.md` |
| 模块涉及 UI（前置依赖 `global/07-design-spec.md`） | `modules/<m>/04-ui-ux.md` |
| 模块涉及测试（依赖该模块其他维度） | `modules/<m>/05-test-cases.md` |
| 模块涉及用户数据输入 | `global/04-security.md` 提升为必产出 |
| 模块与全局设计规范不同 | `modules/<m>/06-design-spec.md`（可选） |
| 模块与全局约束不同 | `modules/<m>/07-constraints.md`（可选） |

模块内 `01-module.md` 显式声明该模块触发了哪些维度，未触发的标注 `explicitly-omitted` 并说明理由。

### 维度触发不等于必须产出全部内容

即使维度被触发，也只产出需求中已提及的内容。需求未提及的特性（如加密存储、加密传输、响应式等）一律不产出。

---

## 六、子代理调度策略

### 旧调度：维度横切并行

```
阶段 1：所有维度并行 -> @xxx-designer 产出该维度索引（覆盖所有模块）
阶段 2：所有维度的实体文件并行
```

**问题**：单个子代理要处理多个模块的内容，模块内聚性低，跨模块上下文爆炸。

### 新调度：全局维度并行 + 模块并行（两层）

```
阶段 1：全局维度并行 + 稳定 ID 范围预分配
  - @architecture-designer -> global/02-architecture.md
    （含模块边界 + 跨模块依赖图，需先读取 prd 的 global/02-scope.md + 模块清单）
    并为各模块预分配稳定 ID 范围（如 auth: EP-001~005, T-users；resource: EP-006~010, T-resources）
    将 ID 范围写入 design.md frontmatter shards 和各模块 01-module.md
  - @security-designer -> global/04-security.md
  - @observability-designer -> global/05-observability.md
  - @non-functional-designer -> global/06-non-functional.md
  - @ui-design-spec -> global/07-design-spec.md（仅当涉及 UI）
  - 主代理 -> global/01-overview.md + global/03-constraints.md + global/08-traceability.md 骨架

阶段 2：模块并行（每个模块一个 agent）
  - modules/auth/ -> 一个 agent 串行产出：
    02-api.md -> 03-database.md -> 04-ui-ux.md -> 05-test-cases.md
    -> (06-design-spec.md 触发时) -> (07-constraints.md 触发时) -> 01-module.md
  - modules/resource/ -> 另一个 agent 并行处理
  - modules/audit/ -> 另一个 agent 并行处理（无 UI，跳过 04-ui-ux.md）

阶段 3：跨模块一致性校验与回填
  - 主代理读取所有模块的 01-module.md + 实际维度文件（02-api.md/03-database.md 等）+ global/08-traceability.md
  - 校验跨模块稳定 ID 唯一性（EP-XXX / T-XXX 等不重复）
  - 校验跨模块 API 调用一致性（读取实际 02-api.md，不只读索引）
  - 校验跨模块数据流闭合
  - 校验跨模块逻辑外键闭合（读取实际 03-database.md）
  - 回填 global/08-traceability.md（将实际发现的跨模块关系写入）
  - 失败处理：标识受影响模块/维度，触发最小范围返工，上限 2 轮，仍失败则上报用户澄清
```

### 关键变化

- **模块内维度由同一 agent 串行产出**：模块内聚性最高，模块内 ID 引用在产出过程中即时维护
- **不再需要全局 4 类映射表把横切维度拼回去**：模块内通过 ID 引用实现松耦合
- **跨模块映射收敛到 `global/08-traceability.md`**：只保留模块间关系，体量可控
- **模块并行**：不同模块的 agent 可并行执行，模块间无共享文件冲突

### 模块内文件间关联：ID 引用松耦合

| 维度文件 | 引用的 ID | 引用方式 |
|---------|---------|---------|
| `02-api.md` | `T-users`（database.md 定义） | `response.name -> T-users.name` |
| `04-ui-ux.md` | `EP-001`（api.md 定义） | `调用 EP-001 (POST /resources)` |
| `05-test-cases.md` | `EP-001`, `ST-001`, `T-users` | `验证 EP-001 返回 201, 写入 T-resources` |

改 api.md 不影响 ui-ux.md / test-cases.md（除非 ID 本身变了，而 ID 是稳定的）。

### `01-module.md` 职责

- 维度清单（声明该模块触发了哪些维度，未触发的标注 `explicitly-omitted`）
- 稳定 ID 表（`EP-XXX` / `T-XXX` / `PAGE-XXX` / `TC-XXX` / `ST-XXX` 的定义位置和范围）
- 模块对外暴露契约清单（API 端点、事件、共享表）

`01-module.md` 是**只读索引**：不被其他文件引用。但稳定 ID 表需要随维度文件新增/删除 ID 时同步更新（由产出该维度文件的 agent 在产出后更新 01-module.md 的对应行）。

---

## 七、元数据精简规范

### 元数据精简对照表

| 字段 | prd.md | design.md | 子文件 | 说明 |
|------|--------|-----------|--------|------|
| `type` | 保留 | 保留 | 保留 | 文档类型标识 |
| `status` | 保留 | 保留 | 移除 | 子文件状态跟随父文档 |
| `date` | 保留 | 保留 | 移除 | 子文件无需独立日期 |
| `topic` | 保留 | 保留 | 移除 | 子文件无需重复 |
| `time_scope` | 保留 | 移除 | 移除 | 仅 prd 需要，design 从 origin 推断 |
| `version` | 移除 | 保留 | 移除 | 仅 design 需要版本演化 |
| `origin`/`originFingerprint` | 保留 | 保留 | 移除 | 仅入口文件需要 |
| `shards` | 保留 | 保留 | 仅 `01-module.md` 保留 | 文件清单 |
| `module` | 移除 | 移除 | 保留 | 子文件归属模块（注：shards 条目中的 `module` 字段保留，指 shard 归属的模块名） |
| `parent` | 移除 | 移除 | 保留 | 指向父文件 |

### 移除的字段

- `format: human-readable-requirements`（描述性元数据，无实际用途）
- `sharded: true`（目录结构本身就是分片的，冗余）
- `title`（design.md，topic 已足够，标题在正文 `#` 中表达）
- `last_updated`（design.md，与 `date` 重复，版本演化时 `date` 更新即可）
- 子文件 `status`（跟随父文档，无需重复声明）
- 子文件 `section`（从文件名推断，如 `02-scope.md` 的 section 是 `scope`）
- 子文件 `heading_chain`（`parent` + `module` + 文件名已足够定位）

### 移除行数元数据

- prd.md 索引表移除"行数"列
- design.md 索引表移除"行数"列
- 移除 Split Manifest（与 frontmatter `shards` 冗余，且包含无意义的 `lines` 字段）
- 任何文件 frontmatter 中的 `lines` 字段
- 即时校验仍保留（行数校验是生成时的机制，不是产物元数据）

---

## 八、范围严格性约束（不镀金硬约束）

### 核心原则

**需求未提及的一律不做。** 即使是加密存储、加密传输、响应式自适应等"基础特性"，需求未提及时也不产出。

### 审查需求文档时

- **仅报告或修复阻断项（P0/P1）** - 完全抑制 P2/P3
- **不检查需求未提及的内容是否"应该有"**
- **不报告"约束完整性"缺口** - 只检查已有约束的可验证性

### 审查设计文档时

- **严格按需求范围审查，禁止无边界镀金**
- **需求没有提及的一律不报告为发现**
- **即使安全特性/可观测性/性能达不到最佳实践，如果需求没提及，不报告为发现**
- **不建议添加需求未提及的功能、抽象、配置项或防御逻辑**
- **维度触发不等于必须审查全部内容** - 只审查需求已提及的部分

### 通用规则

- **需求是唯一真源** - 审查时以需求文档为准，不引入外部最佳实践作为审查标准
- **"应该有"不构成发现** - 只有"需求已提及但实现不正确/不完整"才构成发现
- **安全特性例外** - 即使安全特性达不到，如果需求没提及，不报告为发现

### 禁止主动添加的典型例子（需求未提及时一律不做）

**安全类**：

| 特性 | 需求未提及时的行为 |
|------|----------------|
| 加密存储 | 不产出"存储保护"章节 |
| 加密传输/HTTPS | 不产出"传输保护"章节 |
| 密码哈希算法选型 | 不产出密码存储方案 |
| CSRF 防护 | 不产出 CSRF 防护设计 |
| XSS 防护 | 不产出 XSS 防护设计 |
| SQL 注入防护 | 不产出参数化查询设计 |
| 速率限制 | 不产出限流方案 |
| Session 超时策略 | 不产出会话管理设计 |
| CORS 配置 | 不产出跨域配置 |
| 密钥轮换策略 | 不产出密钥管理方案 |
| 审计日志 | 不产出审计日志要求 |
| 合规约束 | 不产出合规约束章节 |
| 输入验证规则 | 不产出输入验证策略 |
| 输出编码 | 不产出输出编码策略 |

**前端/UI 类**：

| 特性 | 需求未提及时的行为 |
|------|----------------|
| 响应式自适应 | 默认固定布局，不产出断点定义 |
| 无障碍/WCAG | 不产出无障碍要求 |
| 国际化/i18n | 不产出国际化方案 |
| 暗色模式 | 不产出主题切换设计 |
| 动画/过渡效果 | 不产出动画设计 |
| 骨架屏 | 不产出加载占位设计 |
| 错误边界 | 不产出错误边界设计 |

**架构/基础设施类**：

| 特性 | 需求未提及时的行为 |
|------|----------------|
| 缓存策略 | 不产出缓存设计 |
| 负载均衡 | 不产出负载均衡方案 |
| CDN 配置 | 不产出 CDN 配置 |
| 数据库索引优化 | 不产出索引优化方案 |
| API 版本控制 | 不产出版本控制策略 |
| 数据库迁移策略 | 不产出迁移方案 |
| 灰度发布 | 不产出灰度发布设计 |
| 熔断/降级 | 不产出容错设计 |

**可观测性类**：

| 特性 | 需求未提及时的行为 |
|------|----------------|
| 日志结构化 | 不产出结构化日志规范 |
| 监控指标 | 不产出指标体系 |
| 告警规则 | 不产出告警规则 |
| 链路追踪 | 不产出追踪方案 |
| SLO/SLI 定义 | 不产出 SLO/SLI |

**非功能类**：

| 特性 | 需求未提及时的行为 |
|------|----------------|
| 性能目标量化 | 不产出性能目标 |
| 并发模型设计 | 不产出并发模型 |
| 容量规划 | 不产出容量规划 |
| 事务边界 | 不产出事务设计 |

### 禁止报告的典型"缺口"（需求未提及时不报告）

以下"缺口"在需求未提及时，**一律不报告为发现**：

- "缺少加密存储" - 需求未提及"加密存储"时不报告
- "缺少加密传输" - 需求未提及"加密传输"时不报告
- "缺少响应式自适应" - 需求未提及"响应式"时不报告
- "缺少 CSRF 防护" - 需求未提及"CSRF"时不报告
- "缺少 XSS 防护" - 需求未提及"XSS"时不报告
- "缺少速率限制" - 需求未提及"限流"时不报告
- "缺少审计日志" - 需求未提及"审计"时不报告
- "缺少监控指标" - 需求未提及"监控"时不报告
- "缺少无障碍支持" - 需求未提及"无障碍"时不报告
- "缺少国际化" - 需求未提及"国际化"时不报告
- "缺少缓存策略" - 需求未提及"缓存"时不报告
- "缺少熔断/降级" - 需求未提及"容错"时不报告
- 以及任何其他"需求未提及但应该有"的最佳实践缺口

### 需求关键词识别指引

为帮助 LLM 判断"需求是否提及"，以下关键词视为"已提及"：

| 特性 | 触发关键词（需求中出现即视为已提及） |
|------|--------------------------------|
| 加密存储 | "加密存储"、"数据加密"、"静态加密"、"加密 at rest" |
| 加密传输 | "加密传输"、"HTTPS"、"TLS"、"SSL"、"加密 in transit" |
| 响应式 | "响应式"、"自适应"、"移动端适配"、"多端适配"、"断点" |
| CSRF | "CSRF"、"跨站请求伪造" |
| XSS | "XSS"、"跨站脚本"、"输入消毒"、"输出编码" |
| 速率限制 | "限流"、"速率限制"、"rate limit"、"防刷" |
| 审计日志 | "审计"、"审计日志"、"操作日志"、"合规日志" |
| 监控 | "监控"、"指标"、"metrics"、"可观测性" |
| 无障碍 | "无障碍"、"a11y"、"WCAG"、"屏幕阅读器" |
| 国际化 | "国际化"、"i18n"、"多语言"、"本地化" |
| 缓存 | "缓存"、"cache"、"Redis" |
| 容错 | "熔断"、"降级"、"容错"、"断路器"、"circuit breaker" |

**关键词未出现时，一律视为"需求未提及"，不产出、不报告。**

### 设计子代理统一约束（添加到 Boundaries）

```markdown
## 范围严格性约束（硬约束）

- 严格按需求范围产出，禁止镀金
- 需求没有提及的一律不产出
- 即使某特性达不到最佳实践，如果需求没提及，不做
- 只产出需求中已明确提及的内容对应的设计契约
- 不主动添加需求未提及的功能、抽象、配置项或防御逻辑
- 维度触发不等于必须产出全部模板内容 - 只产出需求已提及的部分
```

### 审查子代理统一约束（添加到 Boundaries）

```markdown
## 范围严格性约束（硬约束）

- 严格按需求范围审查，禁止镀金
- 需求没有提及的一律不报告为发现
- 即使某特性达不到最佳实践，如果需求没提及，不报告为发现
- 只检查需求中已明确提及的内容是否被正确设计/实现
- 不建议添加需求未提及的功能、抽象、配置项或防御逻辑
- 审查需求文档时仅报告 P0/P1，完全抑制 P2/P3
```

### ae:review SKILL.md 统一约束

```markdown
## 范围严格性约束（硬约束）

### 审查需求文档时

- **仅报告或修复阻断项（P0/P1）** - 完全抑制 P2/P3
- **不检查需求未提及的内容是否"应该有"**
- **不报告"约束完整性"缺口** - 只检查已有约束的可验证性

### 审查设计文档时

- **严格按需求范围审查，禁止无边界镀金**
- **需求没有提及的一律不报告为发现**
- **即使安全特性/可观测性/性能达不到最佳实践，如果需求没提及，不报告为发现**
- **不建议添加需求未提及的功能、抽象、配置项或防御逻辑**
- **维度触发不等于必须审查全部内容** - 只审查需求已提及的部分

### 通用规则

- **需求是唯一真源** - 审查时以需求文档为准，不引入外部最佳实践作为审查标准
- **"应该有"不构成发现** - 只有"需求已提及但实现不正确/不完整"才构成发现
- **安全特性例外** - 即使安全特性达不到，如果需求没提及，不报告为发现
```

### synthesis-and-presentation.md 置信度门控调整

```markdown
### 5.2 置信度门控

- 代码发现：抑制低于 0.60 的发现（P0 在 0.50+ 保留）
- 文档发现：抑制低于 0.50 的发现（P0 在 0.50+ 保留）
- 需求文档发现：仅保留 P0/P1，抑制所有 P2/P3
- 设计文档发现：严格按需求范围，抑制"建议改进"类的发现
```

### ae:prd 阶段 3.5 调整

```markdown
### 阶段 3.5：技能内 review 闭环

**范围严格性约束（硬约束）：** 审查需求文档时仅报告或修复阻断项（P0/P1），完全抑制 P2/P3。不检查需求未提及的内容是否"应该有"。

**审查调用：** 调用 `ae:review mode=headless domain=document <requirements-doc-path>`

**auto 修复范围：** 仅阻断项（格式不规范导致设计无法继续、章节缺失导致验收无法对齐、成功标准不可验证、In/Out Scope 模糊到会导致设计越界）。

**收敛协议（上限 2 轮）：**
- 第 1 轮：初次审查 -> auto 修复 -> 重新审查
- 收敛判定：重新审查后无新增 P0/P1 发现即为收敛
- 未收敛处理：2 轮后仍有 P0/P1 阻断，回退用户澄清，不进入阶段 4
- 不报告 P2/P3 - 即使存在也不提及，避免干扰用户决策
```

### ae:design 阶段 6 调整

```markdown
### 阶段 6：技能内 review 闭环

**范围严格性约束（硬约束）：** 审查设计文档时严格按需求范围，禁止无边界镀金。需求没有提及的一律不报告为发现，即使安全特性达不到也不要做。不建议添加需求未提及的功能、抽象、配置项或防御逻辑。

**auto 修复范围：** 仅阻断项：
- 章节缺失（必产出维度未产出或章节不完整到 ae:work 无法继续）
- 契约字段模糊到 ae:work 无法生成一致性产物
- 跨维度不一致（api 与 database 字段不对齐等到 ae:work 无法继续）
- 不修复"token 定义不全" - 除非需求明确提及设计 token
- 不修复"安全缺口" - 除非需求明确提及安全要求

**收敛协议（上限 2 轮）：**
- 第 1 轮：初次审查 -> auto 修复 -> 重新审查
- 收敛判定：无新增 P0/P1 发现即为收敛
- 未收敛处理：2 轮后仍有 P0/P1，回退用户澄清
- 不报告 P2/P3 - 即使存在也不提及
```

---

## 九、按需读取矩阵

| 任务 | 需要读取的文件 | 文件数 |
|------|--------------|--------|
| 改某模块需求 | prd.md + global/01-problem + global/02-scope + modules/\<m\>/02-requirements + modules/\<m\>/03-success-criteria | 5 |
| 改某模块 API 字段 | design.md + global/02-architecture + global/04-security + modules/\<m\>/02-api + modules/\<m\>/03-database | 5 |
| 改某模块 UI | prd modules/\<m\>/04-prototype + design.md + global/07-design-spec + prd global/08-design-vision + modules/\<m\>/04-ui-ux | 5 |
| 改技术选型 | design.md + global/02-architecture + global/03-constraints | 3 |
| 改全局视觉风格 | prd global/08-design-vision | 1 |
| 审查某模块 | design.md + modules/<m>/* + prd.md + prd global/* + prd modules/<m>/* | ~18 |

---

## 十、prd 不追问实现方式约束（硬约束）

### 核心原则第 5 条

```markdown
5. **禁止主动追问实现方式（硬约束）** - 不得主动询问用户使用什么前端框架、后端语言、
   数据库、UI 组件库、构建工具、API 风格、认证方案、缓存策略、架构风格等任何"怎么实现"
   的决策。技术选型和实现路线属于 `ae:design` 职责。仅当用户需求中**已明确提及**特定
   实现方式（如"用 React 实现""基于 Spring Boot""使用微服务架构""JWT 认证"）时，才
   在需求文档中记录该约束作为范围边界，且不追问超出用户已述范围的实现细节。
```

### 行为对照

| 行为 | 禁止 | 允许 |
|------|------|------|
| 主动追问技术栈 | ❌ | - |
| 主动追问 API 风格（REST/GraphQL/RPC） | ❌ | - |
| 主动追问数据库选型 | ❌ | - |
| 主动追问认证方案（JWT/Session） | ❌ | - |
| 主动追问缓存策略 | ❌ | - |
| 主动追问架构风格（微服务/单体） | ❌ | - |
| 主动追问任何"怎么实现"的问题 | ❌ | - |
| 记录用户在需求描述中已明确提及的实现约束 | - | ✅ 记录到 `global/07-tech-stack.md` |
| 记录用户在需求描述中已明确提及的实现方式约束 | - | ✅ 记录到 `global/07-tech-stack.md` 或 `global/03-decisions.md` |
| 推迟到 design 阶段决策 | - | ✅ 由 `global/02-architecture.md` ADR 决策 |

---

## 十一、响应式默认为否约束

### prd `global/08-design-vision.md` 响应式声明

```markdown
## 响应式声明

**默认值：不支持响应式，固定布局**

- 如果用户在需求描述中明确要求响应式自适应，则填写：
  - 是否响应式：是
  - 断点 1：≤ Npx - [布局变化描述]
  - 断点 2：≤ Npx - [布局变化描述]
- 如果用户未提及响应式，则填写：
  - 是否响应式：否（默认）
  - 说明：未要求响应式，固定布局
- 禁止主动追问用户是否需要响应式
```

### prd 模块内 `04-prototype.md` 响应式布局章节

```markdown
## 响应式布局

- 默认标注："不支持响应式，固定布局"
- 仅当 `global/08-design-vision.md` 中响应式声明为"是"时，本章节才填写各断点下的布局变化描述
- 否则本章节固定标注"不支持响应式，固定布局"
```

### 核心原则补充

```markdown
- **禁止主动追问响应式需求** - 除非用户在需求描述中明确要求响应式自适应页面，
  否则默认产出固定布局。响应式断点定义仅在用户明确要求时产出。
```

---

## 十二、产物自包含约束

### 约束

- 产物文件中禁止出现"详见 xxx.md"引用技能的 references/ 或项目外部 md
- 产物文件中禁止引用任何产物目录外的 md 文件
- 产物文件之间允许通过稳定 ID 和相对路径引用（如 `引用 global/02-architecture.md 的 ADR-001`）
- 外部文件内容应直接内化到产物中，不通过引用方式间接关联

### 特例：design 产物引用 prd 产物

design 的 `modules/<m>/04-ui-ux.md` 允许引用同项目 `ae/prds/<topic>-YYYY-MM-DD/modules/<m>/04-prototype.md` 作为上游产品逻辑层输入。此引用属于跨产物目录的上游追溯，不违反自包含约束，因为：
- prd 是 design 的上游产物，design.md frontmatter 的 `origin` 已声明该依赖关系
- 04-ui-ux.md 在 design 阶段需要基于 prd 的产品逻辑层产出代码层契约，引用是必要的
- 此引用是单向的（design -> prd），prd 产物不反向引用 design

### 允许的引用类型

| 引用类型 | 是否允许 | 说明 |
|---------|---------|------|
| 产物文件之间的稳定 ID 引用 | ✅ 允许 | 如 `EP-001`、`T-users`、`ST-001` 等 |
| 产物文件之间的相对路径引用 | ✅ 允许 | 如 `modules/auth/02-api.md` 中的 `引用 global/02-architecture.md` |
| design 引用同项目 prd 上游产物 | ✅ 允许（特例） | 如 `modules/<m>/04-ui-ux.md` 引用 `ae/prds/.../modules/<m>/04-prototype.md` |
| 引用技能的 references/ 外部 md | ❌ 禁止 | 如 `详见 references/api-template.md` |
| 引用任何项目外部 md | ❌ 禁止 | 如 `详见 docs/api-guide.md` |

---

## 十三、关键不变项

| # | 保留项 | 说明 |
|---|--------|------|
| 1 | 稳定 ID 体系 | R*/SC*/D*/NFR*/ADR-XXX/EP-XXX/T-XXX（语义命名如 T-users，非纯数字）/TC-XXX/ST-XXX/INT-XXX（UI 交互行为编号）/BR-XXX（业务规则编号） |
| 2 | 行数即时校验 | 生成时机制，≤ 300 行硬上限，不写入产物 |
| 3 | frontmatter `shards` | 文件清单（替代 Split Manifest） |
| 4 | `parent` + `module` | 子文件归属与追溯 |
| 5 | 显式否定机制 | `explicitly-omitted` |
| 6 | 版本演化 | `supersededBy` |
| 7 | 模块边界在 prd 阶段识别 | 与 design 模块目录一一对应 |
| 8 | 分层合并 prototype 与 ui-ux | prd 模块内 prototype.md -> design 模块内 ui-ux.md |
| 9 | 跨模块 traceability | `global/08-traceability.md` 保留 |
| 10 | 模块并行调度 | 一个 agent 处理某模块所有维度 |
| 11 | `global/04-dependencies.md`（prd） | 保留全局依赖与假设 |
| 12 | `global/05-open-questions.md`（prd） | 保留全局待定问题 |

---

## 十四、移除的机制

| # | 移除项 | 原因 |
|---|--------|------|
| 1 | design.md 的 Split Manifest 章节 | 与 frontmatter `shards` 冗余 |
| 2 | 文件索引表中的"行数"列 | 行数是生成时瞬态信息 |
| 3 | 任何 frontmatter 中的 `lines` 字段 | 同上 |
| 4 | `format: human-readable-requirements` | 描述性元数据 |
| 5 | `sharded: true` | 冗余 |
| 6 | `title`（design.md） | topic 已足够 |
| 7 | `last_updated`（design.md） | 与 date 重复 |
| 8 | 子文件 `status` | 跟随父文档 |
| 9 | 子文件 `section` | 从文件名推断 |
| 10 | 子文件 `heading_chain` | parent 链已足够 |
| 11 | `global/03-success-criteria.md`（prd） | 成功标准放模块内 |
| 12 | 模块内 01-module.md 的 4 类映射表 | 用 ID 引用替代 |
| 13 | overview.md 的 ADR 总表 | 真源在 architecture.md |
| 14 | overview.md 的范围映射 | design.md 索引已有 |
| 15 | 主动追问技术栈/实现方式/响应式 | 硬约束禁止 |
| 16 | 旧结构的 `prototype/` 独立目录 | 改为模块内 `04-prototype.md` |
| 17 | 旧结构的横切维度目录 | 改为模块内聚 |
| 18 | 设计子代理主动添加需求未提及的特性 | 硬约束禁止（不镀金） |
| 19 | 审查子代理报告需求未提及的"缺口" | 硬约束禁止（不镀金） |
| 20 | 审查需求文档时报告 P2/P3 | 完全抑制 |

---

## 十五、变更影响对比

### 修改局部时的影响范围

| 场景 | 旧结构影响文件数 | 新结构影响文件数 |
|------|----------------|----------------|
| 改某模块需求条目 | 5~7 个散落文件 | 1~2 个模块内文件（`modules/<m>/02-requirements.md` + 可能 `03-success-criteria.md`）；读取时另需 prd.md + 2 个全局文件（共 5 个） |
| 改某模块 API 字段 | 5~6 个跨目录文件 + traceability.md | 2~3 个模块内文件（`modules/<m>/02-api.md` + `03-database.md` 如果字段映射 + `04-ui-ux.md` 如果影响状态）；读取时另需 design.md + 2 个全局文件（共 5 个） |
| 改某模块 UI 状态 | 4~5 个 | 1~2 个模块内文件（`modules/<m>/04-ui-ux.md` + `05-test-cases.md` 如果覆盖该状态）；读取时另需 prd prototype + design.md + 2 个全局文件（共 5 个） |
| 改全局视觉风格 | 1 个 | 1 个（`global/08-design-vision.md`，prd 视觉决策）+ 1 个（`global/07-design-spec.md`，design 设计规范，如果涉及设计体系变更） |
| 改技术选型 | 2~3 个 | 2 个（`global/02-architecture.md` + `global/03-constraints.md`） |
| 新增模块 | 3~4 个 | 3 个（`prd.md` + `global/02-scope.md` + 新模块目录） |

### 文件耦合度

| 文件 | 旧结构耦合文件数 | 新结构耦合文件数 |
|------|----------------|----------------|
| `modules/<m>/01-module.md` | 4（映射表关联所有维度） | 0（不被其他文件引用；自身 ID 表随维度文件变更更新） |
| `global/01-overview.md`（design） | 3（architecture ADR + 模块清单 + traceability） | 0（精简为设计读数 + 版本） |
| `global/03-success-criteria.md`（prd） | N（被模块引用） | 移除 |
| `global/05-dependencies.md`（prd） | N（被模块引用） | 保留（全局依赖单一视图） |
| 维度文件之间 | 通过 01-module.md 映射表耦合 | 通过 ID 引用松耦合 |

### 一次性读取文件数

| 任务 | 旧结构 | 新结构 |
|------|--------|--------|
| 改某模块需求 | 14 个 | 5 个 |
| 改某模块 API | 14 个 | 5 个 |
| 改某模块 UI | 14 个 | 5 个 |
| 审查某模块 | 24 个 | ~18 个 |

---

## 十六、需要修改的文件清单

### 技能入口（4 个）

| # | 文件 | 修改内容 |
|---|------|---------|
| 1 | `src/assets/skills/ae-prd/SKILL.md` | 重写阶段 3 产物结构，新增模块识别步骤，改为 modules/\<m\>/04-prototype.md；阶段 3.5 调整为仅 P0/P1；新增禁止追问实现方式、响应式默认为否、不镀金约束 |
| 2 | `src/assets/skills/ae-prd/references/requirements-capture.md` | 重写产物结构、模板、分片规则，新增 `global/` 和 `modules/\<m\>/` 目录模板 |
| 3 | `src/assets/skills/ae-prd/references/handoff.md` | 更新产物路径引用 |
| 4 | `src/assets/skills/ae-design/SKILL.md` | 重写维度触发逻辑（全局 vs 模块），重写调度策略（模块并行），重写阶段 4-5；阶段 6 调整为严格按需求范围；新增不镀金约束 |

### 审查技能（2 个）

| # | 文件 | 修改内容 |
|---|------|---------|
| 5 | `src/assets/skills/ae-review/SKILL.md` | 新增"范围严格性约束"章节（审查需求仅 P0/P1、审查设计禁止镀金、需求没提及的一律不做） |
| 6 | `src/assets/skills/ae-review/references/synthesis-and-presentation.md` | 置信度门控调整（需求文档仅 P0/P1、设计文档严格按需求范围） |

### 审查子代理（12 个）

| # | 文件 | 修改内容 |
|---|------|---------|
| 7 | `src/assets/agents/reviewers/document-reviewer.md` | 只报告 P0/P1，不检查"约束完整性"，不报告 P2/P3 |
| 8 | `src/assets/agents/reviewers/design-integrity-reviewer.md` | 严格按需求范围，不检查需求未提及的维度间一致性 |
| 9 | `src/assets/agents/reviewers/security-design-reviewer.md` | 只检查需求已提及的安全要求，不报告"应该有但没有" |
| 10 | `src/assets/agents/reviewers/architecture-design-reviewer.md` | 只检查需求已提及的架构要求 |
| 11 | `src/assets/agents/reviewers/api-design-reviewer.md` | 只检查需求已提及的 API 要求 |
| 12 | `src/assets/agents/reviewers/database-design-reviewer.md` | 只检查需求已提及的数据库要求 |
| 13 | `src/assets/agents/reviewers/observability-design-reviewer.md` | 只检查需求已提及的可观测性要求 |
| 14 | `src/assets/agents/reviewers/non-functional-design-reviewer.md` | 只检查需求已提及的非功能要求 |
| 15 | `src/assets/agents/reviewers/test-cases-design-reviewer.md` | 只检查需求已提及的测试要求 |
| 16 | `src/assets/agents/reviewers/ui-ux-design-reviewer.md` | 只检查需求已提及的 UI/UX 要求 |
| 17 | `src/assets/agents/reviewers/adversarial-reviewer.md` | **新增** adversarial-reviewer.md 并写入范围严格性约束（该文件当前不存在，需新建） |
| 18 | `src/assets/agents/reviewers/goal-alignment-reviewer.md` | 只检查需求已提及的内容是否达成目标 |

### 设计子代理（8 个）

| # | 文件 | 修改内容 |
|---|------|---------|
| 19 | `src/assets/agents/workflow/security-designer.md` | 只产出需求已提及的安全特性，不主动添加 STRIDE/审计日志/合规/加密存储/加密传输等 |
| 20 | `src/assets/agents/workflow/architecture-designer.md` | 只产出需求已提及的架构内容 |
| 21 | `src/assets/agents/workflow/observability-designer.md` | 只产出需求已提及的可观测性内容 |
| 22 | `src/assets/agents/workflow/non-functional-designer.md` | 只产出需求已提及的非功能内容 |
| 23 | `src/assets/agents/workflow/api-designer.md` | 只产出需求已提及的 API 内容 |
| 24 | `src/assets/agents/workflow/database-designer.md` | 只产出需求已提及的数据库内容 |
| 25 | `src/assets/agents/workflow/ui-ux-designer.md` | 只产出需求已提及的 UI/UX 内容 |
| 26 | `src/assets/agents/workflow/test-cases-designer.md` | 只产出需求已提及的测试内容 |

### 设计 references（8 个）

| # | 文件 | 修改内容 |
|---|------|---------|
| 27 | `src/assets/skills/ae-design/references/design-output-template.md` | 重写产物目录结构、design.md 模板、file-plan 机制 |
| 28 | `src/assets/skills/ae-design/references/dimension-triggers.md` | 拆分为全局维度触发 + 模块维度触发 |
| 29 | `src/assets/skills/ae-design/references/cross-dimension-mapping.md` | 拆分为模块内 ID 引用 + 跨模块映射 |
| 30 | `src/assets/skills/ae-design/references/overview-template.md` | 精简为设计读数 + 版本 + 跨模块一致性约束声明 |
| 31 | `src/assets/skills/ae-design/references/architecture-template.md` | 改为全局架构（模块边界 + 跨模块依赖），ADR 真源 |
| 32 | `src/assets/skills/ae-design/references/security-template.md` | 改为只产出需求已提及的安全特性 |
| 33 | `src/assets/skills/ae-design/references/ui-ux-template.md` | 改为模块级 UI/UX 模板，引用 prd prototype.md 分层 |
| 34 | `src/assets/skills/ae-design/references/test-cases-template.md` | 改为模块级测试用例模板 |

---

## 附录：方案确认记录

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 产物兼容性策略 | 破坏性变更 |
| 2 | 原型与 UI 设计关系 | 分层合并 |
| 3 | 模块划分时机 | prd 阶段识别 |
| 4 | 子代理调度策略 | 模块并行调度 |
| 5 | 跨模块映射表简化 | 拆分为模块内 + 跨模块 |
| 6 | 模块内 traceability | 移除映射表，用 ID 引用 |
| 7 | overview.md 精简 | 精简为设计读数 + 版本 |
| 8 | prd 全局文件精简 | 只移除 success-criteria |
| 9 | 不镀金约束范围 | 全量修改（设计子代理 + 审查子代理） |
| 10 | P2/P3 处理 | 完全抑制 P2/P3 |
| 11 | 需求未提及的一律不做 | 确认（含加密存储/加密传输/响应式等具体例子） |
| 12 | 元数据精简 | 移除 format/sharded/title/last_updated/section/heading_chain/子文件 status |
| 13 | 移除行数元数据 | 确认 |
| 14 | 统一序号前缀 | 确认 |
| 15 | 产物自包含 | 确认（产物不引用外部 md） |
| 16 | prd 不追问实现方式 | 确认（扩展为所有"怎么实现"决策） |
| 17 | 响应式默认为否 | 确认 |

---

## 附录二：审查发现的待补全项

> 以下发现由 ae:review autofix 审查识别，已修复可推断的不一致；以下项目需要进一步设计决策，在实施阶段补全。

### 待补全设计决策（P1 级）

| # | 发现 | 待决策内容 | 建议方向 |
|---|------|----------|---------|
| 1 | ID 引用语法未形式化 | 定义模块内文件间 ID 引用的语法格式（如 `EP-001`、`T-users.name`、`ST-001->EP-001`） | 定义最小可解析语法，供 ae:review 校验引用有效性 |
| 2 | global/08-traceability.md 记录格式未定义 | 定义跨模块映射的 schema（字段、引用方式） | 参考旧 4 类映射表，精简为跨模块专用的 2 类：API 调用关系 + 数据流 |
| 3 | 模块对外暴露契约清单缺少必填字段 | 定义 01-module.md 中契约清单的模板（端点、事件、共享表的必填属性） | 参考 OpenAPI 摘要格式，含 ID、路径、方法、消费者模块 |
| 4 | 跨表引用声明格式未定义 | 定义 03-database.md 中跨模块逻辑外键的声明格式 | 含源表/列、目标模块/表/列、基数、可空性 |
| 5 | 敏感字段标注机制未定义 | 定义 03-database.md 标注敏感字段和引用 global/04-security.md 数据分级的语法 | 含字段名、分级等级（如 PII/凭证/财务）、引用 ID |
| 6 | 逻辑软约束完整性策略未定义 | 定义移除 FOREIGN KEY 后的引用完整性维护策略 | 含校验时机、悬空外键处理、级联行为声明 |
| 7 | 设计 Token 归属未明确 | 明确字号/字重/行高/间距阶/圆角/阴影等 Token 由 global/07-design-spec.md 还是 modules/\<m\>/04-ui-ux.md 定义 | 建议全局 Token 在 design-spec.md，模块特有 Token 在 ui-ux.md |
| 8 | 视觉决策引用链断裂 | 定义 design-vision -> design-spec -> ui-ux 的引用链路 | design-spec.md 消费 design-vision.md 的主题色/断点，ui-ux.md 引用 design-spec.md |
| 9 | 覆盖度验证机制未定义 | 定义移除模块内映射表后如何验证测试覆盖完整 | 建议在 ae:review 阶段动态推导 ID 引用覆盖，不持久化 |
| 10 | 02-api.md 契约要求不完整 | 补充认证方式/授权粒度/幂等性/版本策略等必填字段 | 仅当需求已提及时要求，遵循不镀金约束 |

### 已修复的 Auto 项

| # | 发现 | 修复内容 |
|---|------|---------|
| 1 | ADR 引用示例指向错误文件 | global/04-security.md -> global/02-architecture.md |
| 2 | design-spec 循环依赖表述 | "前置依赖 ui-ux 维度" -> "ui-ux 维度的前置输入" |
| 3 | test-cases.md 遗漏 PAGE-XXX | 添加 PAGE-XXX 到 ID 引用集合 |
| 4 | 可选文件未纳入调度顺序 | 阶段 2 串行顺序增加 06/07 条件步骤 |
| 5 | prd.md 索引顺序错误 | 07-tech-stack 排在 08-design-vision 之前 |
| 6 | 按需读取路径缺占位符 | 补全 modules/\<m\>/ 前缀 |
| 7 | adversarial-reviewer.md 不存在 | 标注为"新增" |
| 8 | 稳定 ID 范围未预分配 | 阶段 1 增加预分配步骤 |
| 9 | 阶段 3 仅读索引 | 改为读取实际维度文件 |
| 10 | traceability 骨架缺回填 | 阶段 3 增加回填步骤 |
| 11 | 缺失败处理协议 | 阶段 3 增加返工路径 |
| 12 | module 字段表述歧义 | 澄清 shards 条目中的 module 字段保留 |
| 13 | traceability "始终必产出"歧义 | 补充"即使无跨模块关系也产出空骨架" |
| 14 | INT-XXX/BR-XXX 未定义 | 添加含义说明 |
| 15 | 按需读取与变更影响文件数不一致 | 统一口径，变更影响表区分"修改文件"和"读取文件" |
| 16 | ui-ux.md 引用 prd 产物违反自包含 | 声明为允许的特例 |
| 17 | 01-module.md "只读索引"与 ID 表矛盾 | 澄清：不被引用，但自身需随维度变更更新 |
| 18 | architecture.md 与 traceability.md 职责重叠 | 明确定义权在 architecture.md，traceability 仅引用 |
| 19 | T-XXX 与 T-users 格式不一致 | 标注 T-XXX 使用语义命名 |
| 20 | "涉及持久化"判定标准模糊 | 补充判定标准 |
| 21 | global/04-security.md 触发条件不一致 | 维度触发不等于必须产出全部内容，遵循不镀金约束 |
