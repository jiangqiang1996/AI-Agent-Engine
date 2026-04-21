# 阶段回退策略

> 本文件由 `/ae-save-rules` 命令生成，最后更新：2026-04-21

## 阶段回退策略

AE 流程中，当某个阶段找不到可恢复的上游产物时，回退到更早的阶段是有意设计而非错误。
例如 `plan` 阶段没有 brainstorm 产物时回退到 `ae:brainstorm`，因为 plan 依赖上游需求文档。

原则：
- 有上游依赖的阶段，找不到上游产物时应回退到上游阶段
- `recovery-service.ts` 中的 `fallbackSkillForPhase` 映射体现了这一依赖链
- 不应将"回退到更早阶段"报告为逻辑错误
