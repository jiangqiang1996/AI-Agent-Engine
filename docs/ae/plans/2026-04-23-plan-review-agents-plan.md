---
date: 2026-04-23
status: active
source: docs/ae/brainstorms/plan-review-agents-requirements.md
depth: lightweight
---

# 新增计划审查代理 — 实施计划

## 概述

为 `ae:plan-review` 新增 2 个专用审查代理：`step-granularity-reviewer`（步骤精细化）和 `batch-operation-reviewer`（批量操作），放入 `document-review` 目录，在计划审查时始终调度（通过 `review-selector` 的 `documentType === 'plan'` 条件分支实现，catalog 中 `alwaysOn: false` 以避免影响需求文档审查）。

## 待定问题关闭

- ~~[影响成功标准][技术] 确定新增代理文件的具体路径~~ → 已在 U2/U3 中确定为 `src/assets/agents/document-review/step-granularity-reviewer.md` 和 `batch-operation-reviewer.md`
- [影响 R3/R6][技术] 是否需要为小规模计划设置激活阈值 → 评估后保持 always-on，原因是步骤粒度和批量操作对任何规模的计划都有价值

## 实现单元

### U1. 注册代理常量

**目标**：在类型和常量系统中声明两个新代理

**文件**：
- `src/schemas/ae-asset-schema.ts` — `AGENT` 常量新增 `STEP_GRANULARITY_REVIEWER` 和 `BATCH_OPERATION_REVIEWER`
- `src/services/ae-catalog.ts` — `REQUIRED_AGENTS` 数组新增 2 个元组，stage 为 `'document-review'`
- `AGENTS.md` — 更新代理数量声明（25 required + 3 gilded = 28 → 27 required + 3 gilded = 30）

**方法**：
- `AGENT` 对象中新增条目放在 `SECURITY_LENS_REVIEWER` 之后（即 `REPO_RESEARCH_ANALYST` 之前），保持 document-review 相关常量聚集
- `REQUIRED_AGENTS` 元组数组中插入在第 168 行 `SECURITY_LENS_REVIEWER` 之后、第 169 行 `REPO_RESEARCH_ANALYST` 之前，保持 document-review 分组连续
- 无需修改 `AgentStageSchema`，`'document-review'` 已存在

**验证**：`npm run typecheck` 通过

---

### U2. 创建 step-granularity-reviewer 代理

**目标**：编写步骤精细化审查代理的 Markdown 定义

**文件**：`src/assets/agents/document-review/step-granularity-reviewer.md`

**方法**：
- 遵循现有 document-review 代理的 frontmatter + 正文格式（参考 `scope-guardian-reviewer.md`）
- 审查焦点：步骤拆解至最小不可再分单元、每个步骤具有明确且唯一的产出物、步骤间通过最终结果传递信息不共享可变中间状态
- 置信度校准：HIGH 0.80+（可引用原文展示步骤耦合）、MODERATE 0.60-0.79、低于 0.50 不输出
- 不在标记范围内：实现细节、技术架构、范围评估、安全

**测试场景**：
- 正常路径：审查一份步骤粒度过粗的计划，输出合理的拆解建议
- 边界情况：计划步骤已足够细化时，返回空 findings

---

### U3. 创建 batch-operation-reviewer 代理

**目标**：编写批量操作审查代理的 Markdown 定义

**文件**：`src/assets/agents/document-review/batch-operation-reviewer.md`

**方法**：
- 同样遵循 frontmatter + 正文格式
- 审查焦点：逐一审查步骤核心目标，当涉及多文件改动时优先推荐脚本化方案并给出具体建议；当文件间改动存在条件依赖、目标环境不支持脚本、或涉及文件数 ≤ 2 时允许逐个操作
- 置信度校准：同上标准
- 不在标记范围内：步骤粒度（step-granularity-reviewer 负责）、技术可行性、安全

**测试场景**：
- 正常路径：步骤涉及 5 个文件的相似改动，输出脚本化建议
- 边界情况：步骤仅涉及 1-2 个文件改动，允许逐个操作
- 错误路径：步骤涉及多文件但改动模式完全不同，建议逐个操作并说明理由

---

### U4. 注册到审查目录和选择器

**目标**：将新代理接入审查调度流程

**文件**：
- `src/services/review-catalog.ts` — `DOCUMENT_REVIEWERS` 数组新增 2 条 `ReviewDefinition`，`alwaysOn: false`
- `src/services/review-selector.ts` — 扩展现有 `documentType === 'plan'` 条件分支（第 30-32 行），在 if 块内追加两个代理

**方法**：
- catalog 中新增条目放在 `security-lens-reviewer` 之后
- `alwaysOn: false` 是有意设计：保持 catalog 声明与现有条件角色一致，实际调度由 selector 的 `documentType === 'plan'` 分支控制，确保需求文档审查不受影响
- selector 中扩展现有 `documentType === 'plan'` if 块（第 30 行），在同一分支内追加两个新代理的 `selected.push()` 调用
- 确保需求文档审查（`documentType === 'requirements'`）不调度这两个代理

**验证**：`npm run typecheck` + `npm run test` 通过

---

### U5. 更新 plan-review 技能文档

**目标**：在 plan-review SKILL.md 和参考文档中说明新增的审查角色

**文件**：
- `src/assets/skills/ae-plan-review/SKILL.md`
- `src/assets/skills/ae-plan-review/references/plan-review.md`

**方法**：
- SKILL.md 目标列表补充：步骤精细化审查（step-granularity-reviewer）和批量操作审查（batch-operation-reviewer）
- `references/plan-review.md` 补充内容：列出两个代理名称、说明仅在 plan 类型文档审查时调度、简要描述各自审查焦点（步骤粒度拆解 + 多文件脚本化建议）

---

### U6. 测试

**目标**：验证注册和选择逻辑

**文件**：
- `src/services/review-catalog.test.ts`（新建）
- `src/services/review-selector.test.ts`（新建）

**测试场景**：
- `selectDocumentReviewers({ documentType: 'plan' })` 返回结果包含两个新代理
- `selectDocumentReviewers({ documentType: 'requirements' })` 返回结果不包含两个新代理
- `DOCUMENT_REVIEWERS.filter(r => r.alwaysOn)` 不包含两个新代理（验证 alwaysOn: false）
- `DOCUMENT_REVIEWERS` 数组长度为 9（原 7 + 新 2）

## 依赖顺序

```
U1 (常量) → U2 (代理文件)
U1 (常量) → U3 (代理文件)
U1 (常量) → U4 (注册)
U2 + U3 (代理定义) → U5 (文档更新)
U4 (注册) → U6 (测试)
U1 (常量) → U5 (文档更新)
```

执行顺序：U1 → U2 + U3（并行）→ U4 → U5 → U6

## 风险

- **代理提示词质量**：代理的 Markdown 内容直接影响 LLM 审查行为，当前计划仅通过 typecheck 和选择逻辑测试验证注册正确性，代理的实际审查质量需人工或后续集成测试覆盖
