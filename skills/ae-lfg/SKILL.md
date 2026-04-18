---
name: ae:lfg
description: 默认入口：驱动从需求到执行的 AE 主链路；若已有产物则优先恢复，否则从 brainstorm 开始
argument-hint: "[需求描述|已有产物路径]"
---

# AE LFG

默认入口策略：
- 优先使用 `ae-recovery` 工具检查是否已有可恢复产物
- 若存在单一候选，则恢复到对应阶段
- 若存在多个候选，则要求显式选择
- 若没有产物，则回到 `ae:brainstorm`

标准主链路：
1. `ae:brainstorm`
2. `ae:document-review`
3. `ae:plan`
4. `ae:plan-review`
5. `ae:work`
6. `ae:review`

参考：@./references/pipeline.md
