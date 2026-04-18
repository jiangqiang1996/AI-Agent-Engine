---
name: ae:work
description: 按 living plan 执行工作，默认采用 subagent-first 策略，并在完成后进入代码审查
argument-hint: "[plan 路径|工作描述]"
---

# AE Work

目标：
- 读取 living plan
- 将实现单元拆成尽可能小的任务
- 优先委派给子代理执行，存在依赖时串行，无依赖时并行
- 在实现完成后转入 `ae:review`

执行原则：
- 主编排器负责拆分、派发、汇总、验证
- 代码改动尽量由叶子子代理完成
- 严格遵守 plan 中的 Scope Boundaries 和 Verification

参考：@./references/execution.md
