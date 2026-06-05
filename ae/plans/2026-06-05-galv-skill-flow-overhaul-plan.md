---
type: plan
status: drafted
date: 2026-06-05
title: galv-skill-flow-overhaul
depth: deep
format: human-readable-plan
sharded: false
---

# GALV 技能流程重构：覆盖需求规格说明书编码前完整流程

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标

**来源**：当前 GALV 技能流程存在三个核心缺口：
1. G1（不变量）→ G2（数据模型）之间缺少业务场景/功能需求分析，导致字段发现不完整
2. 系统架构设计、安全设计、非功能性需求、外部系统集成等编码前关键阶段未覆盖
3. 缺少 DDL 外键策略统一约束和产物审查闭环

**目标**：重构 GALV 技能流程，使其产出完全覆盖需求规格说明书中对编码阶段有实际指导意义的内容，排除团队、硬件、软件资源等非编码相关内容。

**非目标**：
- 不覆盖部署/基础设施设计（运维层面，不影响业务设计文档）
- 不覆盖测试策略设计（G4/A2/L3/V1 已覆盖验证层面）
- 不覆盖数据迁移策略（仅对已有系统需要，非通用）
- 不修改 ae:review 技能本身

## 范围

### 包含
- 新增 2 个技能（G2 业务场景、G3 架构与安全设计）
- 重命名和重编号 2 个技能（原 G2→G4、原 G3→G5）
- 修改 9 个现有技能（G1、A1、A2、L1、L2、L3、V1、V2 + 原 G2/G3 重编号）
- DDL 外键策略统一改为逻辑软约束
- 每个技能完成后增加 ae:review 产物审查步骤
- `ae-asset-schema.ts` 常量重编号
- 所有 references/*.md 同步更新
- 项目文档（skill-architecture.md、usage-guide.md）同步更新

### 不包含
- ae:review 技能本身的修改
- 部署/基础设施/测试策略/数据迁移相关技能
- 运行时代码（tools/、services/）的修改（仅改技能资产和常量注册）

### 约束
- 产物根目录统一为 `docs/ae/galv/<项目名>/`
- 所有产物文件 ≤ 500 行
- 所有产物采用 YAML Frontmatter + Markdown 正文单轨格式
- DDL 禁止 FOREIGN KEY 约束
- 每个技能产物写入后必须调用 `ae:review mode=autofix domain=document` 自动审查并修复，仅审查本技能有编辑权限的产物目录，不审查其他技能的产物

## 需求追溯

| 需求 ID | 描述 | 计划响应 |
|---------|------|---------|
| R1 | G1→数据模型之间缺少业务场景分析 | U1（新增 G2 技能） |
| R2 | 系统架构设计未覆盖 | U2（新增 G3 技能） |
| R3 | 安全设计未覆盖 | U2（G3 中包含安全设计任务） |
| R4 | 非功能性需求未定义 | U3（增强 G1） |
| R5 | 外部系统集成设计未覆盖 | U5（增强 A1） |
| R6 | 全局错误处理策略未覆盖 | U7（增强 L2） |
| R7 | DDL 外键约束需改为逻辑软约束 | U4 + U9 + U10 |
| R8 | 每个技能完成后需调用 ae:review | U1~U12（所有技能） |
| R9 | 技能编号重排 | U4 + U5 + U13 + U14 |

## 高层技术设计

### 修正后的完整流程

```
需求文档 ─┬─→ G1 不变量与边界(+NFR) ─→ g1/ ─→ ae:review ─→ 人工审核
          │         │
          └─→ G2 业务场景分析 ────────→ g2/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       G3 架构与安全设计 ────────────→ g3/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       G4 数据模型(无FK) ───────────→ g4/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       G5 全局推演 ─────────────────→ g5/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       A1 跨模块契约(+外部集成) ────→ a1/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       A2 关联推演 ─────────────────→ a2/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       L1 界面规格 ─────────────────→ l1/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       L2 模块设计(无FK,+全局错误) ─→ l2/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       L3 模块验证(引用一致性) ─────→ l3/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       V1 E2E验证 ─────────────────→ v1/ ─→ ae:review ─→ 人工审核
                    │
                    ↓
       V2 完整性回溯(7列矩阵) ─────→ v2/ ─→ ae:review ─→ 人工审核
```

### 新编号方案

| 新编号 | 技能名 | 原编号 | 变化类型 |
|--------|--------|--------|---------|
| G1 | `ae:g1-invariants` | G1 | 局部修改（+NFR 提取、+审查） |
| G2 | `ae:g2-business-scenarios` | **新增** | **新增** |
| G3 | `ae:g3-architecture` | **新增** | **新增** |
| G4 | `ae:g4-data-model` | 原 G2 | 编号+2，重大修改 |
| G5 | `ae:g5-global-trace` | 原 G3 | 编号+2，局部修改 |
| A1 | `ae:a1-contracts` | A1 | 局部修改 |
| A2 | `ae:a2-assoc-trace` | A2 | 局部修改 |
| L1 | `ae:l1-ui-spec` | L1 | 局部修改 |
| L2 | `ae:l2-module-design` | L2 | 局部修改 |
| L3 | `ae:l3-module-verify` | L3 | 局部修改 |
| V1 | `ae:v1-e2e-verify` | V1 | 局部修改 |
| V2 | `ae:v2-completeness` | V2 | 局部修改 |

### 关键决策

- D1. 架构与安全合并为一个技能 G3 → 理由：架构决策和安全决策高度耦合（技术栈决定认证方案、部署拓扑决定网络边界），拆分为两个技能会增加回退复杂度
- D2. 非功能性需求增强到 G1 → 理由：NFR 和不变量同属"约束性表述"，在需求分析阶段提取最自然，且 NFR 是架构设计的输入
- D3. 外部系统集成增强到 A1 → 理由：外部系统集成本质是"跨边界契约"，与 A1 跨模块契约的职责一致，无需独立技能
- D4. 全局错误处理增强到 L2 → 理由：错误码/传播/日志是模块实现的一部分，全局策略作为 L2 的共享约束声明
- D5. DDL 禁止 FOREIGN KEY → 理由：用户明确要求，外键用逻辑软约束（logical_ref + 注释 `-- ref:`）
- D6. 审查模式统一用 `ae:review mode=autofix domain=document` → 理由：GALV 产物全是文档，autofix 模式自动审查并修复 auto 级别问题，无需人工干预；每个技能仅审查自己的产物目录（如 G2 只审查 `g2/`），不审查其他技能的产物

## 实现单元

### U1. 新增 G2 技能 `ae:g2-business-scenarios`

- [ ] 目标: 填补 G1（约束）→ G4（数据模型）之间的功能需求缺口
- [ ] 覆盖需求: R1
- [ ] 唯一产出物: `src/assets/skills/ae-g2-business-scenarios/SKILL.md` + `references/g2-spec.md`
- [ ] 依赖: U2（G3 需要 G2 产物作为输入，严格串行）
- [ ] 文件:
  - `src/assets/skills/ae-g2-business-scenarios/SKILL.md`（新建）
  - `src/assets/skills/ae-g2-business-scenarios/references/g2-spec.md`（新建）
- [ ] 方法:
  - SKILL.md 包含完整技能定义：角色、适用/不适用场景、产物根目录、产物独占、输入、执行流程（T1~T7）、产物格式、验收关卡、回退说明、安全边界、完成标准
  - 执行流程:
    - T1 提取业务场景（关注"用户可以""系统应当""支持""提供"，每场景记录 id/name/actor/trigger/preconditions/postconditions/source_ref/module）
    - T2 定义业务操作（每场景展开操作序列，标注 input_fields/output_fields）
    - T3 双源字段发现与合并（不变量字段 origin:derived ∪ 业务场景字段 origin:inferred）
    - T4 定义用户角色与权限
    - T5 标注跨场景依赖（时序/因果依赖图，要求无环）
    - T6 写入产物
    - T7 产物审查（`ae:review mode=autofix domain=document g2/`，仅审查 g2/ 目录，最多3次）
  - 验收关卡: G2-K1~K9（场景覆盖、操作字段闭合、字段双源闭合、角色覆盖、依赖无环、歧义闭合、文件行数、审查通过、人工审核）
  - 产物: `g2/business-scenarios/`、`g2/field-catalog.md`、`g2/roles.md`
- [ ] 需遵循的模式:
  - 产物根目录规则与 G1 一致（`docs/ae/galv/<项目名>/`，galv-manifest.yaml 约定）
  - 单轨格式（YAML Frontmatter + Markdown 正文）
  - 禁读后续技能产物
  - 完成标准含审查通过 + 人工审核
- [ ] 测试场景:
  - 正常路径: 需求文档 → G2 产物写入 → ae:review 通过
  - 边界情况: 单场景系统、无跨场景依赖
  - 错误路径: 需求文档缺失、上游 G1 产物缺失
- [ ] 验证: SKILL.md 结构符合 opencode-native-assets 规范（frontmatter 含 name/description，正文含角色/流程/边界/验收）

### U2. 新增 G3 技能 `ae:g3-architecture`

- [ ] 目标: 覆盖系统架构设计和安全设计，为下游 L2/A1/G4 提供技术决策上下文
- [ ] 覆盖需求: R2, R3
- [ ] 唯一产出物: `src/assets/skills/ae-g3-architecture/SKILL.md` + `references/g3-spec.md`
- [ ] 依赖: U1（G2 产物是 G3 的输入之一）
- [ ] 文件:
  - `src/assets/skills/ae-g3-architecture/SKILL.md`（新建）
  - `src/assets/skills/ae-g3-architecture/references/g3-spec.md`（新建）
- [ ] 方法:
  - SKILL.md 包含完整技能定义
  - 执行流程:
    - T1 架构风格决策（单体/微服务/Serverless/事件驱动，基于 G2 业务场景的模块拆分和 G1 边界约束推导）
    - T2 技术栈选型（语言/框架/中间件/数据库类型，基于架构风格和 G2 场景特性）
    - T3 部署拓扑设计（服务部署方式、网络分区、服务发现，基于架构风格）
    - T4 模块间通信模式（同步HTTP/异步消息/共享数据库，基于 G2 场景交互模式和 G1 跨模块约束）
    - T5 认证授权模型（JWT/Session/OAuth2/RBAC/ABAC，基于 G2 角色定义和 G1 安全不变量）
    - T6 数据保护策略（传输加密/存储加密/敏感字段脱敏/审计日志，基于 G1 安全不变量和 G2 场景数据流）
    - T7 威胁建模（攻击面分析、风险评级、缓解措施，基于 G1 边界和 G2 场景）
    - T8 写入产物
    - T9 产物审查
  - 验收关卡: G3-K1~K10（架构风格明确、技术栈确定、通信模式完整、认证授权覆盖所有角色、数据保护覆盖所有安全不变量、威胁建模覆盖所有外部交互面、与G1/G2一致、文件行数、审查通过、人工审核）
  - 产物:
    - `g3/architecture.md`（架构风格+技术栈+部署拓扑+通信模式+伸缩策略）
    - `g3/security.md`（认证授权+数据保护+威胁建模+审计日志策略）
  - 关键约束:
    - 架构决策必须引用 G1 不变量和 G2 业务场景作为依据
    - 安全设计必须覆盖 G2 roles.md 中所有角色
    - 威胁建模必须覆盖 G1 boundary.md 中所有外部交互
- [ ] 需遵循的模式: 同 U1
- [ ] 测试场景:
  - 正常路径: G1+G2 产物 → G3 架构+安全产物
  - 边界情况: 单体架构（通信模式简化）、无外部交互（威胁建模简化）
  - 错误路径: 上游产物缺失
- [ ] 验证: SKILL.md 结构合规；架构决策有 G1/G2 依据；安全设计覆盖 G2 所有角色

### U3. 修改 G1 技能 `ae:g1-invariants`（增强 NFR 提取 + 审查步骤）

- [ ] 目标: 增加 NFR 提取能力，增加产物审查步骤
- [ ] 覆盖需求: R4, R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-g1-invariants/SKILL.md`
- [ ] 依赖: 无
- [ ] 文件:
  - `src/assets/skills/ae-g1-invariants/SKILL.md`（修改）
  - `src/assets/skills/ae-g1-invariants/references/g1-spec.md`（修改）
- [ ] 方法:
  - 执行流程新增:
    - T8 提取非功能性需求：从需求文档提取 SLA（可用性/响应时间）、容量规划（用户量/数据量/QPS）、灾备要求（RPO/RTO）。每条 NFR 记录 id/type/target/value/source_ref，写入 `g1/nfr.md`
    - T9 产物审查（`ae:review mode=autofix domain=document g1/`，仅审查 g1/ 目录）
  - 验收关卡新增:
    - G1-K8: NFR 覆盖完整（每个性能/可用性/安全相关不变量有对应 NFR 量化目标）
    - G1-K9: 产物审查通过
  - 新增产物: `g1/nfr.md`（非功能性需求清单）
  - 禁读列表更新为: G2/G3/G4/G5/A1/A2/L1/L2/L3/V1/V2
  - 完成标准更新: 含 G1-K8、G1-K9 通过
- [ ] 需遵循的模式: 保持现有 G1 结构不变，仅追加 T8/T9 和 K8/K9
- [ ] 测试场景:
  - 正常路径: 需求文档 → G1 产物含 NFR → ae:review 通过
  - 边界情况: 需求文档无 NFR 描述（NFR 产物为空，标注"需求文档未声明 NFR"）
- [ ] 验证: 新增 T8/T9 步骤存在；K8/K9 验收关卡存在；g1/nfr.md 产物声明存在

### U4. 重命名原 G2 为 G4 `ae:g4-data-model`（编号+2，重大修改）

- [ ] 目标: 原数据模型技能重编号，增加 G2/G3 依赖，DDL 禁 FK，增加字段来源标注，增加审查
- [ ] 覆盖需求: R1, R7, R8
- [ ] 唯一产出物: `src/assets/skills/ae-g4-data-model/SKILL.md`（从原 g2 重命名目录）
- [ ] 依赖: U1, U2
- [ ] 文件:
  - `src/assets/skills/ae-g2-data-model/` → 重命名为 `src/assets/skills/ae-g4-data-model/`
  - `src/assets/skills/ae-g4-data-model/SKILL.md`（修改）
  - `src/assets/skills/ae-g4-data-model/references/g2-spec.md` → 重命名为 `g4-spec.md`（修改）
- [ ] 方法:
  - 技能名: `ae:g2-data-model` → `ae:g4-data-model`
  - 产物目录: `g2/` → `g4/`
  - 上游依赖: G1 → **G1 + G2 + G3**
  - T1 实体发现: "从不变量推导实体" → "基于 G2 field-catalog 合并字段集确认实体，不变量补充约束性实体"
  - T2 关系定义: "定义外键字段及关联条件" → "定义逻辑关联字段及引用关系（logical_ref，非数据库外键）"
  - T3 关系级约束: "基数、级联规则" → "基数、逻辑引用规则（级联仅逻辑声明，不生成 ON DELETE CASCADE）"
  - T5 跨实体约束: "CHECK 或触发器" → "逻辑声明标注，DDL 中不生成 FOREIGN KEY"
  - T7 DDL 生成: `PRIMARY KEY + FOREIGN KEY + CHECK + UNIQUE + NOT NULL` → `PRIMARY KEY + CHECK + UNIQUE + NOT NULL（禁止 FOREIGN KEY，引用在注释 -- ref: Entity.field 中声明）`
  - Frontmatter: `foreign_key: 外键字段` → `logical_ref: 引用实体.字段`
  - 新增字段标注: `origin`（derived/inferred）、`source_scenario`
  - 新增 T10: 产物审查
  - 新增 K(新): 字段双源闭合
  - 新增 K(新): 产物审查通过
  - 验收关卡重编号: G2-K1~K10 → G4-K1~K12
  - 禁读列表更新: G3/A1/A2/... → G5/A1/A2/...
- [ ] 需遵循的模式: 产物根目录和单轨格式规则不变
- [ ] 测试场景:
  - 正常路径: G1+G2+G3 → G4 产物 → DDL 无 FK → ae:review 通过
  - 边界情况: 无跨实体引用（无 logical_ref）
- [ ] 验证: SKILL.md 中无 FOREIGN KEY 字样；logical_ref 替代 foreign_key；T10 审查步骤存在

### U5. 重命名原 G3 为 G5 `ae:g5-global-trace`（编号+2，局部修改）

- [ ] 目标: 原全局推演技能重编号，增加 G2/G3/G4 依赖，场景来源引用 G2 业务场景
- [ ] 覆盖需求: R1, R8
- [ ] 唯一产出物: `src/assets/skills/ae-g5-global-trace/SKILL.md`
- [ ] 依赖: U4
- [ ] 文件:
  - `src/assets/skills/ae-g3-global-trace/` → 重命名为 `src/assets/skills/ae-g5-global-trace/`
  - `src/assets/skills/ae-g5-global-trace/SKILL.md`（修改）
  - `src/assets/skills/ae-g5-global-trace/references/g3-spec.md` → 重命名为 `g5-spec.md`（修改）
- [ ] 方法:
  - 技能名: `ae:g3-global-trace` → `ae:g5-global-trace`
  - 产物目录: `g3/` → `g5/`
  - 上游依赖: G1+G2 → **G1+G2+G3+G4**
  - T1 场景设计: "针对核心业务流程设计场景" → "基于 g2/business-scenarios/ 设计推演场景"
  - 上游引用 DDL: "g2/ddl-verify.sql" → "g4/ddl-verify.sql"
  - 新增 T5: 产物审查
  - 新增 G5-K7: 场景来源可解析（每个推演场景引用 G2 业务场景 ID）
  - 新增 G5-K8: 产物审查通过
  - 禁读列表更新: A1/A2/... → 不变
- [ ] 需遵循的模式: 同 U4
- [ ] 测试场景: 正常路径; 场景引用 G2 ID 可解析
- [ ] 验证: 上游引用 g4/ 非 g2/；T5 审查步骤存在

### U6. 修改 A1 技能 `ae:a1-contracts`（增强外部系统集成 + 审查）

- [ ] 目标: 增加外部系统集成设计能力，增加审查步骤
- [ ] 覆盖需求: R5, R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-a1-contracts/SKILL.md`
- [ ] 依赖: U5
- [ ] 文件:
  - `src/assets/skills/ae-a1-contracts/SKILL.md`（修改）
  - `src/assets/skills/ae-a1-contracts/references/a1-spec.md`（修改）
- [ ] 方法:
  - 上游依赖: G1+G2+G3 → **G1+G2+G3+G4+G5**
  - T1 依赖识别: "外键、API 调用、事件订阅" → "逻辑引用、API 调用、事件订阅"
  - 新增输入: `g2/business-scenarios/`（场景驱动跨模块交互识别）、`g3/architecture.md`（通信模式决策）、`g3/security.md`（安全边界）
  - T6 模拟用例: 可引用 G2 业务场景操作作为模拟基础
  - 新增 T7: 外部系统集成设计（基于 G1 boundary.md 外部交互 + G3 架构决策，定义外部系统协议/重试/熔断/降级/数据映射/版本兼容）
  - 新增产物: `a1/external-integrations.md`（外部系统集成契约，含协议/重试/熔断/降级/数据映射/版本兼容策略）
  - 契约 Frontmatter 新增: `security_context`（认证方式/权限要求，引用 g3/security.md）
  - 新增 T8: 产物审查
  - 新增 A1-K11: 外部集成覆盖（G1 boundary.md 中每个外部交互有对应集成定义）
  - 新增 A1-K12: 产物审查通过
  - 上游引用更新: "g2/data-model/" → "g4/data-model/"
  - 单模块简化规则更新: 无外部交互时 external-integrations.md 可不创建
- [ ] 需遵循的模式: 保持 A1 现有结构，追加 T7/T8 和 K11/K12
- [ ] 测试场景:
  - 正常路径: 含外部系统的多模块场景
  - 边界情况: 单模块无外部交互（external-integrations.md 不创建）
- [ ] 验证: T7/T8 存在；K11/K12 存在；external-integrations.md 产物声明存在

### U7. 修改 A2 技能 `ae:a2-assoc-trace`（上游引用更新 + 审查）

- [ ] 目标: 上游引用更新为 G2/G4/G5，增加审查步骤
- [ ] 覆盖需求: R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-a2-assoc-trace/SKILL.md`
- [ ] 依赖: U6
- [ ] 文件:
  - `src/assets/skills/ae-a2-assoc-trace/SKILL.md`（修改）
  - `src/assets/skills/ae-a2-assoc-trace/references/a2-spec.md`（修改）
- [ ] 方法:
  - 上游依赖: G1+G2+G3+A1 → **G1+G2+G3+G4+G5+A1**
  - T1 场景扩展: "从 G3 场景扩展" → "从 G5 场景扩展"
  - 上游引用: "g2/data-model/" → "g4/data-model/"
  - 新增 T5: 产物审查
  - 新增 A2-K8: 产物审查通过
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景: 正常路径
- [ ] 验证: 上游引用 g4/g5 非 g2/g3

### U8. 修改 L1 技能 `ae:l1-ui-spec`（引用 G2 场景 + G3 安全 + 审查）

- [ ] 目标: 视图和交互从 G2 业务场景驱动，安全约束引用 G3
- [ ] 覆盖需求: R1, R3, R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-l1-ui-spec/SKILL.md`
- [ ] 依赖: U7
- [ ] 文件:
  - `src/assets/skills/ae-l1-ui-spec/SKILL.md`（修改）
  - `src/assets/skills/ae-l1-ui-spec/references/l1-spec.md`（修改）
- [ ] 方法:
  - 上游依赖: G1+G2+G3+A1+A2 → **G1+G2+G3+G4+G5+A1+A2**
  - T1 列出视图: "遍历业务场景" → "基于 g2/business-scenarios/ 列出视图"
  - T4 交互行为: 引用 g2/business-scenarios/ 操作序列定义交互
  - T6 校验规则: 补充引用 g3/security.md 认证授权约束
  - 上游引用: "g2/data-model/" → "g4/data-model/"
  - 新增 T9: 产物审查
  - 新增 L1-K8: 产物审查通过
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景: 正常路径
- [ ] 验证: T1 引用 g2/business-scenarios/

### U9. 修改 L2 技能 `ae:l2-module-design`（增强全局错误策略 + DDL 禁 FK + 审查）

- [ ] 目标: 增加全局错误处理策略，DDL 禁 FK，增加审查
- [ ] 覆盖需求: R6, R7, R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-l2-module-design/SKILL.md`
- [ ] 依赖: U8
- [ ] 文件:
  - `src/assets/skills/ae-l2-module-design/SKILL.md`（修改）
  - `src/assets/skills/ae-l2-module-design/references/l2-spec.md`（修改）
- [ ] 方法:
  - 上游依赖: G1~A2+L1 → **G1+G2+G3+G4+G5+A1+A2+L1**
  - T1 职责范围: 补充从 G2 业务场景提取本模块相关场景
  - T2 内部逻辑: 补充引用 G2 操作序列
  - T3 DDL: 新增"禁止 FOREIGN KEY 约束，引用在注释 -- ref: Entity.field 中声明"
  - T4 接口实现: 新增引用 g3/security.md 认证授权约束
  - 新增 T8: 定义全局错误处理策略（错误码全局编码规则、错误传播规范、关联ID标准、结构化日志格式），写入 `l2/{module}/design/error-strategy.md` 或合并到 index.md
  - 新增 T9: 产物审查
  - 新增 L2-K9: 全局错误策略一致（错误码/传播/关联ID/日志格式在所有模块间一致）
  - 新增 L2-K10: 产物审查通过
  - 上游引用: "g2/data-model/" → "g4/data-model/"
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景:
  - 正常路径: 多模块场景下错误策略一致
  - 边界情况: 单模块（错误策略简化）
- [ ] 验证: DDL 无 FK 声明；T8/T9 存在；错误策略产物声明存在

### U10. 修改 L3 技能 `ae:l3-module-verify`（FK→引用一致性 + 审查）

- [ ] 目标: DDL 验证改为逻辑引用一致性验证，增加审查
- [ ] 覆盖需求: R7, R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-l3-module-verify/SKILL.md`
- [ ] 依赖: U9
- [ ] 文件:
  - `src/assets/skills/ae-l3-module-verify/SKILL.md`（修改）
  - `src/assets/skills/ae-l3-module-verify/references/l3-spec.md`（修改）
- [ ] 方法:
  - T2 DDL 验证: "验证外键约束：尝试插入违反引用完整性的数据" → "验证逻辑引用一致性：检查引用字段值在目标实体中是否存在（应用层校验）"
  - ddl-verify.log: `[FK-CONSTRAINT]` → `[REF-CONSISTENCY]`
  - 新增 T5: 产物审查
  - 新增 L3-K7: 产物审查通过
  - 上游依赖更新
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景: 正常路径
- [ ] 验证: 无 FK-CONSTRAINT 字样

### U11. 修改 V1 技能 `ae:v1-e2e-verify`（上游引用更新 + 审查）

- [ ] 目标: 上游引用更新，增加审查
- [ ] 覆盖需求: R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-v1-e2e-verify/SKILL.md`
- [ ] 依赖: U10
- [ ] 文件:
  - `src/assets/skills/ae-v1-e2e-verify/SKILL.md`（修改）
  - `src/assets/skills/ae-v1-e2e-verify/references/v1-spec.md`（修改）
- [ ] 方法:
  - 上游依赖更新
  - 上游引用: "g2/data-model/" → "g4/data-model/"
  - 新增 T7: 产物审查
  - 新增 V1-K8: 产物审查通过
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景: 正常路径
- [ ] 验证: 上游引用正确

### U12. 修改 V2 技能 `ae:v2-completeness`（矩阵增加 G2/G3 列 + 实体比对改为 G4 + 审查）

- [ ] 目标: 完整性矩阵增加 G2 场景覆盖列和 G3 架构/安全列，实体比对改为 G4
- [ ] 覆盖需求: R8
- [ ] 唯一产出物: 修改后的 `src/assets/skills/ae-v2-completeness/SKILL.md`
- [ ] 依赖: U11
- [ ] 文件:
  - `src/assets/skills/ae-v2-completeness/SKILL.md`（修改）
  - `src/assets/skills/ae-v2-completeness/references/v2-spec.md`（修改）
- [ ] 方法:
  - 完整性矩阵: `G1→G2→A1→L2→V1` → `G1→G2(场景)→G3(架构安全)→G4(约束)→A1→L2→V1`
  - 矩阵列: 增加 G2 场景覆盖列、G3 架构安全列
  - T3 未覆盖实体: g2 vs L2 → **g4 vs L2**
  - T4 未实现契约: 补充检查安全策略是否在 L2 中实现
  - 新增 T6: 产物审查
  - 新增 V2-K8: 产物审查通过
  - 上游引用: "g2/data-model/" → "g4/data-model/"
- [ ] 需遵循的模式: 最小修改
- [ ] 测试场景: 正常路径; 7 列矩阵可解析
- [ ] 验证: 矩阵含 G2/G3 列; 实体比对引用 g4

### U13. 更新项目文档

- [ ] 目标: 同步更新仓库内所有引用旧技能名和旧编号的文档
- [ ] 覆盖需求: R9
- [ ] 唯一产出物: 修改后的文档文件
- [ ] 依赖: U1~U12 全部完成
- [ ] 文件:
  - `docs/ae/skill-architecture.md`（GALV 结构化设计技能表格、流程图、产物路径）
  - `docs/usage-guide.md`（GALV 流程说明、命令速查表、使用建议）
- [ ] 方法:
  - `docs/ae/skill-architecture.md`:
    - GALV 技能表格：新增 G2 行（ae:g2-business-scenarios）、G3 行（ae:g3-architecture），原 G2/G3 行替换为 G4/G5，更新描述和产物路径
    - 流程树：`ae:g2-data-model` → `ae:g4-data-model`，`ae:g3-global-trace` → `ae:g5-global-trace`，插入 G2/G3 节点
    - ASCII 架构图：`g1-invariants → g2-data-model → g3-global-trace` → `g1-invariants → g2-business-scenarios → g3-architecture → g4-data-model → g5-global-trace`
    - GALV 与主流程关系说明：更新描述为"不变量→业务场景→架构→数据模型→契约→模块设计→验证"
  - `docs/usage-guide.md`:
    - GALV 流程说明段落：更新四阶段描述为五阶段（G 阶段扩展为 G1~G5），新增 G2/G3 说明
    - 命令速查表：替换 `/ae-g2-data-model` → `/ae-g4-data-model`、`/ae-g3-global-trace` → `/ae-g5-global-trace`，新增 `/ae-g2-business-scenarios` 和 `/ae-g3-architecture` 行
    - 依赖说明：G1→G2→G3→G4→G5→A1→A2→L1→L2→L3→V1→V2
    - 使用建议表：更新 GALV 入口说明
- [ ] 需遵循的模式: 保持现有文档结构和风格，仅替换引用和补充新增内容
- [ ] 测试场景: 文档内无旧技能名残留
- [ ] 验证: 全文搜索 `ae:g2-data-model`、`ae:g3-global-trace`、`/ae-g2-data-model`、`/ae-g3-global-trace` 为零

### U14. 更新 `ae-asset-schema.ts` 常量

- [ ] 目标: 技能名常量重编号
- [ ] 覆盖需求: R9
- [ ] 唯一产出物: 修改后的 `src/schemas/ae-asset-schema.ts`
- [ ] 依赖: U4+U5（常量变更的直接来源）
- [ ] 文件:
  - `src/schemas/ae-asset-schema.ts`（修改）
- [ ] 方法:
  - SKILL 常量:
    - `G2_DATA_MODEL: 'ae:g2-data-model'` → 删除
    - `G3_GLOBAL_TRACE: 'ae:g3-global-trace'` → 删除
    - 新增 `G2_BUSINESS_SCENARIOS: 'ae:g2-business-scenarios'`
    - 新增 `G3_ARCHITECTURE: 'ae:g3-architecture'`
    - 新增 `G4_DATA_MODEL: 'ae:g4-data-model'`
    - 新增 `G5_GLOBAL_TRACE: 'ae:g5-global-trace'`
  - PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS: 同步更新对应条目
  - COMMAND 常量: 由 SKILL_COMMANDS 自动派生，无需手动修改
- [ ] 需遵循的模式: 现有常量定义模式
- [ ] 测试场景: `npm run typecheck` 通过
- [ ] 验证: `npm run typecheck`

### U15. 更新 catalog 和模型路由

- [ ] 目标: 技能 catalog 注册和命令模型路由同步更新
- [ ] 覆盖需求: R9
- [ ] 唯一产出物: 修改后的 catalog 和路由文件
- [ ] 依赖: U14
- [ ] 文件:
  - `src/services/ae-catalog.ts`（如涉及技能列表硬编码）
  - `src/services/asset-model-routing-catalog.ts`（命令模型路由）
- [ ] 方法:
  - 搜索所有引用旧技能名的位置并替换
  - COMMAND_SCENARIOS 中新增 G2/G3/G4/G5 的模型场景配置
  - G2 业务场景: standard 场景
  - G3 架构与安全: deep 场景
  - G4 数据模型: deep 场景
  - G5 全局推演: deep 场景
- [ ] 需遵循的模式: 现有 catalog/路由模式
- [ ] 测试场景: `npm run typecheck` 通过
- [ ] 验证: `npm run typecheck`

### U16. 全量验证

- [ ] 目标: 确保所有修改编译通过、测试通过
- [ ] 覆盖需求: 全部
- [ ] 唯一产出物: 验证结果
- [ ] 依赖: U15
- [ ] 文件: 无新增
- [ ] 方法:
  - `npm run typecheck`
  - `npm run build`
  - `npm run test`
  - 全文搜索旧技能名残留（`ae:g2-data-model`、`ae:g3-global-trace`、`g2/data-model`、`g3/global-trace`、`FOREIGN KEY`、`FK-CONSTRAINT`、`foreign_key`）
- [ ] 验证: typecheck + build + test 全部通过；旧名残留为零

## 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| G3 架构与安全合为一个技能，内容可能超 500 行 | 产物需拆分为 architecture.md + security.md | 设计时已拆分为两个产物文件，每个 ≤500 行 |
| NFR 在需求文档中未明确声明 | G1 nfr.md 为空 | 标注"需求文档未声明 NFR"，由 G3 架构设计阶段基于 G2 场景推断补全 |
| 外部系统集成设计复杂度不一 | A1 external-integrations.md 可能过大 | 按外部系统拆分文件，每个 ≤500 行 |
| 全局错误策略在多模块并行设计时难以保持一致 | L2 各模块错误码可能冲突 | 第一个执行 L2 的模块定义全局错误码前缀规则，后续模块引用；L3 验证一致性 |
| 旧技能名在非技能文件中残留 | 运行时引用失败 | U15 全文搜索验证 |

## 一致性检查
- implementationUnitsCount: 16
- tracedRequirementsCount: 9
- decisionsCount: 6
- risksCount: 5
