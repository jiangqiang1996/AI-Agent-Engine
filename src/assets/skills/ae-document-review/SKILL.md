---
name: ae:document-review
description: "面向文档的专项审查。对指定范围的文档文件进行多角色审查，与 Git 版本差异无强关联。核心流程中审查需求文档和计划文档，也可手动调用审查任意文档。"
argument-hint: "[mode:*] [文档路径]"
---

# 文档审查（已合并）

此技能已合并到 `ae:review`。请使用 `ae:review` 技能，并传入 `domain:document` 参数。

示例：
- `ae:review domain:document` — 自动搜索最近的文档进行审查
- `ae:review domain:document docs/ae/plans/my-plan.md` — 审查指定文档
- `ae:review domain:document mode:headless docs/ae/plans/my-plan.md` — 无头模式审查

所有文档审查能力（需求文档、计划文档、测试文档、通用文档的多角色审查）现已统一到 `ae:review` 中。
