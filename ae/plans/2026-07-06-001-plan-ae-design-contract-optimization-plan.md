---
type: plan
status: drafted
date: 2026-07-06
title: ae-design-contract-optimization
depth: deep
format: human-readable-plan
sharded: false
---

# ae:design 设计契约全面性优化

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标

### 来源
基于 ae:design 技能设计文件全面性头脑风暴讨论结果。讨论覆盖 5 个视角 × 2 轮，产出 6 大共识、5 个碰撞洞见和 6 个盲区。

### 目标
一步到位优化 ae:design 技能的三个资产文件，使设计契约达到真正的"可还原"标准：任意 AI 据此生成一致性产物时，不需要额外发明设计决策。

### 非目标
- 不重构 AE 插件的 TypeScript 运行时代码
- 不新增独立的设计维度文件（不扩维度数量）
- 不改变 design 产物目录结构（`ae/designs/<name>-<date>/`）
- 不改变 ae:design 与 ae:prd / ae:plan / ae:work 的工作流边界

## 范围

### 包含
- 维度内部契约强化：为每个维度定义最小可验证契约元素集（MVCE）
- 跨维度映射模板：新增 4 类强制映射表
- 触发规则优化：从"项目类型"转向"风险维度 + 条件必产出"
- 负向设计空间：每个维度增加"禁止模式/反设计空间"章节
- 实施层硬约束：overview 维度增加配置项、环境变量、依赖版本、目录结构契约
- 衔接机制：设计条目稳定 ID 体系、test-cases 维度覆盖追溯
- 设计子文件模板内容全面优化

### 不包含
- ae:design 技能的 TypeScript 服务代码变更
- ae:plan / ae:work 技能的同步修改（本计划仅优化 ae:design 自身）
- 设计文档载体形态从 Markdown 转向 JSON Schema（保持 Markdown + YAML frontmatter）
- 设计文档的版本演化与增量更新机制（列入待定问题推迟到执行）
- 多 AI 并行实施时的设计文档并发消费协议（列入待定问题推迟到执行）

### 约束
- 所有优化必须向后兼容：现有 design 产物仍可被 ae:plan / ae:work / ae:review 读取
- 不新增独立维度文件，所有新增内容内联到现有维度或作为 overview 的子章节
- 优化后的 design-dimensions.md 总行数预计 > 567 行，需评估是否触发拆分阈值调整
- 必须通过技能内 review 闭环验证

## 需求追溯

| 需求 ID | 需求描述 | 计划响应 |
|---------|----------|----------|
| R1 | 维度内部契约密度不足，需定义 MVCE | U2 |
| R2 | 维度间交叉一致性机制缺失，需跨维度映射模板 | U2 |
| R3 | 触发规则基于"项目类型"有问题，需转向"风险维度" | U1 |
| R4 | 缺失"实施层"硬约束（配置项、环境变量、依赖版本等） | U3 |
| R5 | 缺失"负向设计空间/禁止模式" | U2 |
| R6 | security 等选产出在特定场景应提升为条件必产出 | U1 |
| R7 | 设计→plan→work 衔接断裂，需稳定 ID 体系 | U1, U2 |
| R8 | test-cases 需升级为行为契约规格 + 维度覆盖追溯 | U2 |
| R9 | 设计子文件模板内容需全面优化 | U2, U3 |
| R10 | 一致性校验需扩展覆盖维度间映射 | U1 |

## 高层技术设计

ae:design 技能当前由 3 个资产文件构成：
1. `src/assets/skills/ae-design/SKILL.md` — 技能入口，定义执行流程
2. `src/assets/skills/ae-design/references/design-dimensions.md` — 9 个维度的契约模板
3. `src/assets/skills/ae-design/references/design-output-template.md` — 产物目录结构和 Split Manifest

优化策略：**不扩维度数量，强化维度内部契约密度和维度间一致性机制**。所有新增内容作为现有维度的子章节或 overview 的扩展章节，保持向后兼容。

### 关键决策

- D1. 不新增独立维度文件，所有新增内容内联到现有维度 → 理由：避免维度数量膨胀导致的设计文档碎片化；头脑风暴共识指出"问题不在维度数量，而在维度内部契约密度"
- D2. 跨维度映射表作为 overview 的子章节而非独立维度 → 理由：映射表是维度间关系的显式建模，不是新的设计领域；放在 overview 中可被 Split Manifest 统一管理
- D3. 触发规则从"项目类型"改为"风险维度 + 条件必产出" → 理由：按"纯前端/纯后端"分类是脆弱的，应按"实施风险/变更不可逆程度"触发
- D4. 负向设计空间内联到每个维度而非独立维度 → 理由：每个维度有自己的禁止模式，集中放置会割裂语义
- D5. test-cases 升级为"行为契约规格"但保持文件名不变 → 理由：文件名 `test-cases.md` 已被 ae:plan / ae:work 引用，改名会破坏兼容性
- D6. 稳定 ID 体系使用 `ADR-XXX` 和 `TC-XXX` 前缀，不引入新前缀 → 理由：复用现有 ADR 和 TC 编号体系，最小化变更
- D7. MVCE 清单作为每个维度模板的"契约元素"章节，不替换现有模板结构 → 理由：保持模板结构稳定，MVCE 是对现有内容的契约化约束

## 实现单元

### U1. 优化 SKILL.md — 触发规则、阶段流程、衔接机制
- [ ] 目标: 重构 ae:design 技能入口文件的触发规则、执行流程和一致性校验，使其基于风险维度触发并支持稳定 ID 追溯
- [ ] 覆盖需求: R3, R6, R7, R10
- [ ] 唯一产出物: 优化后的 `src/assets/skills/ae-design/SKILL.md`
- [ ] 依赖: 无
- [ ] 文件:
  - `src/assets/skills/ae-design/SKILL.md`
- [ ] 方法:
  - **触发规则优化（阶段 1）**：将"任务特征 → 必产出/选产出"二分法改为"风险维度 → 条件必产出 + 显式否定"机制
    - 定义"风险维度"清单：不可逆决策（API 签名、数据模型 schema、认证模型）→ 强制必产出对应维度
    - 定义"条件必产出"规则：存在用户数据输入 → security 必产出；涉及生产部署 → observability 必产出；涉及性能敏感逻辑 → non-functional 必产出
    - 定义"显式否定"机制：`security: explicitly-omitted` 表示安全不是本设计关注点，使用最简默认，消除"默认值黑洞"
    - 保留原"任务特征"表作为降级参考，但主触发逻辑改为风险维度
  - **阶段 3 一致性校验扩展**：从 4 条校验扩展到覆盖维度间映射
    - 保留：api↔database、ui-ux↔api、overview 依赖关系完整性、test-cases 覆盖完整性
    - 新增：api 错误码 ↔ ui-ux 交互状态机映射一致性
    - 新增：test-cases 用例 ↔ 维度契约元素覆盖追溯（每个 P0/P1 用例必须追溯到至少一个维度的契约元素）
    - 新增：overview 跨维度映射表 ↔ 实际维度内容一致性
  - **阶段 2 产出顺序优化**：在 overview 之后、其他维度之前，先产出"跨维度映射表"骨架，作为后续维度产出的锚点
  - **衔接机制**：在 overview 模板中要求设计条目使用稳定 ID（ADR-XXX、TC-XXX、EP-XXX 端点编号）
- [ ] 需遵循的模式:
  - 保持 SKILL.md frontmatter 不变（name、description、argument-hint）
  - 保持"一次只问一个问题"交互规则
  - 保持"契约可还原"核心原则
  - 保持阶段 0-5 的整体流程结构
- [ ] 测试场景:
  - 正常路径: 纯前端 UI 任务，触发 overview + ui-ux + test-cases，security 显式否定
  - 边界情况: 全栈任务涉及用户数据输入，security 从选产出提升为条件必产出
  - 错误路径: 用户提供裸描述无时段标注，降级到交互询问风险维度
  - 集成场景: ae:plan 读取优化后的 design.md，能正确识别稳定 ID 和跨维度映射表
- [ ] 验证:
  - `npm run typecheck` 通过
  - `npm run build` 通过（postbuild 会复制 assets 到 dist）
  - 手动检查 `dist/src/assets/skills/ae-design/SKILL.md` 与 src 一致

### U2. 优化 design-dimensions.md — MVCE + 跨维度映射 + 负向设计空间 + test-cases 升级
- [ ] 目标: 为 9 个维度定义最小可验证契约元素集（MVCE），新增跨维度映射模板，为每个维度增加负向设计空间，将 test-cases 升级为行为契约规格
- [ ] 覆盖需求: R1, R2, R5, R7, R8, R9
- [ ] 依赖: U1（触发规则优化后的 SKILL.md 引用 design-dimensions.md 的维度模板）
- [ ] 文件:
  - `src/assets/skills/ae-design/references/design-dimensions.md`
- [ ] 方法:
  - **为每个维度定义 MVCE 清单**：在每个维度模板的"契约内容"之前，新增"契约元素"章节，列出该维度必须输出的最小可验证契约元素
    - overview MVCE: 设计读数（一句话）、范围映射表（prd→维度）、产物清单表、跨维度依赖关系表、ADR 条目、跨维度映射表
    - ui-ux MVCE: 设计读数（含三旋钮）、信息架构（页面树）、页面规格（每页含布局家族+段落顺序+CTA配置+移动端折叠）、组件清单表（含 TypeScript interface 签名）、设计Token（色彩+字号+间距+圆角）、交互状态机表、响应式断点表、无障碍要求、负向设计空间
    - architecture MVCE: 模块边界表、依赖方向声明、分层规则、数据流描述、技术选型理由表、错误传播链、跨层状态同步机制、负向设计空间
    - api MVCE: 端点清单表、每个端点的请求/响应 TypeScript interface（非 JSON 示例）、认证授权模型、错误码枚举表、版本策略、幂等性声明、限流配置、负向设计空间
    - database MVCE: ER 模型、表结构表（字段+类型+约束+索引+描述）、关系与外键表、范式决策、迁移策略、种子数据、敏感字段标注、与 API 字段映射、负向设计空间
    - test-cases MVCE: 覆盖矩阵表（需求×场景×边界）、P0-P3 用例表（每条含 ID+场景+前置+步骤+预期+断言+维度契约追溯）、维度覆盖追溯表（用例→维度契约元素）、验收映射表、测试数据策略
    - security MVCE: 威胁模型表（STRIDE）、信任边界、认证授权流程、数据分级表、密钥管理、输入验证策略、审计日志要求、负向设计空间
    - observability MVCE: 日志规范（结构+级别+必需字段）、指标体系表、链路追踪、告警规则表、健康检查、SLO/SLI 表、负向设计空间
    - non-functional MVCE: 性能目标表（含量化指标+校验方式）、并发模型与锁策略、事务边界、缓存策略表、容量规划、负向设计空间
  - **新增跨维度映射模板**：在维度模板之后新增"跨维度映射"章节，定义 4 类强制映射表
    - `api-field-to-database-column-mapping`：API 请求/响应字段 ↔ 数据库表字段映射表（字段名、类型、可选性、转换规则）
    - `api-error-to-ui-state-mapping`：API 错误码 ↔ UI 交互状态机映射表（错误码→UI 状态→用户提示→恢复操作）
    - `test-case-to-contract-coverage`：测试用例 ↔ 维度契约元素覆盖追溯表（用例 ID→维度→契约元素 ID→断言要点）
    - `ui-component-to-api-endpoint-mapping`：UI 组件 ↔ API 端点映射表（组件名→调用的端点→所需字段→加载状态→错误处理）
  - **每个维度增加"负向设计空间"章节**：在现有维度模板末尾新增
    - 格式：`### 负向设计空间` + 禁止使用的库/模式/方案列表 + 理由
    - 示例（ui-ux）：禁止 Inter 字体、禁止 AI 紫色渐变、禁止 3 列等宽功能卡片、禁止 div 假截图
    - 示例（architecture）：禁止循环依赖、禁止跨层直接调用（Controller→Repository）、禁止未捕获异常传播
    - 示例（api）：禁止 RESTful 反模式（GET 修改数据）、禁止未版本化端点、禁止未限流公开端点
  - **test-cases 升级为行为契约规格**：
    - 覆盖矩阵增加"维度契约元素"列，每个用例必须追溯到至少一个维度的契约元素
    - P0/P1 用例表增加"维度契约追溯"列（格式：`api:EP-001, database:T-users, ui-ux:ST-form-submit`）
    - 新增"行为契约规格"章节，定义每个用例的输入→状态转换→断言→边界条件的精确规格
    - 保留现有"验收映射"章节，但增加"维度覆盖追溯"子章节
  - **ui-ux 组件清单强化**：组件 Props 契约从描述性文字升级为 TypeScript interface 签名
    - 示例：`Button: { variant: 'primary'|'secondary'; size: 'sm'|'md'|'lg'; onClick: () => void; loading?: boolean }`
  - **api 请求/响应 Schema 强化**：从 JSON 示例升级为 TypeScript interface + JSON Schema 双轨
    - 每个端点提供 TypeScript interface（供前端 AI 使用）和 JSON Schema（供后端 AI 校验）
  - **architecture 增加错误传播链和跨层状态同步**：
    - 错误传播链：定义错误从产生层到用户可见层的传播路径和转换规则
    - 跨层状态同步：定义多层级状态（如前端 state + 后端 session + 数据库）的同步机制
- [ ] 需遵循的模式:
  - 保持每个维度的 frontmatter 结构不变
  - 保持"触发条件""产出文件""可还原性目标"三行头部
  - MVCE 清单作为"契约内容"之前的独立章节，不替换现有模板
  - 跨维度映射作为维度模板之后的独立章节
  - 负向设计空间作为每个维度模板末尾的子章节
- [ ] 测试场景:
  - 正常路径: 按 MVCE 清单逐项检查每个维度模板，所有元素均可被 AI 识别为必填
  - 边界情况: 跨维度映射表在 split 状态下能被 ae:review 正确读取
  - 错误路径: 某维度缺失 MVCE 中的元素时，ae:review 的 auto 修复能识别并补充
  - 集成场景: ae:work 读取优化后的 test-cases.md，能根据维度契约追溯定位到对应维度的契约元素
- [ ] 验证:
  - `npm run typecheck` 通过
  - `npm run build` 通过
  - 手动检查 `dist/src/assets/skills/ae-design/references/design-dimensions.md` 行数和结构
  - 检查优化后的 design-dimensions.md 是否触发 SKILL.md 中 1500 行拆分阈值的调整需求

### U3. 优化 design-output-template.md — 产物结构 + 实施约束模板
- [ ] 目标: 优化产物目录结构模板，新增实施层硬约束模板（配置项、环境变量、依赖版本、目录结构），调整拆分阈值
- [ ] 覆盖需求: R4, R9
- [ ] 依赖: U2（design-dimensions.md 优化后的维度内容行数变化影响拆分阈值评估）
- [ ] 文件:
  - `src/assets/skills/ae-design/references/design-output-template.md`
- [ ] 方法:
  - **overview 元文件模板增加"实施约束"章节**：在"设计总览"章节之后、"架构设计"之前新增
    - 章节名：`## 实施约束`
    - 子章节：
      - `### 环境变量清单`（变量名、类型、默认值、是否必需、描述）
      - `### 依赖版本矩阵`（依赖名、版本范围、用途、是否生产依赖）
      - `### 配置项清单`（配置键、配置路径、默认值、环境覆盖、描述）
      - `### 目录结构约定`（关键目录和文件的仓库相对路径、用途说明）
      - `### 构建与运行命令`（构建命令、开发命令、测试命令、lint 命令）
    - 该章节始终内联在 design.md 中，不拆分为子文件（因为影响多维度一致性）
  - **overview 元文件模板增加"跨维度映射表"章节**：在"实施约束"章节之后新增
    - 章节名：`## 跨维度映射表`
    - 引用 design-dimensions.md 中定义的 4 类映射模板
    - 该章节始终内联在 design.md 中（作为维度间一致性的单一真源锚点）
  - **拆分阈值调整**：
    - 当前阈值：1500 行触发拆分
    - 优化后：评估新增"实施约束"和"跨维度映射表"后的 design.md 基础行数增长
    - 若基础行数增长超过 200 行，将阈值从 1500 调整为 1800
    - 在模板中明确记录阈值调整理由
  - **Unified 状态模板更新**：在现有 unified 模板的章节顺序中插入"实施约束"和"跨维度映射表"
    - 新顺序：Split Manifest → 设计总览 → 实施约束 → 跨维度映射表 → 架构设计 → 接口设计 → 数据库设计 → UI/UX 设计 → 测试用例设计 → 安全设计 → 可观测性设计 → 非功能设计
  - **Split 状态模板更新**：在 split 模板的 inline_sections 中增加 `implementation_constraints` 和 `cross_dimension_mapping`
    - 这两个章节始终内联，不参与拆分
  - **子文件 frontmatter 规范强化**：增加 `contract_elements` 字段记录该子文件的 MVCE 清单
    - 示例：`contract_elements: [endpoint_list, request_response_schema, auth_model, error_codes, idempotency, rate_limiting, negative_space]`
    - 供 ae:review 的 auto 修复快速识别该子文件应有的契约元素
  - **跨维度一致性校验扩展**：在"跨维度一致性校验"章节增加新校验项
    - 新增：跨维度映射表完整性（4 类映射表必须存在且非空）
    - 新增：实施约束与 architecture 一致性（目录结构约定与模块边界表对齐）
    - 新增：实施约束与 api 一致性（环境变量清单与认证授权流程对齐）
- [ ] 需遵循的模式:
  - 保持产物目录结构不变（`ae/designs/<name>-<date>/`）
  - 保持子文件命名规则不变（`<维度名>.md`）
  - 保持 Split Manifest 格式不变（status/total_lines/inline_sections/split_files）
  - 新增章节作为现有模板的扩展，不替换现有结构
- [ ] 测试场景:
  - 正常路径: unified 状态的 design.md 包含"实施约束"和"跨维度映射表"章节
  - 边界情况: split 状态下，"实施约束"和"跨维度映射表"始终内联不拆分
  - 错误路径: 子文件 frontmatter 缺少 `contract_elements` 字段时，ae:review 能识别为契约不全
  - 集成场景: ae:plan 读取优化后的 design.md，能从"实施约束"章节获取环境变量和依赖版本
- [ ] 验证:
  - `npm run typecheck` 通过
  - `npm run build` 通过
  - 手动检查 unified 和 split 两种模板的章节顺序一致性
  - 确认新增章节在拆分时始终内联

## 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|----------|
| design-dimensions.md 优化后行数大幅增长（预计 567→900+） | 可能导致 design.md 更容易触发拆分阈值 | U3 中同步调整拆分阈值从 1500 到 1800 |
| MVCE 清单过于严格导致简单任务产出过重 | 简单任务的 design 文档变得冗长 | 在 SKILL.md 的"合理调整产物规模"原则中增加 MVCE 降级规则：轻量级任务可省略可选 MVCE 元素 |
| 跨维度映射表在维度未产出时无法填写 | 映射表引用的维度不存在导致空表 | 在映射模板中增加"维度未产出时标注 N/A 并说明理由"的降级规则 |
| 负向设计空间可能过于主观或与项目现有约定冲突 | AI 产出的禁止模式可能不适用于所有项目 | 在模板中注明"负向设计空间基于项目约定，无约定时使用 AI Tell 黑名单作为默认" |
| 子文件 frontmatter 新增 contract_elements 字段破坏旧产物兼容 | 旧 design 产物无此字段 | 在模板中标注该字段为可选，ae:review 遇到缺失时降级为手动检查 |

## 待定问题

### 推迟到执行
- Q1. 设计文档的版本演化与增量更新机制（边实施边发现设计问题时的热更新协定）— 推迟到下一轮优化
- Q2. 多 AI 并行实施时的设计文档并发消费协议 — 推迟到下一轮优化
- Q3. 设计文档本身的可测试性量化指标 — 推迟到下一轮优化
- Q4. 增量设计场景的表达能力（在已有代码库上新增功能时的"增量变更"标注）— 推迟到下一轮优化
- Q5. 不同技术栈下的维度适配（移动端、嵌入式、数据科学等）— 推迟到下一轮优化

## 一致性检查
- implementationUnitsCount: 3
- tracedRequirementsCount: 10
- decisionsCount: 7
- risksCount: 5
