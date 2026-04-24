---
name: ae:task-loop
description: "循环执行任务并自动验证，直到达成目标后退出。支持可插拔执行技能，循环体禁言令确保无人值守。适用于探索性任务：调试、环境搭建、遗留代码修复等。"
argument-hint: "[一句话目标描述]"
---

# 迭代任务循环

目标驱动的迭代执行器。通过 `ae-orchestrator` 工具运行内置的 `ae-task-loop` 工作流，TypeScript 编排器固化完整流程。

**适用场景：** 探索性调试、环境搭建、遗留代码修复

**不适用场景：** 有明确计划 → `ae:work`；需求不明确 → `ae:brainstorm`；代码审查 → `ae:review`

## 输入

<goal> #$ARGUMENTS </goal>

如果 `<goal>` 为空，询问用户："你想完成什么目标？"

## 执行

调用 `ae-orchestrator` 工具：

- **workflow_name**: `ae-task-loop`
- **input**: `{ "goal": "<goal>" }`

工具返回执行结果（完成/瓶颈/上限/不可恢复错误），直接展示给用户。

支持目标前缀技能名（如 `ae:work 修复登录bug`），编排器会自动识别并注入执行技能。

## 退出处理

工具返回的退出原因：

- **done**：所有成功条件满足
- **bottleneck**：连续 3 轮无进展，展示诊断摘要
- **limit**：达到 30 轮上限，展示进度摘要
- **unrecoverable**：不可恢复错误，展示错误详情

若用户希望继续，可再次调用本技能并附加补充说明。
