---
name: ae:plan-review
description: 对计划文档执行多 reviewer 审查，复用 document-review agent family，并确认是否可以进入执行阶段
argument-hint: "[mode:*] [计划路径]"
---

# AE Plan Review

目标：
- 对计划文档做多 reviewer 审查
- 复用 `ae:document-review` 的 reviewer family，并对 plan 文档使用 plan-specific 分类
- 使用 `ae-review-contract` 计算当前 plan review 的 reviewer team
- 确认实现顺序、范围、测试场景和恢复路径是否足够清晰

参考：@./references/plan-review.md
