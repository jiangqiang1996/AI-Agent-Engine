# 代码审查输出模板

呈现综合审查发现时使用此**精确格式**。发现按严重程度分组。

**重要：** 使用管道符分隔的 markdown 表格。不要使用 ASCII 制表符。

## 示例

```markdown
## 代码审查结果

**范围：** merge-base -> 工作树（14 个文件，342 行）
**意图：** 添加订单导出端点
**模式：** autofix

**审查者：** correctness, testing, maintainability, security, api-contract
- security -- 新公共端点接受用户输入
- api-contract -- 新路由及响应 schema

### P0 -- 关键

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 1 | `orders_controller.rb:42` | 账户查询缺少归属检查 | security | 0.92 | `gated_auto -> downstream-resolver` |

### P1 -- 高

| # | 文件 | 问题 | 审查者 | 置信度 | 路由 |
|---|------|------|--------|--------|------|
| 2 | `export_service.rb:87` | 全量加载无上限 | performance | 0.85 | `safe_auto -> review-fixer` |

### 已应用修复

- `safe_auto`：添加了分页保护和序列化失败测试

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
- **始终包含 file:line 位置**
- **审查者列**显示标记的人设，多个表示跨审查者共识
- **路由列**格式：`<autofix_class> -> <owner>`
- **结论使用引用块**
- **水平线**（`---`）分隔发现与结论

## 无头模式格式

不使用表格。发现使用 `[severity][autofix_class -> owner] File: <file:line> -- <title>` 格式，带 Why/Evidence 行。按 autofix_class 分组。结论在头部。
