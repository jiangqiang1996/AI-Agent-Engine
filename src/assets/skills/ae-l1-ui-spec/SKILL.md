---
name: ae:l1-ui-spec
description: 基于上游产物生成结构化界面文档描述，定义视图、布局、数据绑定、交互行为、状态显示与校验规则，并执行可还原性验证。仅当系统有图形界面时执行；纯后端/CLI/嵌入式系统跳过本步。
argument-hint: ""
---

# L1 界面文档描述

## 角色

界面文档工程师，将上游的数据模型、状态机、契约和不变量精确映射为结构化界面描述，使任何人无需追问即可还原出功能等价的界面。

## 适用场景

- 上游产物（G1/G2/G3/G4/G5/A1/A2）已就绪，紧邻前序技能为 A2（关联追踪）
- 系统包含图形界面（Web/App/桌面）
- 需要为前端实现提供无歧义的界面规格

## 不适用场景

- 纯后端服务、命令行工具、嵌入式系统 → 跳过本步，直接进入 L2
- 前序技能产物（G1/G2/G3/G4/G5/A1/A2）未就绪时不得执行本技能

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

本阶段的产物位于根目录下 `l1/` 子目录。

## 产物独占

**独占产物**：只有本技能可以创建或修改（路径相对于产物根目录）：

| 产物 | 说明 |
|------|------|
| `l1/ui-spec/` 或 `l1/ui-spec.md` | 界面规格文档 |
| `l1/verification.html` | 临时还原验证产物，验证完可丢弃 |
| `l1/restore-score.md` | 还原度评分 |

**共享产物**：`galv-manifest.yaml`（首次创建时由当前执行的技能负责，后续技能可读取和追加信息）

**禁止修改**上游技能产物（G1/G2/G3/G4/G5/A1/A2），对上游产物只读。同时禁止修改下游技能产物（L2/L3/V1/V2）。

## 上游依赖（只读）

| 上游 | 产物 | 引用目的 |
|------|------|---------|
| G1 | `g1/invariants/`、`g1/boundary.md`、`g1/ambiguities.md` | 不变量→校验规则，边界→进入条件 |
| G2 | `g2/business-scenarios/`、`g2/field-catalog.md`、`g2/roles.md` | 业务场景→视图和交互驱动，角色→目标用户 |
| G3 | `g3/architecture.md`、`g3/security.md` | 架构约束→技术选型，安全→认证授权 |
| G4 | `g4/data-model/`、`g4/state-machines/`、`g4/ddl-verify.sql` | 数据绑定、状态相关显示 |
| G5 | `g5/data-trace/`、`g5/trace-coverage.md` | 数据流→交互目标 |
| A1 | `a1/contracts/`、`a1/data-flow/`、`a1/shared-state.md` | 跨模块交互→契约引用 |
| A2 | `a2/assoc-trace/`、`a2/assoc-coverage.md` | 关联追踪→联动校验 |

## 执行流程

### 前置检查

1. 确认系统包含图形界面；若为纯后端/CLI/嵌入式，输出跳过说明后结束
2. 读取上游产物，确认 G1/G2/G3/G4/G5/A1/A2 关键文件存在
3. 若上游产物缺失，按回退说明处理，不自行补写

### T1 列出所有视图

遍历 `g2/business-scenarios/` 中的业务场景，列出每个视图并标注：

- 归属模块/端
- 目标用户角色
- 进入条件（引用 g1/boundary.md 或 g4/state-machines/）

写入 `l1/ui-spec/index.md` 的视图总清单。

### T2 定义布局结构

为每个视图定义：

- 区域类型：表单 / 列表 / 详情 / 导航 / 标签页 / 侧边栏
- 位置关系：上下/左右/嵌套
- 区域内容概要

### T3 定义数据绑定

为每个可显示/可编辑元素定义：

- `source`：绑定到 `g4/data-model/` 的实体.字段 或 `a1/contracts/` 的响应字段
- `display`：显示格式
- `editable`：可编辑 / 只读

格式示例：
```yaml
bindings:
  - element: order-amount
    source: g4/data-model/Order.totalAmount
    display: '#,##0.00'
    editable: false
```

### T4 定义交互行为

引用 `g2/business-scenarios/` 中的操作序列定义交互：

- `trigger`：触发条件
- `action`：动作类型（导航/提交/校验/弹窗/刷新）
- `target`：目标视图或外部动作

### T5 定义状态相关显示

引用 `g4/state-machines/` 的状态，定义元素可见性：

```yaml
state-displays:
  - element: approve-btn
    state-ref: g4/state-machines/OrderFlow.pending
    visible: true
    disabled: false
```

### T6 定义校验规则

引用 `g1/invariants/` 的不变量，定义字段级和联动校验。补充引用 `g3/security.md` 认证授权约束：

```yaml
validations:
  - element: email-input
    rule: required
    invariant-ref: g1/invariants/UserContact.emailRequired
  - element: admin-panel
    rule: role-required
    security-ref: g3/security.md#SEC-003
```

### T7 生成还原验证产物

生成 `l1/verification.html`：按 `l1/ui-spec/` 的描述渲染静态界面骨架，标注每个元素的数据来源、交互目标、状态依赖。此为临时产物，验证完成后可丢弃。

### T8 执行可还原性验证

按公式计算还原度：

**R = 0.4S + 0.4F + 0.2B**

| 维度 | 含义 |
|------|------|
| S | 结构还原度：布局/区域/元素是否可无歧义还原 |
| F | 功能还原度：交互/校验/状态显示是否完整可执行 |
| B | 行为边界：前置条件违反、异常场景在还原产物中是否正确处理 |

达标阈值：**R ≥ 0.9**

将评分写入 `l1/restore-score.md`。

### T9 产物审查

对当前阶段全部产物执行自检：

1. 逐条对照验收关卡 L1-K1~L1-K8
2. 确认每个产物文件不超过 500 行
3. 确认所有 Frontmatter 引用可解析到上游产物
4. 不通过项立即修复后重新检查
5. 调用 `ae:review mode=autofix domain=document` 审查 `l1/` 目录

## 产物格式

### 目录结构

视图 ≤ 2 个时使用单文件 `l1/ui-spec.md`；视图 > 2 个时使用目录：

```
l1/ui-spec/
  index.md              ← 视图总清单、导航关系图
  view-{view-id}.md     ← 按视图拆分
```

目录形式时，`index.md` Frontmatter 必须包含 `type: directory_index` 和 `slices` 字段：

```yaml
type: directory_index
slices:
  - file: view-{view-id}.md
    summary: 该视图界面规格
    id_range: [view-001]
```

### 单轨格式

YAML Frontmatter 为唯一真源，正文为人类阐释。

## 单轨格式规则

所有产物文件采用 Markdown + YAML Frontmatter 单轨格式：

- Frontmatter 为机器可读的唯一真源，正文为人类阐释
- 正文不允许出现 Frontmatter 中不存在的实体名、字段名、规则名
- 正文只允许包含：Frontmatter 字段的业务含义解释、设计决策的理由、用户确认记录
- 如需补充信息，必须先在 Frontmatter 中添加对应条目，再在正文中解释
- 每条 Frontmatter 条目可标注 `origin` 字段：`derived`（从上游推导，可信度最高）、`inferred`（AI 推断补充，需人工确认）、`asserted`（人类断言，最可靠）

## 验收关卡

| 编号 | 检查项 | 通过标准 | 失败处理 |
|------|--------|---------|---------|
| L1-K1 | 数据绑定可解析 | `source` 可解析到 `g4/data-model/` 或 `a1/contracts/` | 回退 G4 |
| L1-K2 | 交互目标可解析 | `target` 可解析到已有视图或外部动作 | 回退 A1 或重做 L1 |
| L1-K3 | 状态引用存在 | `g4/state-machines/` 状态在 G4 产物中存在 | 回退 G4 |
| L1-K4 | 不变量有 UI 约束 | `g1/invariants/` 不变量在 UI 层有对应约束 | 仅重做 L1 的 T6 |
| L1-K5 | 还原度达标 | R ≥ 0.9 | 重做薄弱维度对应的任务 |
| L1-K6 | 文件行数合规 | 所有产物文件 ≤ 500 行 | 拆分文件 |
| L1-K7 | 人工审核通过 | 用户确认界面描述无歧义、数据绑定正确、交互定义完整 |
| L1-K8 | 审查通过 | ae:review 审查 l1/ 目录无阻断发现 | 用户明确确认 |

## 回退说明

| 问题 | 回退目标 |
|------|---------|
| 数据绑定错误 | → 回 G4 |
| 交互跨模块未定义契约 | → 回 A1 |
| 纯 UI 描述不清 | → 仅重做 L1 |

## 安全边界

- 禁止修改任何上游或下游技能的产物；对上游产物只读，禁止修改
- 本技能禁止读取或引用执行顺序在本技能之后的任何技能产物（L2/L3/V1/V2），以保证回退时后续产物不可见
- 禁止在缺少上游产物时自行编造数据模型、状态机或契约
- 还原度不达标时不得篡改评分，应重做对应任务
- `l1/verification.html` 为临时产物，不得作为正式交付物
- L1-K7 须由用户确认后方可视为本步骤完成
