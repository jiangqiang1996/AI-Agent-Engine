---
name: ae:document-review
description: 对需求文档执行多 reviewer 并行审查，汇总 findings 并给出 gate 结果
argument-hint: "[mode:*] [文档路径]"
---

# AE Document Review

目标：
- 对 requirements 文档做多 reviewer 审查
- 使用 `ae-review-contract` 工具获取 reviewer team 与模式约定
- 并行调度 document-review reviewers
- 合并 findings，并给出是否可继续进入计划阶段的结论

reviewer team 规则：
- always-on 与 conditional reviewers 统一由 `ae-review-contract` 计算
- skill 文案不再手工维护第二份 reviewer 名单
- 若文档类型或上下文变化，以 contract 返回结果为准

参考：@./references/review-contract.md
