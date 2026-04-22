---
date: 2026-04-22
topic: non-jvm-frontend-language-cleanup-and-unified-persistence
---

# 精简非 JVM/前端语言内容 + 统一持久化目录 + 清理死代码

## 问题框架

当前项目存在两个结构性问题：

1. **语言噪音** — 项目中存在为 Ruby/Rails、Python、Go、Rust 等非目标语言设计的 skill 和 agent。项目定位为 TypeScript opencode 插件，服务于 JVM + 前端技术栈，这些内容造成维护负担。
2. **持久化散乱** — 运行时产出的文件散落在 4 个不同根目录（`docs/`、`.context/`、`.opencode/rules/`、`<OS-temp>/`），缺少统一管理，不利于清理、迁移和跨机器移植。

---

## 附录 A：技能清单与依赖关系

### 技能总表

| 技能 | 用途 | 持久化文件 | 依赖技能 | 依赖代理 | 依赖工具 |
|------|------|-----------|---------|---------|---------|
| ae:lfg | 主流程管道，驱动需求→执行 | 无 | ae:setup, ae:brainstorm, ae:document-review, ae:plan, ae:plan-review, ae:work, ae:review, ae:test-browser | 无 | ae-recovery |
| ae:brainstorm | 协作对话探索需求，产出需求文档 | `docs/brainstorms/*-requirements.md` | ae:document-review | 无 | 无 |
| ae:document-review | 并行角色代理审查文档 | 无 | 无 | coherence-reviewer, feasibility-reviewer, product-lens-reviewer, design-lens-reviewer, security-lens-reviewer, scope-guardian-reviewer, adversarial-document-reviewer | 无 |
| ae:plan | 创建结构化实现计划 | `docs/plans/YYYY-MM-DD-NNN-*-plan.md` | ae:document-review | repo-research-analyst, learnings-researcher, framework-docs-researcher, best-practices-researcher, spec-flow-analyzer | 无 |
| ae:plan-review | 多角色审查计划文档 | 无 | ae:document-review, ae:plan | 复用 document-review 角色族 | ae-review-contract |
| ae:work | 按计划执行工作并交付 | git commits | ae:review | figma-design-sync, design-implementation-reviewer（UI 工作时） | 无 |
| ae:review | 结构化代码审查 | `.context/ae/ae-review/<run-id>/*.json`, `.context/ae/todos/*` | 无 | correctness-reviewer, testing-reviewer, maintainability-reviewer, project-standards-reviewer, agent-native-reviewer; 条件: security-reviewer, performance-reviewer, api-contract-reviewer, data-migrations-reviewer, reliability-reviewer, adversarial-reviewer, cli-readiness-reviewer, previous-comments-reviewer, kieran-python-reviewer, kieran-typescript-reviewer, cli-agent-readiness-reviewer | 无 |
| ae:ideate | 生成并评估落地想法 | `docs/ideation/*`, `<scratch-dir>/raw-candidates.md` | ae:brainstorm | learnings-researcher, web-researcher, 6 个创意子代理 | 无 |
| ae:frontend-design | 构建设计品质的 Web 界面 | 无 | ae:setup, ae:test-browser | design-iterator, design-implementation-reviewer | 无 |
| ae:save-rules | 保存项目规范到 rules 目录 | `.opencode/rules/{category}/*.md` | 无 | session-historian | 无 |
| ae:sql | 通过 JDBC 连接数据库执行 SQL | `script/jre/`, `script/drivers/*.jar` | 无 | 无 | 无 |
| ae:task-loop | 循环执行任务直到达成目标 | 无 | 任意 ae:* skill（可插拔） | 执行子代理、验证子代理 | 无 |
| ae:test-browser | 端到端浏览器测试 | 截图文件 | ae:setup | 无 | 无 |
| ae:setup | 安装 agent-browser 依赖 | 无 | 无 | 无 | 无 |
| ae:update | 拉取最新代码并重新构建 | `~/.config/opencode/plugins/ae-server.js`, `ae-tui.js` | 无 | 无 | 无 |
| ae:handoff | 会话交接，创建新会话注入上下文 | 无 | 无 | 无 | todoread |
| ae:help | 列出所有技能和代理帮助信息 | 无 | 无 | 无 | 无 |

### 技能调用依赖图

```
ae:lfg ──► ae:setup, ae:brainstorm, ae:document-review, ae:plan, ae:plan-review, ae:work, ae:review, ae:test-browser
ae:brainstorm ──► ae:document-review
ae:plan ──► ae:document-review, (可选回退 ae:brainstorm)
ae:plan-review ──► ae:document-review, ae:plan
ae:work ──► ae:review, (可选回退 ae:brainstorm / ae:plan)
ae:ideate ──► ae:brainstorm
ae:frontend-design ──► ae:setup, ae:test-browser
ae:test-browser ──► ae:setup
ae:task-loop ──► 任意 ae:* skill
ae:save-rules ──► (@session-historian agent)
ae:review, ae:document-review, ae:sql, ae:setup, ae:update, ae:help, ae:handoff ──► 独立
```

---

## 附录 B：代理清单与依赖关系

### 代理分类总表（按 stage 分组）

**document-review 阶段（7 个 — REQUIRED）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 |
|------|------|---------|--------------|
| coherence-reviewer | 审查文档内部一致性 | ae:document-review, ae:plan-review | 无 |
| feasibility-reviewer | 评估方案落地可行性 | ae:document-review, ae:plan-review | 无 |
| product-lens-reviewer | 产品价值与用户视角审查 | ae:document-review, ae:plan-review | 无 |
| scope-guardian-reviewer | 审查范围是否蔓延 | ae:document-review, ae:plan-review | 无 |
| adversarial-document-reviewer | 对文档做对抗式压力测试 | ae:document-review, ae:plan-review | 无 |
| design-lens-reviewer | 审查界面与交互设计约束 | ae:document-review, ae:plan-review | 无 |
| security-lens-reviewer | 审查文档中的安全边界 | ae:document-review, ae:plan-review | 无 |

**research 阶段（5 个 — REQUIRED）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 |
|------|------|---------|--------------|
| repo-research-analyst | 研究仓库结构与已有模式 | ae:plan | Go/Rust/Ruby/Python/PHP/Elixir/Dart/Swift/C# 清单表 (~20%) |
| learnings-researcher | 提炼已有经验与文档知识 | ae:plan, ae:ideate | rails_model/rails_controller 等枚举值 (~10%) |
| framework-docs-researcher | 收集框架和官方文档 | ae:plan | bundle show/Gemfile.lock (~10%) |
| best-practices-researcher | 收集社区最佳实践 | ae:plan | 单处 bundle show (~2%) |
| web-researcher | 搜索并总结网络信息 | ae:ideate | 无 |

**research 阶段（2 个 — GILDED）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 |
|------|------|---------|--------------|
| session-historian | 回溯历史会话经验 | ae:save-rules | 无 |
| git-history-analyzer | 分析 git 历史背景 | ae:review（可选） | 无 |

**workflow 阶段（3 个 — REQUIRED/GILDED）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 | 层级 |
|------|------|---------|--------------|------|
| spec-flow-analyzer | 分析阶段流转和边界情况 | ae:plan | 无 | REQUIRED |
| design-iterator | 推动多轮设计迭代 | ae:frontend-design | 无 | GILDED |
| figma-design-sync | 同步 Figma 与实现 | ae:work, ae:frontend-design | ERB 模板示例 (~35%) | GILDED |

**review 阶段 — REQUIRED（12 个）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 |
|------|------|---------|--------------|
| correctness-reviewer | 审查逻辑正确性与边界条件 | ae:review | 无 |
| testing-reviewer | 审查测试覆盖与断言质量 | ae:review | 无 |
| maintainability-reviewer | 审查可维护性与抽象合理性 | ae:review | 无 |
| project-standards-reviewer | 审查是否遵守项目规范 | ae:review | 无 |
| agent-native-reviewer | 审查代理操作友好性 | ae:review | Rails+MCP 行、LangChain 行 (~8%) |
| security-reviewer | 审查安全漏洞 | ae:review | 无 |
| performance-reviewer | 审查性能瓶颈 | ae:review | 无 |
| api-contract-reviewer | 审查接口契约破坏性变更 | ae:review | 无 |
| reliability-reviewer | 审查故障恢复与可靠性 | ae:review | 无 |
| adversarial-reviewer | 对抗式构造故障场景 | ae:review | 无 |
| cli-readiness-reviewer | 审查 CLI 调用体验 | ae:review | 无 |
| previous-comments-reviewer | 复查历史审查评论 | ae:review | 无 |

**review 阶段 — REQUIRED（2 个，语言专属）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 | 处置 |
|------|------|---------|--------------|------|
| kieran-typescript-reviewer | 按严格 TS 标准审查实现 | ae:review | 无（保留语言） | 保留 |
| kieran-python-reviewer | Python 严格审查 | ae:review | Python 核心用途 | **移除** |

**review 阶段 — GILDED（6 个）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 |
|------|------|---------|--------------|
| architecture-strategist | 架构一致性角度审视设计 | ae:review | 无 |
| pattern-recognition-specialist | 识别设计模式与重复代码 | ae:review | 无 |
| performance-oracle | 深入分析性能瓶颈 | ae:review | ActiveRecord 提示 (~5%) |
| security-sentinel | 深入执行安全审计 | ae:review | Rails grep 示例 (~10%) |
| cli-agent-readiness-reviewer | 评估 CLI 对代理的友好程度 | ae:review | Python/Go/Rust/Ruby 框架段 (~50%) |
| design-implementation-reviewer | 比对设计稿与实现 | ae:review, ae:frontend-design, ae:work | 无 |

**review 阶段 — DEFERRED（6 个）**

| 代理 | 用途 | 使用技能 | 非保留语言引用 | 处置 |
|------|------|---------|--------------|------|
| schema-drift-detector | 检查 schema 漂移 | ae:review | Rails 核心用途 (~95%) | **移除** |
| data-migrations-reviewer | 审查数据迁移 | ae:review | rake/includes (~12%) | 裁剪 |
| data-migration-expert | 审查迁移细节 | ae:review | rake/includes/fetch (~12%) | 裁剪 |
| data-integrity-guardian | 审查数据完整性 | ae:review | 无 | 保留 |
| deployment-verification-agent | 输出部署验证清单 | ae:review | rails/rake/Ruby 控制台 (~15%) | 裁剪 |
| kieran-python-reviewer | Python 严格审查 | ae:review | Python 核心用途 | **移除** |

---

## 附录 C：当前持久化文件分布

| 根目录 | 子路径 | 写入者 | 内容 |
|--------|--------|--------|------|
| `docs/` | `brainstorms/` | ae:brainstorm | 需求文档 |
| `docs/` | `plans/` | ae:plan | 计划文档 |
| `docs/` | `ideation/` | ae:ideate | 创意文档 |
| `.context/ae/` | `ae-review/<run-id>/` | ae:review | 审查运行产物 |
| `.context/ae/` | `work/` | ae:lfg 管道 | 工作运行产物 |
| `.context/ae/` | `todos/` | ae:review(autofix) | 持久化待办 |
| `.opencode/` | `rules/{category}/` | ae:save-rules | 项目规范文件 |
| `.opencode/` | `agents/ae/` | agent-sync.ts | 代理定义文件 |
| `~/.config/opencode/plugins/` | `ae-server.js`, `ae-tui.js` | ae:update | 桥接文件 |
| `<OS-temp>/` | `ae-ae-ideate-<run-id>/` | ae:ideate | 检查点 + 缓存 |
| `script/` | `jre/`, `drivers/` | ae:sql | JRE 运行时 + JDBC 驱动 |

**问题**：产物散落在 `docs/`、`.context/`、`.opencode/rules/`、`script/`、`<OS-temp>/` 五个根目录，缺少统一入口。

---

## 需求

### 第一部分：精简非保留语言内容

**完全移除**

- R1. 移除 `ae:dhh-rails-style` skill — 整个 skill 为 Ruby/Rails DHH 编码风格设计
- R2. 移除 `schema-drift-detector` agent — 核心用途是检测 Rails `schema.rb` 漂移，95% 内容绑定 Rails
- R3. 移除 `kieran-python-reviewer` agent — 专为 Python 代码审查设计

**裁剪非保留语言段落**

- R4. `data-migrations-reviewer` — 泛化 rake/includes/joins 等 Rails 术语为 ORM 通用描述
- R5. `data-migration-expert` — 泛化 rake/includes/fetch 等 Rails 术语，保留 SQL 段落
- R6. `deployment-verification-agent` — 将 rails/rake 命令替换为通用迁移命令，Ruby 控制台示例改写为 SQL
- R7. `security-sentinel` — 移除 Rails grep 示例和 Strong Parameters/CSRF 段落
- R8. `performance-oracle` — 移除 ActiveRecord 查询优化提示，泛化为 ORM 通用建议
- R9. `figma-design-sync` — 将 ERB 模板示例全部改写为 TSX/JSX 等价代码
- R10. `learnings-researcher` — 将 rails_model/rails_controller 等枚举值替换为通用组件名
- R11. `cli-agent-readiness-reviewer` — 移除 Python(Click/argparse)、Go(Cobra)、Rust(clap)、Ruby(Thor) 框架参考段，保留 Node.js(Commander/yargs/oclif) 段
- R12. `repo-research-analyst` — 清单表仅保留 package.json/tsconfig.json/build.gradle/pom.xml 等 JS/JVM 行，移除 Go/Rust/Ruby/Python/PHP/Elixir/Dart/Swift/C# 行
- R13. `framework-docs-researcher` — 将 bundle show/Gemfile.lock 替换为通用包管理器引用（npm/gradle）
- R14. `best-practices-researcher` — 替换单处 bundle show 引用
- R15. `agent-native-reviewer` — 移除 Rails+MCP 行和 LangChain 行

**注册表同步**

- R16. 在 `src/services/ae-catalog.ts` 中移除已删除 agent 的注册条目（schema-drift-detector、kieran-python-reviewer），移除 ae:dhh-rails-style 的 skill 条目

### 第二部分：统一持久化目录

- R17. 将所有 AE 运行时产物统一到 `docs/ae/` 根目录下的不同子目录，子目录结构如下：
  - `docs/ae/brainstorms/` — 需求文档
  - `docs/ae/plans/` — 计划文档
  - `docs/ae/ideation/` — 创意文档
  - `docs/ae/review/<run-id>/` — 审查运行产物
  - `docs/ae/work/` — 工作运行产物
  - `docs/ae/todos/` — 持久化待办
  - `docs/ae/scratch/<run-id>/` — 检查点与缓存文件（原 OS 临时目录）
- R18. 修改 `src/services/artifact-store.ts` 中的 `getArtifactDirectory` 使其指向新的统一目录结构
- R19. 修改所有受影响 skill 的 SKILL.md 及其 references/ 文件中的文件路径引用，指向新的统一目录
- R20. 不纳入统一的目录（保持原位）：`.opencode/agents/ae/`（opencode 平台约定）、`~/.config/opencode/plugins/`（全局安装位置）、`script/`（ae:sql 的 JRE/驱动）、`.opencode/rules/`（opencode 平台约定）

### 第三部分：清理无用 TypeScript 代码

- R21. 删除 `src/schemas/review-schema.ts` — 死代码，全项目零导入者
- R22. 删除 `src/services/review-orchestration.ts` 及其测试文件 — 预留基础设施，无运行时调用者，审查流程由 SKILL.md 驱动
- R23. 删除 `src/services/agent-sync.ts` 及其测试文件 — 预留基础设施，无运行时调用者，opencode 直接发现 agent。同时删除 `.opencode/rules/architecture/reserved-infrastructure.md` 规则（该规则仅为保护 agent-sync 而存在）
- R24. 从 `src/services/session-extract.service.ts` 中移除未使用的 `extractSessionContent` 函数和 `SessionExtractResultSchema`，仅保留被 `session.service.ts` 和 `handoff.service.ts` 使用的类型导出

### 保留语言边界

保留的语言/技术栈范围：
- JVM 生态：Java、Kotlin、Spring、Maven、Gradle、JDBC、MyBatis、JPA
- 前端生态：TypeScript、JavaScript、HTML、CSS、React、Vue、Angular、Node.js、Tailwind
- SQL（作为数据库通用语言）

## 成功标准

- 项目中不再包含 Ruby/Rails、Python、Go、Rust、PHP、Elixir、Swift、C# 等语言的专属 skill 或 agent
- 所有保留的 agent 中的代码示例和工具引用仅涉及保留语言或通用概念
- 所有 AE 运行时产物集中在单一根目录下的子目录中
- `npm run build` 通过
- `npm run test` 通过
- ae-catalog.ts 注册表与实际 agent 文件一致
- artifact-store.ts 的路径映射与新目录结构一致

## 核心保护约束

所有 17 个现有技能的核心逻辑必须完整保留，不得因重构而削弱功能或改变行为流程。以下技能为管道核心，属于最高保护等级：

| 技能 | 保护要点 |
|------|---------|
| **ae:lfg** | 主流程管道编排逻辑、阶段恢复机制、各阶段门控条件 |
| **ae:brainstorm** | 协作对话流程、需求文档产出逻辑、产品压力测试方法 |
| **ae:plan** | 计划生成流程、深化机制、引用解析、计划模板结构 |
| **ae:work** | 按计划执行的分发策略、实现单元调度、质量门控 |
| **ae:ideate** | 创意生成+批判评估的双阶段流程、子代理并行调度 |
| **ae:review** | 分层角色代理、置信度门控、合并去重流水线 |
| **ae:document-review** | 并行审查者调度、发现合并与去重 |
| **ae:plan-review** | 复用 document-review 角色族的逻辑 |
| **ae:frontend-design** | 设计品质验证流程、上下文模块 A/B/C |
| **ae:save-rules** | 规范提取与分类逻辑 |
| **ae:sql** | JDBC 连接与 SQL 执行流程 |
| **ae:task-loop** | 可插拔执行+验证的循环机制 |
| **ae:test-browser** | agent-browser 端到端测试流程 |
| **ae:setup** | 依赖诊断与安装 |
| **ae:update** | 仓库还原+拉取+构建流程 |
| **ae:help** | 技能/代理清单扫描与展示 |
| **ae:handoff** | 会话上下文提取与新会话注入 |

**约束规则：**
- 仅允许修改文件路径引用（R17-R19 持久化迁移）、非保留语言段落裁剪（R4-R15）、注册条目增删（R16）
- 不允许修改任何技能的执行流程、阶段门控、子代理调度策略、输出格式规范
- 重构后的每个技能必须能通过其原有用例场景的端到端验证

## 范围边界

- **不做**自然语言精简（ae-review/ae-plan 等大文件的冗余内容不在本次范围）
- **不修改**通用 agent 的核心逻辑和审查方法论
- `data-integrity-guardian` 无需修改（已完全语言无关）
- 规则文件（rules/、.opencode/rules/）已确认不含非保留语言引用，无需修改
- `.opencode/agents/ae/`、`.opencode/rules/`、`~/.config/opencode/plugins/`、`script/` 保持原位不变

## 关键决策

- 保留 SQL 相关内容：data-migrations-reviewer、data-migration-expert、deployment-verification-agent 中的 SQL 段落属于数据库通用语言，在保留范围
- 对混合内容 agent 采用裁剪而非删除：这些 agent 的审查/研究方法论本身是语言无关的，具有保留价值
- figma-design-sync 的 ERB 示例改写为 TSX/JSX 而非删除：该 agent 的设计同步方法论有独立价值
- 统一持久化目录方案待规划阶段确定具体根目录名称和子目录结构
- 所有技能核心逻辑完整保留：重构仅涉及语言内容裁剪、路径迁移和注册表同步，不触及任何技能的流程、策略或输出规范

## 依赖 / 假设

- 假设 ae:dhh-rails-style skill 可能同时存在于 `skills/` 和运行时注入目录中
- 假设 agent 文件变更后需要重新构建才能生效
- 统一持久化目录后，旧目录（`docs/brainstorms/`、`docs/plans/`、`.context/ae/`、`docs/ideation/`）中的已有产物迁移策略在规划阶段确定

## 待定问题

### 规划前需解决

- ~~[影响 R17][用户决策] 统一持久化目录的根目录名称偏好~~ → **已决定：`docs/ae/`**

### 推迟到规划

- [影响 R16][技术] ae:dhh-rails-style 是否在运行时注入目录中有残留副本需要清理
- [影响 R1-R3][需要研究] 移除 skill/agent 后，是否有其他 skill 或代码硬引用了被移除项的名称
- [影响 R17-R19][技术] 统一目录迁移对已有测试文件（recovery-service.test.ts、ae-recovery.tool.test.ts）的影响范围
- [影响 R17-R19][技术] ae:ideate 的 `<OS-temp>` 检查点文件是否也应纳入统一目录

## 下一步

-> `/ae-plan` 进行结构化实施规划（需先解决「规划前需解决」中的阻塞问题）
