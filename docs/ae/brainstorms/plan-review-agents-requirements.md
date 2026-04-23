---
date: 2026-04-23
topic: plan-review-agents
---

# 新增计划审查代理

## 问题框架

`ae:plan-review` 复用 `ae:document-review` 的代理族审查计划文档。当前审查覆盖了一致性、可行性、范围、产品价值等维度，但缺少两个关键视角：步骤粒度是否足够细化，以及多文件操作是否优先采用脚本化批量执行。这导致计划可能包含粒度过粗或耦合过强的步骤，或包含可批量执行却被描述为逐个手动操作的步骤，降低 `ae:work` 执行效率。

## 需求

**步骤精细化审查**
- R1. 新增代理 `step-granularity-reviewer`，归属 `document-review` 目录，审查计划的每个步骤是否已拆解至最小不可再分的单元
- R2. 该代理须确保每个步骤具有明确且唯一的产出物，步骤间通过最终结果传递信息，不共享可变中间状态
- R3. 在 `review-selector.ts` 的 `selectDocumentReviewers` 中，当 `documentType === 'plan'` 时始终追加该代理

**批量操作审查**
- R4. 新增代理 `batch-operation-reviewer`，归属 `document-review` 目录，逐一审查计划中所有步骤的核心目标
- R5. 若步骤目标会引发多个文件改动，该代理须优先判断能否通过脚本实现批量执行，推荐脚本化方案并给出具体建议；当文件间改动存在条件依赖、目标环境不支持脚本、或涉及文件数 ≤ 2 时，允许逐个操作并说明理由
- R6. 在 `review-selector.ts` 的 `selectDocumentReviewers` 中，当 `documentType === 'plan'` 时始终追加该代理

## 成功标准
- 两个代理遵循现有 document-review 代理的命名、格式和置信度校准约定
- `ae-asset-schema.ts` 的 `AGENT` 常量包含新增条目
- `ae-catalog.ts` 的 `REQUIRED_AGENTS` 数组包含新增代理的 `[name, stage, description]` 元组
- `review-catalog.ts` 的 `DOCUMENT_REVIEWERS` 数组包含新增定义
- `review-selector.ts` 的 `selectDocumentReviewers` 在 `documentType === 'plan'` 时自动包含两个代理
- `ae:plan-review` SKILL.md 更新公告，提及新增的审查角色

## 范围边界
- 不修改现有代理的行为
- 不修改 `ae:document-review` 对需求文档的审查流程
- 不新增工具或技能，仅新增代理和注册逻辑

## 关键决策
- 放入 `document-review` 目录而非新建 `plan-review` 目录：保持 plan-review 复用 document-review 代理族的现有架构，避免引入新的调度分支
- 在 `selectDocumentReviewers` 中通过 `documentType === 'plan'` 条件追加，而非修改 `ReviewDefinition.alwaysOn`：避免影响需求文档的审查流程
- 设为计划审查 always-on 而非条件激活：步骤粒度和批量操作是计划质量的通用要求，不受计划规模影响（推迟到规划：可评估是否增加步骤数阈值以减少小计划的 token 开销）

## 待定问题

### 推迟到规划
- [影响 R3/R6][技术] 是否需要为小规模计划（步骤数 < N）设置激活阈值以优化审查开销
- [影响成功标准][技术] 确定新增代理文件的具体路径

## 下一步
-> /ae-plan
