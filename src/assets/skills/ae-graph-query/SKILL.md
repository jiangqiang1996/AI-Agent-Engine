---
name: ae:graph-query
description: 查询项目文件关系图谱中的依赖、影响范围、核心模块和健康状态
argument-hint: "[mode] [file=<PATH>] [target=<PATH>] [directory=<PATH>]"
---

# Skill: ae:graph-query

查询由 `ae:graph-build` 构建的文件关系图谱，作为项目理解、影响范围分析、审查、设计、调试和重构任务的默认第一步定位入口。

## 使用场景

- 查看单个文件依赖了哪些文件，以及被哪些文件依赖。
- 修改文件前评估影响范围。
- 检测循环依赖、孤立文件、核心模块和关系统计。
- 查找两个文件之间的最短依赖路径。
- 开始阅读陌生项目、模块或目录前，先获取候选文件和关系分布。
- 代码审查、设计拆解、调试定位和重构设计前，先用图谱收窄真实文件阅读范围。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `mode` | 是 | 查询模式：`deps` / `impact` / `health` / `filter` / `path` / `core` / `stats` / `pattern` |
| `file` | 否 | 目标文件路径，`deps`/`impact`/`path` 模式使用 |
| `target` | 否 | 目标文件路径，`path` 模式使用 |
| `directory` | 否 | 目录路径筛选 |
| `scope` | 否 | 图谱范围，需与构建 target 对应 |
| `relation_type` | 否 | 关系类型筛选 |
| `file_type` | 否 | 文件类型筛选 |
| `pattern_type` | 否 | `pattern` 模式：`cycle` / `long` / `all` |
| `limit` | 否 | 结果数量上限，默认 50 |
| `top` | 否 | Top N，`core` 模式使用，默认 10 |
| `exclude` | 否 | 查询时额外排除的路径集合 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | deps / impact / health / filter / path / core / stats / pattern | mode |
   | cycle / long / all | pattern_type |
   | 现有文件路径 | file |

   ❌ 否定示例：`查看 impact 范围` 中的 impact 不推断为 mode（因语义为查看，不是指定查询模式）

3. 顺序兜底：值特征有交集时，按 `mode → pattern_type → file → target → directory` 顺序匹配

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `mode=deps file=./src/index.ts`），不依赖值特征推断。

## 执行流程

- 调用 `ae-graph-query` 工具并指定 `mode`。
- 不确定从哪里开始时，先用 `stats` 或 `core` 了解整体结构，再用 `filter` 收窄目录、文件类型或关系类型。
- `deps` 和 `impact` 需要 `file`。
- `path` 需要 `file` 和 `target`。
- `filter` 可使用 `relation_type`、`file_type` 或 `directory`。
- `pattern` 可使用 `pattern_type=cycle|long|all`。
- `scope`、`file`、`target`、`directory` 支持绝对路径与相对路径；未显式指定时按当前会话启动路径解析。
- 可选 `exclude` 用于在查询侧进一步过滤结果，不会修改图谱产物。
- 小范围查询会优先使用 manifest、scope summary 和 source/target 等索引；必要时才读取相关分片。
- 修改代码前优先查询目标文件的 `deps` 和 `impact`；涉及架构、重构或风险评估时补充 `core`、`pattern` 或 `path`。
- 查询结果过宽或被截断时，不要直接改用全局搜索；应先收窄 `scope`、`directory`、`file_type`、`relation_type` 或 `limit` 后再次查询。

## 输出要求

- 返回 JSON 结构化结果，包含查询模式、scope、图谱版本、分片摘要、`queryCost`、`truncation` 和查询结果。
- 必须读取并保留 `freshness`：只有 `freshness.status=fresh` 时，空结果、无影响或无依赖结论才可作为图谱证据；`maybe_stale`、`stale`、`updating` 或诊断状态只能作为定位线索。
- 图谱损坏、scope 不匹配、manifest/chunk/index 缺失时返回 `status=diagnostic`、问题位置、可用 scope 和 `recoverBy`，不得把空结果解释为无依赖。
- 图谱文件不存在时提示先运行 `ae:graph-build`。
- 参数缺失或路径越界时返回中文可恢复提示。
- 向用户总结时说明结论来自图谱快照，并标注后续已读取源码或已运行验证的部分。

## 安全边界

- 只读取当前工作区 `ae/graphs/graph.json` 的 active version、manifest、索引和必要分片。
- 所有路径参数必须位于当前工作区内。
- 不构建或修改图谱数据。
- 图谱结果是结构快照，不能替代读取真实源码、Git diff、测试、类型检查、构建或安全审查。
- `freshness.status` 不是 `fresh` 时，不得用图谱空结果声明无影响、无依赖、完整覆盖或无需修改；必须先刷新图谱，或用真实文件、源码搜索、Git 状态和验证命令补证。
- 图谱空结果、过期结果或范围外结果不能证明文件不存在、无引用或无风险；必须用文件系统、源码搜索或验证命令复核关键结论。

## 完成标准

- 能输出对应查询模式的稳定结果。
- 查询不读取构建中的半成品版本。
- 大结果受服务端上限控制，输出中说明返回数量、截断状态和后续收窄查询方向。
