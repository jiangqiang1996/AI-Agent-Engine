---
title: "refactor: 精简非 JVM/前端语言内容 + 统一持久化到 docs/ae/ + 清理死代码"
type: refactor
status: completed
date: 2026-04-22
origin: docs/ae/brainstorms/2026-04-22-non-jvm-frontend-language-cleanup-requirements.md
---

# refactor: 精简非 JVM/前端语言内容 + 统一持久化 + 清理死代码

## 概览

本计划包含三方面的重构工作：
1. 精确移除非 JVM/前端生态语言的 skill 和 agent 内容（保留 Java/Kotlin/Spring/TS/JS/HTML/CSS/SQL）
2. 将所有运行时产物目录统一到 `docs/ae/` 下
3. 清理死代码和预留基础设施中无运行时调用者的 TS 文件

## 问题框架

项目存在三类问题：(1) Ruby/Rails、Python、Go、Rust 等非目标语言的专属内容；(2) 运行时产物散落在多个根目录；(3) 死代码和预留基础设施累积。详见源文档。(见源文档: docs/ae/brainstorms/2026-04-22-non-jvm-frontend-language-cleanup-requirements.md)

## 需求追溯

- R1. 移除 ae:dhh-rails-style skill
- R2. 移除 schema-drift-detector agent
- R3. 移除 kieran-python-reviewer agent
- R4-R15. 裁剪 12 个 agent 中的非保留语言段落
- R16. 同步 ae-catalog.ts 注册表
- R17-R20. 统一持久化目录到 docs/ae/
- R21. 删除 src/schemas/review-schema.ts（死代码）
- R22. 删除 src/services/review-orchestration.ts 及其测试
- R23. 删除 src/services/agent-sync.ts 及其测试和 reserved-infrastructure.md 规则
- R24. 移除 session-extract.service.ts 中未使用的 extractSessionContent 函数

## 范围边界

- 不做自然语言精简
- 不修改技能核心逻辑、执行流程、调度策略
- `.opencode/agents/ae/`、`.opencode/rules/`（除 reserved-infrastructure.md）、`~/.config/opencode/plugins/`、`script/` 保持原位

## 关键技术决策

- 统一持久化根目录：`docs/ae/`（用户已确认）
- `docs/ae/solutions/` 纳入统一目录：`docs/ae/solutions/` → `docs/ae/solutions/`（审查 P0-1 修复：44 处引用）
- ae:dhh-rails-style 不在 `skills/` 源码目录中（仅存在于运行时注入），无需删除源文件
- agent 文件中也有路径引用需迁移（审查 P0-2 修复：3 个 agent 文件）
- 本计划文件自身在执行完成后应迁移到 `docs/ae/plans/`，但执行期间保持在 `docs/ae/plans/` 不动
- `.opencode/rules/core/base.md` 中引用的旧路径需同步更新（审查 P0-4 修复）
- `AGENTS.md` 中的旧路径引用需同步更新（审查 P1-1 修复）

## 实现单元

- [x] **单元 1：移除语言专属 agent 和 skill + 清理死代码（R1-R3, R16, R21-R24）**

**目标：** 删除非保留语言专属项、死代码和预留基础设施，清理所有硬引用

**需求：** R1, R2, R3, R16, R21, R22, R23, R24

**依赖：** 无

**文件：**
- 删除：`agents/review/schema-drift-detector.md`
- 删除：`agents/review/kieran-python-reviewer.md`
- 删除：`src/schemas/review-schema.ts`
- 删除：`src/services/review-orchestration.ts`
- 删除：`src/services/review-orchestration.test.ts`
- 删除：`src/services/agent-sync.ts`
- 删除：`tests/integration/agent-sync.test.ts`
- 删除：`.opencode/rules/architecture/reserved-infrastructure.md`
- 修改：`src/services/ae-catalog.ts`（移除 DEFERRED_AGENTS 中的 schema-drift-detector、kieran-python-reviewer 条目）
- 修改：`src/services/session-extract.service.ts`（移除 `extractSessionContent` 函数和 `SessionExtractResultSchema`，保留类型导出）
- 修改：`skills/ae-review/SKILL.md`（移除 schema-drift-detector 模式漂移检查段落；移除 kieran-python-reviewer 行）
- 修改：`skills/ae-review/references/persona-catalog.md`（移除对应两行）
- 修改：`skills/ae-review/references/review-output-template.md`（移除 Schema 漂移检查章节引用）

**方法：**
- 删除 agent markdown 文件和死代码 TS 文件
- 从 `ae-catalog.ts` 的 `DEFERRED_AGENTS` 中移除对应条目
- 从 ae-review 的 SKILL.md、persona-catalog.md、review-output-template.md 中移除已删除项的引用
- `session-extract.service.ts`：移除 `extractSessionContent` 函数（ae-handoff.tool.ts 通过参数接收数据绕过了它）和 `SessionExtractResultSchema`（仅内部使用），保留 `SessionExtractResult` 类型和 `SessionExtractResultSchema` 的 Zod schema（如果 `SessionExtractResult` 类型仍被导入则保留 schema 定义）
- 删除 reserved-infrastructure.md 规则（该规则仅为保护 agent-sync.ts 而存在）
- ae:dhh-rails-style 无源文件可删

**测试场景：**
- 正常路径：`npm run build` 通过，`npm run test` 通过
- 边界情况：`getDeferredAgents()` 不再包含已删除项
- 错误路径：删除 review-schema.ts 不影响任何编译（零导入者）

**验证：**
- `npm run build` 无错误
- `npm run test` 全部通过
- grep 确认不再引用已删除项（排除需求文档）

---

- [x] **单元 2：裁剪 12 个 agent 中的非保留语言段落（R4-R15）**

**目标：** 从 12 个 agent 中移除或泛化 Ruby/Rails/Python/Go/Rust/PHP 等非保留语言的内容，保持通用方法论不变

**需求：** R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15

**依赖：** 单元 1

**文件：**
- 修改：`agents/review/data-migrations-reviewer.md`（R4）
- 修改：`agents/review/data-migration-expert.md`（R5）
- 修改：`agents/workflow/deployment-verification-agent.md`（R6）
- 修改：`agents/review/security-sentinel.md`（R7）
- 修改：`agents/review/performance-oracle.md`（R8）
- 修改：`agents/workflow/figma-design-sync.md`（R9）
- 修改：`agents/research/learnings-researcher.md`（R10）
- 修改：`agents/review/cli-agent-readiness-reviewer.md`（R11）
- 修改：`agents/research/repo-research-analyst.md`（R12）
- 修改：`agents/research/framework-docs-researcher.md`（R13）
- 修改：`agents/research/best-practices-researcher.md`（R14）
- 修改：`agents/review/agent-native-reviewer.md`（R15）

**方法：**

| Agent | 裁剪操作 |
|-------|---------|
| data-migrations-reviewer | `rake 任务` → `迁移脚本`，`includes(:deleted_association)` → `ORM 预加载已删除关联`，`.fetch(id)` → `查找操作`，`joins` → `关联查询` |
| data-migration-expert | `rake 任务` → `迁移脚本`，`includes/fetch` → 同上泛化，保留 SQL 段落不动 |
| deployment-verification-agent | `rails db:migrate` → `运行数据库迁移`，`rake data:backfill` → `运行数据回填脚本`，Ruby 控制台示例改写为等效 SQL 查询 |
| security-sentinel | 移除 `grep -r "params\[" --include="*.rb"` 示例，移除 Rails 专属审查段落（Strong Parameters/CSRF/mass assignment） |
| performance-oracle | `ActiveRecord 查询优化` → `ORM 查询优化（如 N+1 问题、预加载策略）`，移除 Rails 专属提示 |
| figma-design-sync | 所有 ERB `<%= render ... %>` 示例改写为 TSX `<Component ... />` 等价代码 |
| learnings-researcher | `rails_model/rails_controller/rails_view` → `data_model/controller/view`，`service_object` → `service_layer`，`frontend_stimulus/hotwire_turbo` → `frontend_framework` |
| cli-agent-readiness-reviewer | 删除 Python Click/argparse、Go Cobra、Rust clap、Ruby Thor 框架参考段（约 75 行），保留 Node.js Commander/yargs/oclif 段 |
| repo-research-analyst | 清单表只保留 `package.json`、`tsconfig.json`、`build.gradle/kts`、`pom.xml`、`deno.json` 行，移除其余语言行 |
| framework-docs-researcher | `bundle show` → `npm ls / gradle dependencies`，`Gemfile.lock` → `package-lock.json / gradle.lockfile` |
| best-practices-researcher | 替换单处 `bundle show` 为通用包管理器命令 |
| agent-native-reviewer | 移除 `Rails + MCP` 行和 `LangChain / LangGraph` 行，保留其余行 |

**测试场景：**
- 正常路径：裁剪后的 agent 仍保留完整的审查方法论步骤，可被 ae:review 等技能正常调度
- 边界情况：grep 确认 12 个裁剪后的 agent 均不再包含 Rails/Ruby/Python/Go/Rust 关键词（rake, ActiveRecord, bundle, Gemfile, ERB, clap, Cobra, Thor, Click, argparse）
- 错误路径：裁剪未破坏任何 agent 的 YAML frontmatter 格式和 markdown 结构

**验证：**
- grep 确认裁剪后的 agent 不再包含 Rails/Ruby/Python/Go/Rust 关键词
- 所有 agent 的 YAML frontmatter 格式完整

---

- [x] **单元 3：迁移 TypeScript 源码中的持久化路径（R17-R18）**

**目标：** 将 artifact-store.ts 和 todoread.tool.ts 中的硬编码路径指向 `docs/ae/` 统一目录

**需求：** R17, R18

**依赖：** 无（可与单元 1、2 并行）

**文件：**
- 修改：`src/services/artifact-store.ts`（`getArtifactDirectory` 函数）
- 修改：`src/tools/todoread.tool.ts`（路径基准和安全校验注释）

**方法：**

`artifact-store.ts` 路径映射变更：
```
brainstorm: docs/ae/brainstorms/  → docs/ae/brainstorms/
plan:       docs/ae/plans/        → docs/ae/plans/
work:       docs/ae/work/  → docs/ae/work/
review:     docs/ae/review/ → docs/ae/review/
```

`todoread.tool.ts` 路径变更：
- `join(workDir, 'docs', 'plans')` → `join(workDir, 'docs', 'ae', 'plans')`
- 所有字符串中的 `docs/ae/plans/` → `docs/ae/plans/`
- 正则 `docs\/plans\/` → `docs\/ae\/plans\/`

**测试场景：**
- 正常路径：`listArtifacts(manifest, 'brainstorm')` 正确返回 `docs/ae/brainstorms/` 下的文件
- 边界情况：`listArtifacts` 在目录不存在时返回空数组（与当前行为一致）
- 错误路径：`todoread.tool.ts` 的安全校验拒绝 `docs/ae/plans/` 以外的路径遍历尝试
- 集成：`ae:recovery` 工具通过 `recovery-service → artifact-store` 链路正确发现新路径下的产物

**验证：**
- `npm run build` 通过

---

- [x] **单元 4：迁移所有 markdown 文件中的路径引用（R19）**

**目标：** 将所有 SKILL.md、references、agent markdown、AGENTS.md 和规则文件中的持久化路径引用从旧目录迁移到 `docs/ae/`

**需求：** R19

**依赖：** 单元 3

**文件：**

**Skills（16 个文件）：**
- `skills/ae-brainstorm/SKILL.md`、`references/requirements-capture.md`、`references/handoff.md`
- `skills/ae-plan/SKILL.md`、`references/plan-handoff.md`、`references/universal-planning.md`
- `skills/ae-lfg/SKILL.md`
- `skills/ae-document-review/SKILL.md`、`references/synthesis-and-presentation.md`、`references/review-output-template.md`
- `skills/ae-ideate/SKILL.md`、`references/post-ideation-workflow.md`、`references/universal-ideation.md`
- `skills/ae-review/SKILL.md`、`references/subagent-template.md`、`references/review-output-template.md`

**Agents（3 个有路径引用的文件）：**
- `agents/research/session-historian.md`
- `agents/review/project-standards-reviewer.md`
- `agents/research/git-history-analyzer.md`

**项目文件：**
- `AGENTS.md`
- `.opencode/rules/core/base.md`

**方法：**
全局替换规则：

| 旧路径 | 新路径 |
|--------|--------|
| `docs/ae/brainstorms/` | `docs/ae/brainstorms/` |
| `docs/ae/plans/` | `docs/ae/plans/` |
| `docs/ideation/` | `docs/ae/ideation/` |
| `docs/ae/solutions/` | `docs/ae/solutions/` |
| `docs/ae/review/` | `docs/ae/review/` |
| `docs/ae/work/` | `docs/ae/work/` |
| `docs/ae/todos/` | `docs/ae/todos/` |
| `<OS-temp>` / `<scratch-dir>` 模式 | `docs/ae/scratch/` |

**注意：**
- 仅替换路径字符串，不改任何指令逻辑
- `docs/ae/review/` 简化为 `docs/ae/review/`
- `AGENTS.md` 中引用旧路径的示例文件名同步更新
- `.opencode/rules/core/base.md` 中 `docs/ae/brainstorms/`、`docs/ae/plans/`、`docs/ae/solutions/` 的目录描述同步更新为 `docs/ae/` 下
- **例外：本计划文件自身（`docs/ae/plans/2026-04-22-002-...`）在执行期间不迁移，路径替换应跳过本文件。仅在单元 6 的最后一步单独迁移。**

**测试场景：**
- 正常路径：ae:brainstorm 执行后产出文档到 `docs/ae/brainstorms/`
- 集成：ae:lfg 门控检查在 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 下正确查找产物
- 集成：ae:review 产物正确写入 `docs/ae/review/<run-id>/`
- 边界情况：grep 确认 skills/、agents/、AGENTS.md、.opencode/rules/ 中不再包含旧路径（排除本计划文件自身）

**验证：**
- grep 确认 .ts、skills/、agents/、AGENTS.md、.opencode/rules/ 中不再包含旧路径

---

- [x] **单元 5：更新测试文件（R17, R18, R21-R24）**

**目标：** 更新路径迁移相关的测试文件，删除已移除代码的测试文件

**需求：** R17, R18, R21, R22, R23

**依赖：** 单元 1, 单元 3

**文件：**
- 删除：`src/services/review-orchestration.test.ts`（随 review-orchestration.ts 删除）
- 删除：`tests/integration/agent-sync.test.ts`（随 agent-sync.ts 删除，如存在）
- 修改：`src/services/recovery-service.test.ts`（mock 路径迁移）
- 修改：`src/tools/ae-recovery.tool.test.ts`（mock 路径迁移）
- 修改：`tests/integration/recovery-flow.test.ts`（`.context/ae/work` → `docs/ae/work`）
- 删除：`tests/integration/review-orchestration.test.ts`（必然引用 review-orchestration.ts，无保留价值）
- 修改：`tests/integration/review-catalog.integration.test.ts`（如引用 review-schema.ts 中的类型，需移除该 import 并调整类型引用）
- 修改：`src/services/runtime-asset-manifest.test.ts`（删除对已移除 agent 的断言，如有；仅迁移 artifact 路径，runtimeAgentDir 不变）

**验证：**
- `npm run test` 全部通过

---

- [x] **单元 6：构建验证与最终检查**

**目标：** 确保整体重构后的项目完整性和一致性

**需求：** 所有需求

**依赖：** 单元 1-5

**方法：**
1. `npm run build` 零错误
2. `npm run test` 全部通过
3. grep 验证（排除 node_modules/、dist/、.git/、需求文档）：
   - `docs/ae/brainstorms/` 不出现在 .ts、skills/、agents/、AGENTS.md、.opencode/rules/ 中
   - `docs/ae/plans/` 不出现在 .ts、skills/、agents/、AGENTS.md、.opencode/rules/ 中（排除本计划文件自身）
   - `.context/ae/` 不出现在上述范围
   - `docs/ideation/` 不出现在上述范围
   - `schema-drift-detector`、`kieran-python-reviewer` 不出现在上述范围
   - `review-schema`、`review-orchestration`、`agent-sync` 不出现在 src/ 中（排除测试文件）
4. 验证 ae-catalog.ts 导出的 agent 列表与 `agents/` 目录文件一致
5. 检查 `opencode.json` 是否包含旧路径引用
6. 将本计划文件迁移到 `docs/ae/plans/` 并从旧位置删除

**验证：**
- 无非保留语言专属 skill/agent
- 保留 agent 中无非保留语言代码示例
- 产物集中在 `docs/ae/` 下
- `npm run build` 通过
- `npm run test` 通过
- ae-catalog.ts 与实际文件一致
- `docs/ae/` 不加入 `.gitignore`（产物文档属于项目知识资产，应纳入版本控制）

## 执行姿态

**分支：** `refactor/language-cleanup-unified-persistence`

**回滚策略：**
- 每单元作为一个原子 commit，commit 信息使用中文并标注单元编号（如 `refactor(agents): 单元1 移除语言专属 agent 和死代码`）
- 若任何单元失败，通过 `git revert` 回滚到上一个成功 commit
- 单元 4（16+ markdown 文件路径替换）建议按技能分组逐个执行（ae-brainstorm 组 → ae-plan 组 → ae-lfg 组...），避免一次性大规模替换导致定位困难
- 执行前确保 `npm run test` 在 `main` 分支上全部通过，作为基线

## 风险与依赖

| 风险 | 缓解 |
|------|------|
| 路径替换遗漏导致运行时找不到文件 | 单元 6 grep 全量扫描 |
| agent 裁剪破坏 markdown 结构 | 逐个验证 frontmatter |
| 删除预留基础设施后未来需重新实现 | git 历史可恢复，且当前确实无运行时调用者 |
| `docs/ae/solutions/` 迁移遗漏 | 已纳入单元 4 替换规则 |
| 单元 3/4 执行到一半失败导致新旧路径混合 | 原子 commit + git revert 回滚策略 |

## 来源与参考

- **源文档：** [docs/ae/brainstorms/2026-04-22-non-jvm-frontend-language-cleanup-requirements.md](docs/ae/brainstorms/2026-04-22-non-jvm-frontend-language-cleanup-requirements.md)
- 相关代码：`src/services/ae-catalog.ts`、`src/services/artifact-store.ts`、`src/tools/todoread.tool.ts`
