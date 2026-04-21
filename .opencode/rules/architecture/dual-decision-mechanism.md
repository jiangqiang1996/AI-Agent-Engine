# SKILL.md 与代码的双重决策机制

> 本文件由 `/ae-save-rules` 命令生成，最后更新：2026-04-21

## SKILL.md 与代码的双重决策机制

AE 技能体系中，`SKILL.md` 和 TypeScript 服务代码可能对同一逻辑（如审查者选择）各自拥有一套决策机制。
这并非冗余或冲突，而是有意设计：
- `SKILL.md` 中的指令由 LLM 在执行技能时解读和遵循
- TypeScript 服务代码（如 `review-catalog.ts`、`review-selector.ts`）供工具（如 `ae-review-contract`）调用

两者应保持语义一致，但不应仅因为存在两套机制就报告为问题。当两者描述矛盾时，
应先确认哪一方的行为是预期的（优先参考上游参考项目的实现），再修正另一方。
