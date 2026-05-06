# 阶段 5-7：综合、展示和审查后

## 阶段 5：合并发现结果

### 5.1 校验

根据 findings schema 检查每个代理返回的 JSON。丢弃缺少必填字段的发现。记录格式不正确的代理。

### 5.2 置信度门控

- 代码域：抑制低于 0.60 的发现（P0 在 0.50+ 保留）
- 文档域：抑制低于 0.50 的发现（P0 在 0.50+ 保留）

将低于阈值的文档域发现存储为残余风险。

### 5.3 去重

使用 `normalize(file) + normalize(location.type) + normalize(line|section) + normalize(title)` 生成指纹。

- 代码域 location.type 为 `line`，使用 `line` 字段
- 文档域 location.type 为 `section`，使用 `section` 字段

当指纹跨角色匹配时：
- 如果发现建议**相反的操作**，不合并——保留两者
- 否则合并：保留最高严重级别和置信度，合并证据，记录所有同意的审查者
- 归属于置信度最高的角色，减少其他角色的计数

### 5.4 共识提升

2+ 审查者标记同一问题时提高置信度 0.10。代码域和文档域均适用。

### 5.5 残余风险提升

仅文档域执行。代码域跳过此步骤（passthrough）。

- **跨角色佐证**：角色 A 的残余风险与角色 B 的发现重叠 → P2 提升
- **具体阻塞风险**：会阻塞实现的风险 → P2 提升

### 5.6 解决分歧

创建**组合发现**，呈现双方观点。

- 代码域：保留最保守的路由
- 文档域：设置 `autofix_class: gated`、`finding_type: error`

### 5.7 autofix 提升

仅文档域执行。代码域跳过此步骤（passthrough）。

当三个条件全部满足时将 `present`（映射后为 `gated`）提升为 `auto`：
1. 引用了具体的现有代码库模式
2. 包含遵循该模式的 `suggested_fix`
3. 不存在真正的权衡

### 5.8 路由划分

**代码域：**

| 队列 | 包含 | 动作 |
|------|------|------|
| 修复队列 | `auto` | 自动应用 |
| 待批队列 | `gated` | 需批准 |
| 设计队列 | `manual` | 需设计决策 |
| 只读队列 | `advisory` | 仅展示 |

**文档域：**

| 队列 | 包含 | 动作 |
|------|------|------|
| 修复队列 | `auto` | 自动应用 |
| 待判断队列 | `gated` | 需用户判断 |
| 只读队列 | `manual`、`advisory` | 仅展示 |

**降级标记：** 将缺少 `suggested_fix` 的 `auto` 发现降级为 `gated`，标记 `auto-downgraded-to-gated` 并统计数量。

### 5.9 排序

- 代码域：严重级别 → 置信度 → 文件路径 → 行号
- 文档域：严重级别 → 置信度 → 文件路径 → 章节顺序

## 阶段 6：合成并展示

使用审查输出模板（`references/review-output-template.md`）展示发现。

### 模式驱动的展示

- **交互模式** — 代码域：自动应用 `auto`，策略问题询问用户；文档域：自动应用 `auto`，展示 `gated`/`manual`/`advisory` 供用户判断
- **自动修复模式** — 仅应用 `auto`，保留其余
- **只读模式** — 不构建修复队列，仅展示
- **无头模式** — 单轮 `auto`，结构化文本输出

### 受保护产物

丢弃任何建议删除以下目录中文件的发现：
- `docs/ae/brainstorms/`
- `docs/ae/plans/`
- `docs/ae/solutions/`
- `.opencode/`

## 阶段 7：审查后

### 步骤 1：应用修复

使用一个修复器和 `max_rounds: 2` 应用修复队列中的所有 `auto` 发现。

### 步骤 2：写入运行产物

写入 `docs/ae/reviews/<run-id>/`，包含 `metadata.json`。代码域 `metadata.json` 必须包含 `generatedBy: "ae:review"`、`reviewRunIdOrMessageRef`、`worktree`、`branch`、`head`、`statusSummary`、`reviewStatus`、`reviewOutputHash`，供 `ae-gate` 的 `review_evidence.type=report_path` 校验。`reviewRunIdOrMessageRef` 必须绑定当前会话中实际执行审查的结构化来源引用：`ae:review` 工具/技能运行记录的 `id`，或审查子代理 `task` 工具记录的 `id` / `task_id`；`reviewOutputHash` 必须是该来源工具输出文本的 SHA-256，且来源输出本身必须包含可解析的通过/失败状态，不能只在 metadata 中声明结论。不得使用手写文本、任意工具输出或与本次审查无关的标识。

### 步骤 3：最终下一步（仅交互模式）

**代码域：**
- PR 模式：继续 / 退出
- 分支模式：继续 / 退出
- 默认分支：继续 / 退出

**文档域：** 提供两个选项：
1. **再次优化** — 处理发现后重新审查
2. **审查完成** — 进入下一步

经过 2 次优化迭代后，建议完成。

### 步骤 4：更新状态文件

更新 `.opencode/review-state.json`（写入当前 worktree 身份、branch、HEAD、工作区状态摘要和审查时间）。仅代码域执行。后续读取时必须校验这些字段，缺失或不匹配时保守视为未审查。

## 质量门

1. 每个发现都是可操作的
2. 没有因未仔细阅读代码/内容导致的误报
3. 严重级别校准正确
4. 位置信息准确（代码域：行号；文档域：章节）
5. 受保护产物得到尊重
6. 发现不重复 linter 输出

## 禁止事项

- 不要重写整个文件/文档来修复一个小问题
- 不要添加用户未讨论过的新功能/新章节
- 不要创建单独的审查文件或添加元数据章节到源文件
