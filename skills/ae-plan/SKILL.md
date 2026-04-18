---
name: ae:plan
description: 基于 requirements 或直接输入生成 CE 风格 living plan，并在完成后进入计划审查
argument-hint: "[plan 路径|requirements 路径|需求描述]"
---

# AE Plan

目标：
- 读取 requirements 文档或用户输入
- 生成 `docs/plans/*-plan.md`
- 计划必须是 living plan，包含实现单元、复选框、文件路径、测试场景和验证标准
- 计划完成后转入 `ae:plan-review`

执行原则：
- 以 requirements 为 source of truth
- 不把实现代码写进计划
- 每个实现单元都应足够清晰，便于后续子代理执行

参考：@./references/plan-shape.md
