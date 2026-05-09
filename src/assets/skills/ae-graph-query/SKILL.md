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

## 输出要求

- 返回 JSON 结构化结果，包含查询模式、图谱版本和查询结果。
- 数据库不存在时提示先运行 `ae:graph-build`。
- 参数缺失或路径越界时返回中文可恢复提示。

## 安全边界

- 只读取当前工作区 `.ae/graph.db` 的 active version。
- 所有路径参数必须位于当前工作区内。
- 不构建或修改图谱数据。

## 完成标准

- 能输出对应查询模式的稳定结果。
- 查询不读取构建中的半成品版本。
