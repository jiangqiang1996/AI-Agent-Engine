---
name: ae:review
description: 对代码改动执行 CE 风格多 reviewer 审查，支持 interactive、headless、report-only 与 autofix 模式
argument-hint: "[mode:*] [plan:<path>] [base:<ref>]"
---

# AE Review

目标：
- 对代码改动执行多 reviewer 审查
- 使用 `ae-review-contract` 获取 reviewer team、模式与 gate 约定
- 由 markdown workflow 并行派发 reviewers，再使用共享 review contract 合并 findings

reviewer team 规则：
- always-on 与 conditional reviewers 统一由 `ae-review-contract` 计算
- skill 文案不再手工维护第二份 reviewer 名单
- 当 diff 特征变化时，以 contract 生成的 team 为准

参考：@./references/modes.md
