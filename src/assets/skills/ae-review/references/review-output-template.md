# 审查输出模板

呈现综合审查发现时使用此**精确格式**。发现按严重级别分组，按路由标签分隔。

**重要：** 使用管道符分隔的 markdown 表格。不要使用 ASCII 制表符。

## 代码域示例

```markdown
## 审查结果

**域：** code
**范围：** from=abc123 -> 工作树（14 个文件，342 行）
**意图：** 添加订单导出端点
**模式：** autofix

**审查者：** correctness, testing, maintainability, security, api-contract
- security -- 新公共端点接受用户输入
- api-contract -- 新路由及响应 schema

**路由覆盖：** 源代码(12) 配置(1) 基础设施(1)

### P0 -- 关键

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 1 | `orders_controller.rb:42` | 账户查询缺少归属检查 | security | 0.92 | `gated -> downstream-resolver` |

### P1 -- 高

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 2 | `export_service.rb:87` | 全量加载无上限 | performance | 0.85 | `auto -> review-fixer` |
| 3 | `config/database.yml` | 连接池未配置 | correctness | 0.80 | `auto -> review-fixer` |

### 已应用修复

- `auto`：添加了分页保护和序列化失败测试
- `auto`：配置了连接池上限

### 剩余可操作工作

| # | 文件 | 问题 | 路由 | 下一步 |
|---|------|------|------|--------|
| 1 | `orders_controller.rb:42` | 缺少归属检查 | `gated` | 要求明确批准 |

### 预存问题

| # | 文件 | 问题 | 审查者 |
|---|------|------|--------|
| 1 | `orders_controller.rb:12` | 宽泛的 rescue | correctness |

### 经验与历史方案

- [已知模式] `ae/solutions/export-pagination.md`

### 覆盖情况

| 路由 | 文件数 | 审查者 |
|------|--------|--------|
| 源代码 | 12 | correctness, testing, maintainability, security, api-contract |
| 配置 | 1 | correctness, maintainability |
| 基础设施 | 1 | correctness, maintainability, reliability |

- 已抑制：2 个低于 0.60 置信度的发现
- 残余风险：导出端点无速率限制

---

> **结论：** 修复后可用
>
> **理由：** 1 个关键认证绕过必须修复。
>
> **修复顺序：** P0 → P1 → P2
```

## 文档域示例

```markdown
## 审查结果

**域：** document
**文档：** ae/designs/2026-03-15-feat-user-auth/design.md
**类型：** design
**审查者：** coherence, feasibility, security, product-lens
- security -- 设计新增带认证流程的公共 API 端点
- product-lens -- 设计包含跨 3 个优先级层级的 15 个需求

已应用 5 个自动修复。4 个发现待处理（2 个错误，2 个遗漏）。

### 已应用的自动修复

- 将全文术语统一为"pipeline"（coherence）
- 修复交叉引用：第 4 节引用了"第 3.2 节"，实际应为"第 3.1 节"（coherence）

### P0——必须修复

#### 错误

| # | 章节 | 问题 | 审查者 | 置信度 | 类型 |
|---|------|------|--------|--------|------|
| 1 | 需求追踪表 | 目标声明"离线支持"但技术方案假设持续在线 | coherence | 0.92 | error |

### P1——应该修复

#### 遗漏

| # | 章节 | 问题 | 审查者 | 置信度 | 类型 |
|---|------|------|--------|--------|------|
| 2 | 实现单元 3 | 提出自定义认证但未提及现有配置 | feasibility | 0.85 | omission |

### 残余风险

| # | 风险 | 来源 |
|---|------|------|
| 1 | 数据变更的迁移回滚策略未涉及 | feasibility |

### 覆盖范围

| 角色 | 状态 | 发现 | 自动 | 待处理 | 残余 |
|------|------|------|------|--------|------|
| coherence | 已完成 | 4 | 3 | 1 | 0 |
| feasibility | 已完成 | 2 | 1 | 1 | 1 |
```

## 格式规则

### 通用规则

- **管道符分隔的 markdown 表格**用于发现
- **按严重度分组**：`### P0 -- 关键` 等
- **始终包含位置**（代码域：file:line；文档域：章节）
- **审查者列**显示标记的人设，多个表示跨审查者共识
- **路由列**格式：`<autofix_class> -> <owner>`
- **结论使用引用块**
- **水平线**（`---`）分隔发现与结论

### 代码域特有

- **路由覆盖行**：展示各路由覆盖的文件数
- **预存问题**：标记 `pre_existing: true` 的发现单独展示

### 文档域特有

- **摘要行**：始终展示。省略为零的子句
- **P0-P3 章节**：仅包含有发现的章节。在每个严重级别内分为错误和遗漏子标题
- **残余风险**：如无则省略
- **推迟问题**：如无则省略
- **覆盖范围**：始终包含。发现 = 自动 + 待处理

## 无头模式格式

不使用表格。发现使用 `[severity][autofix_class -> owner] File: <file:line|section> -- <title>` 格式，带 Why/Evidence 行。按 autofix_class 分组。结论在头部。
