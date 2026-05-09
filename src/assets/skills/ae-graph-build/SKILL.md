---
name: ae:graph-build
description: 构建或增量维护项目文件关系图谱，写入当前工作区 .ae/graph.db
argument-hint: "[target:<PATH>] [mode:auto|full|incremental] [depth:shallow]"
---

# Skill: ae:graph-build

构建当前工作区的文件关系图谱，用于后续依赖查询、影响范围分析和项目健康检查。

## 使用场景

- 接手项目时需要建立文件依赖图谱。
- 重构前需要维护最新关系数据。
- Git diff 后希望只增量更新变更文件关系。

## 执行流程

- 调用 `ae-graph-build` 工具，传入 `target`、`mode` 和 `depth` 参数。
- `target` 必须位于当前工作区内；省略时使用当前工作区。
- `mode` 可为 `auto`、`full` 或 `incremental`；非 Git 项目会降级为全量构建。
- `depth` 首版仅支持 `shallow`，只做浅层正则解析，不执行 AST 深层解析。
- 工具会读取 `.opencode/ae.jsonc` 的 `graph.exclude` 配置，并将图谱写入 `.ae/graph.db`。

## 输出要求

- 返回构建模式、文件数、关系数、warning、数据库路径和耗时。
- 若目标路径越界、配置解析失败或数据库写入失败，返回中文可恢复提示。

## 安全边界

- 不解析当前工作区外的路径。
- 默认排除 `.git`、`.env*`、凭证和常见构建产物目录。
- 自动写入排除规则前必须通过工具确认机制获得许可。

## 完成标准

- `.ae/graph.db` 存在并包含 active version。
- 后续可使用 `ae:graph-query` 查询图谱。
