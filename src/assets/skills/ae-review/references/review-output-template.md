# 审查输出模板

呈现综合审查发现时使用此**精确格式**。发现按严重程度分组，按路由标签分隔。

**重要：** 使用管道符分隔的 markdown 表格。不要使用 ASCII 制表符。

## 示例

```markdown
## 审查结果

**范围：** from:abc123 -> 工作树（14 个文件，342 行）
**意图：** 添加订单导出端点
**模式：** autofix

**审查者：** correctness, testing, maintainability, security, api-contract
- security -- 新公共端点接受用户输入
- api-contract -- 新路由及响应 schema

**路由覆盖：** 源代码(12) 配置(1) 基础设施(1)

### P0 -- 关键

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 1 | `orders_controller.rb:42` | 账户查询缺少归属检查 | security | 0.92 | `gated_auto -> downstream-resolver` |

### P1 -- 高

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 2 | `export_service.rb:87` | 全量加载无上限 | performance | 0.85 | `safe_auto -> review-fixer` |
| 3 | `config/database.yml` | 连接池未配置 | correctness | 0.80 | `safe_auto -> review-fixer` |

### 已应用修复

- `safe_auto`：添加了分页保护和序列化失败测试
- `safe_auto`：配置了连接池上限

### 剩余可操作工作

| # | 文件 | 问题 | 路由 | 下一步 |
|---|------|------|------|--------|
| 1 | `orders_controller.rb:42` | 缺少归属检查 | `gated_auto` | 要求明确批准 |

### 预存问题

| # | 文件 | 问题 | 审查者 |
|---|------|------|--------|
| 1 | `orders_controller.rb:12` | 宽泛的 rescue | correctness |

### 经验与历史方案

- [已知模式] `docs/ae/solutions/export-pagination.md`

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

## 格式规则

- **管道符分隔的 markdown 表格**用于发现
- **按严重度分组**：`### P0 -- 关键` 等
- **始终包含文件位置**（file:line 或 file + section）
- **路由覆盖行**：展示各路由覆盖的文件数
- **审查者列**显示标记的人设，多个表示跨审查者共识
- **路由列**格式：`<autofix_class> -> <owner>`
- **结论使用引用块**
- **水平线**（`---`）分隔发现与结论

## 文档路由展示

文档文件的审查由 ae-document-review 处理。ae-review 将其返回结果合并到统一报告中，文档类发现的展示格式：

```markdown
### 文档审查（由 ae-document-review 处理）

| # | 文件 | 章节 | 问题 | 审查者 | 置信度 | 类型 |
|---|------|------|------|--------|--------|------|
| 1 | `docs/api.md` | 认证流程 | 缺少错误码说明 | coherence-reviewer | 0.88 | omission |
```

**文档发现的 `autofix_class` 使用 ae-document-review 的 auto/present 分类，不转换为 safe_auto/gated_auto。**

## 无头模式格式

不使用表格。发现使用 `[severity][autofix_class -> owner] File: <file:line|section> -- <title>` 格式，带 Why/Evidence 行。按 autofix_class 分组。结论在头部。
