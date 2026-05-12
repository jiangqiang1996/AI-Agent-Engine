---
name: ae:graph-query
description: 查询项目文件关系图谱中的依赖、影响范围、核心模块和健康状态
argument-hint: "[mode:deps|impact|health|filter|path|core|stats|pattern] [file:<PATH>] [target:<PATH>]"
---

# Skill: ae:graph-query

查询由 `ae:graph-build` 构建的文件关系图谱，辅助项目理解、影响范围分析和重构决策。

## 使用场景

- 查看单个文件依赖了哪些文件，以及被哪些文件依赖。
- 修改文件前评估影响范围。
- 检测循环依赖、孤立文件、核心模块和关系统计。
- 查找两个文件之间的最短依赖路径。

## 执行流程

- 调用 `ae-graph-query` 工具并指定 `mode`。
- `deps` 和 `impact` 需要 `file`。
- `path` 需要 `file` 和 `target`。
- `filter` 可使用 `relation_type`、`file_type` 或 `directory`。
- `pattern` 可使用 `pattern_type=cycle|long|all`。
- `scope`、`file`、`target`、`directory` 支持绝对路径与相对路径；未显式指定时按当前会话启动路径解析。
- 可选 `exclude` 用于在查询侧进一步过滤结果，不会修改图谱产物。
- 小范围查询会优先使用 manifest、scope summary 和 source/target 等索引；必要时才读取相关分片。

## 输出要求

- 返回 JSON 结构化结果，包含查询模式、scope、图谱版本、分片摘要、`queryCost`、`truncation` 和查询结果。
- 图谱损坏、scope 不匹配、manifest/chunk/index 缺失时返回 `status=diagnostic`、问题位置、可用 scope 和 `recoverBy`，不得把空结果解释为无依赖。
- 图谱文件不存在时提示先运行 `ae:graph-build`。
- 参数缺失或路径越界时返回中文可恢复提示。

## 安全边界

- 只读取当前工作区 `docs/ae/graphs/graph.json` 的 active version、manifest、索引和必要分片。
- 所有路径参数必须位于当前工作区内。
- 不构建或修改图谱数据。
- 图谱结果是结构快照，不能替代读取真实源码、Git diff、测试、类型检查、构建或安全审查。

## 完成标准

- 能输出对应查询模式的稳定结果。
- 查询不读取构建中的半成品版本。
- 大结果受服务端上限控制，输出中说明返回数量、截断状态和后续收窄查询方向。
