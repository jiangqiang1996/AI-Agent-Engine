---
name: ae:graph-build
description: 构建或增量维护项目文件关系图谱，写入当前工作区 docs/ae/graphs/graph.json
argument-hint: "[target:<PATH>] [mode:auto|full|incremental] [depth:shallow] [exclude:<PATH>...]"
---

# Skill: ae:graph-build

构建当前工作区的文件关系图谱，用于后续依赖查询、影响范围分析和项目健康检查。

## 使用场景

- 接手项目时需要建立文件依赖图谱。
- 重构前需要维护最新关系数据。
- Git diff 后希望只增量更新变更文件关系。

## 执行流程

- 调用 `ae-graph-build` 工具，传入 `target`、`mode` 和 `depth` 参数。
- `target` 支持绝对路径和相对路径；省略时按当前会话启动路径解析。
- `mode` 可为 `auto`、`full` 或 `incremental`；非 Git 项目会降级为全量构建。
- `depth` 首版仅支持 `shallow`，只做浅层正则解析，不执行 AST 深层解析。
- 工具会读取可选图谱排除配置，并可叠加 `exclude` 参数后将图谱写入当前工作区的 `docs/ae/graphs/graph.json`、manifest、索引与分片目录。

## 输出要求

- 返回构建模式、模式原因、scope、version、文件数、关系数、warning、排除规则、图谱文件路径、分片摘要和耗时。
- Git diff 无变更时返回当前 active summary，而不是只返回空更新提示。
- 若目标路径越界、配置解析失败或图谱文件写入失败，返回中文可恢复提示。

## 安全边界

- 不解析当前工作区外的路径。
- 默认排除 `.git`、`.env*`、凭证类文件和图谱产物目录；发现常见构建产物目录时，可在获得工具确认后保存排除规则。
- 自动写入排除规则前必须通过工具确认机制获得许可。
- `depth=shallow` 只做低成本浅层解析，不执行 AST 深层解析、语义生成或外部 LLM 摘要。

## 完成标准

- `docs/ae/graphs/graph.json` 存在并包含 active version、manifest、索引和分片。
- 后续可使用 `ae:graph-query` 查询图谱。
