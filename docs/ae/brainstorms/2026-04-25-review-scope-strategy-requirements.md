---
date: 2026-04-25
topic: review-rewrite
---

# ae-review 技能结构性更新

## 问题框架

ae-review 存在四个结构性问题：

1. **只支持代码文件**：审查者全部面向源代码设计，配置文件、SQL、脚本、文档等非代码文件由通用代码审查者处理，缺少领域专业性。需要为不同文件类型定义专门的审查者组合
2. **平台耦合**：`resolve-base.sh` 硬编码 `gh` CLI 和 `github.com` URL，不支持 GitLab、Bitbucket、Gitea 等平台
3. **无状态**：每次审查重新检测基准分支，不规范 Git 操作下检测失败直接报错终止，无法追踪增量
4. **ae-document-review 路径受限**：仅支持 `docs/ae/brainstorms/` 和 `docs/ae/plans/` 下的文档审查，分类依赖路径而非内容，无法审查项目中任意位置的文档

解决方案：**结构性更新 ae-review 技能，基于文件类型路由表驱动审查者选择，为非代码文件类型引入领域专业审查者，支持任意文件类型的审查。**

## 需求

**审查状态文件**

- R1. 状态文件 `.opencode/review-state.json`（本地存储，不提交到仓库）。审查完成后写入当前分支名、HEAD commit hash 和时间戳：
  ```json
  { "branch": "<branch-name>", "lastReviewed": "<commit-hash>", "lastReviewTime": "<ISO-8601>" }
  ```
  读取时校验当前分支与 `branch` 字段是否匹配，不匹配则视为首次运行。将 `.opencode/review-state.json` 加入 `.gitignore`。

**范围检测流程**

- R2. 范围检测按以下优先级执行：
  1. `from:<ref>` 参数（`base:<ref>` 映射到 `from:` 保持兼容）→ 直接使用指定 ref 作为基准，跳过所有检测
  2. 状态文件存在且 `lastReviewed` 有效且当前分支匹配：
     - HEAD == lastReviewed 且无暂存/未暂存/未跟踪变更 → 审查最近 10 次提交
     - HEAD == lastReviewed 但有工作区变更 → 仅审查工作区变更
     - HEAD ≠ lastReviewed → `git diff lastReviewed..HEAD` + 工作区变更
  3. 状态文件不存在（首次运行）：
     - 项目配置 `review.defaultBase` 存在 → 用它做 merge-base
     - `resolve-base.sh` 自动检测（平台无关）→ 用检测结果
     - 都失败 → 友好降级（R13）

**范围参数**

- R2a. 支持外部传入范围参数，跳过自动检测：
  - `from:<ref>` — 从指定 commit hash 或分支名开始审查（`base:<ref>` 映射到 `from:` 保持兼容）。输入必须为合法 Git ref 格式（commit hash 或分支名），禁止包含 shell 元字符（`;|&$` 等）以防注入
  - `recent:<N>` — 审查最近 N 次提交
  - `full` — 审查所有 Git 跟踪文件（受全局排除约束）
  - `full:<path>` — 审查指定路径下的所有 Git 跟踪文件（受全局排除约束）

**resolve-base.sh 改造**

- R3. 脚本改造要求：
  - 移除所有 `gh` CLI 必需调用和 `github.com` 硬编码 URL
  - 保留纯 Git 操作：`origin/HEAD` 符号引用、常见分支名探测（main/master/develop）、`merge-base`、浅克隆 `--unshallow`
  - 新增：读取项目配置中的 `review.defaultBase`
  - 新增：平台 CLI（`gh`/`glab`/`bitbucket`）作为可选增强，不可用时不影响核心流程
  - 新增：检测失败时不报错终止，而是返回结构化信息供 SKILL.md 层做友好降级提示

**文件类型路由表**

- R4. 审查范围确定后，每个变更文件按扩展名/文件名匹配路由，确定基础审查者和条件审查者：
  - **第一步**：文件格式 → 匹配路由组 → 确定基础审查者（确定性的、基于规则）
  - **第二步**：分析文件内容特征（大小、主题、深度）→ 代理判断激活条件审查者
  - 多个文件属于不同路由时，合并所有活跃审查者，去重后统一派发

- R5. 全局排除：以下文件不进入审查
  - 图片：.png .jpg .gif .svg .ico .webp .bmp
  - 字体：.woff .woff2 .ttf .eot .otf
  - 媒体：.mp3 .mp4 .wav .avi .mov .webm
  - 压缩包：.zip .tar .gz .rar .7z
  - 数据：.csv .xlsx .xls .pdf .doc .docx
  - 锁文件：package-lock.json yarn.lock pnpm-lock.yaml
  - 密钥：.env .env.*（保留 .env.example .env.template）——排除文件的内容在审查全流程（范围检测、内容分析、审查者执行）中不可被读取或引用；SKILL.md 在阶段 2（文件收集）阶段即从文件列表中移除这些文件，确保后续阶段无法访问
  - 受保护产物：docs/ae/review/* docs/ae/solutions/* docs/ae/brainstorms/* docs/ae/plans/*

- R6. 全局审查者（跨所有路由激活）：learnings-researcher、agent-native-reviewer

- R7. 文件类型路由定义。每条路由可指定领域专用的代理（agent），该代理仅在该路由激活时参与审查，提供领域专业判断：

**源代码路由**（.ts .tsx .js .jsx .mjs .cjs .py .java .go .rs .c .cpp .h .rb .php .swift .kt .scala）
基础：correctness, testing, maintainability, project-standards
条件：security（认证/权限/用户输入）、performance（数据库查询/数据转换/缓存）、api-contract（路由/类型签名/版本）、reliability（错误处理/重试/超时）、adversarial（>=50 行可执行代码或高风险）、cli-readiness（CLI 命令定义）、previous-comments（仅 PR 模式）、kieran-typescript（.ts/.tsx 文件）

**配置路由**（.json .yaml .yml .toml .xml）
基础：correctness, maintainability, project-standards
条件：security（密钥/权限配置）
领域代理：`config-reviewer` — 校验 JSON/YAML/TOML/XML 的语法正确性、schema 一致性、必填字段完整性、敏感值检测（硬编码密码/token）

**基础设施路由**（Dockerfile docker-compose.* *.tf *.tfvars .github/workflows/* Makefile Jenkinsfile）
基础：correctness, maintainability, project-standards
条件：security（容器安全/CI 权限）、reliability（错误处理/健康检查）
领域代理：`infra-reviewer` — 校验 Dockerfile 最佳实践（镜像标签、非 root 用户、多阶段构建）、CI 工作流完整性（缓存策略、失败处理）、Terraform 资源依赖和状态管理

**数据库路由**（*.sql .prisma 迁移文件）
基础：correctness, maintainability, project-standards
条件：data-migrations（schema 变更/迁移安全）、security（SQL 注入）
领域代理：`database-reviewer` — 校验迁移的可逆性（回滚脚本）、数据完整性约束、索引策略、Prisma schema 关系正确性

**API 契约路由**（.graphql .proto .openapi.* swagger.*）
基础：correctness, maintainability, project-standards
条件：api-contract（类型签名/版本/破坏性变更）

**样式/UI 路由**（.css .scss .less .html .vue .svelte）
基础：correctness, maintainability
条件：security（XSS/模板注入）

**脚本路由**（.sh .bash .ps1 .bat .cmd）
基础：correctness, maintainability, project-standards
条件：security（注入/权限）、reliability（错误处理/退出码）
领域代理：`script-reviewer` — 校验 shell 脚本可移植性（bash vs sh）、幂等性、平台兼容性（Unix vs Windows）、环境变量依赖

**文档路由**（.md .rst .adoc .org .txt）
委派给 ae-document-review 技能处理。ae-review 按文件逐个（或按批次）调用 `Skill("ae:document-review", "mode:headless <文件路径>")`，由 ae-document-review 负责选择审查者、派发子代理、综合发现。ae-review 将 ae-document-review 的返回结果合并到统一报告中。

**兜底路由**（不匹配任何路由）
基础：correctness, maintainability, project-standards
条件：无

**全量审查**

- R8. `full` 参数触发全量审查：审查所有 Git 跟踪文件（受全局排除规则和路由表约束），审查者收到完整文件内容而非 diff
- R9. `full:<path>` 参数触发路径限定全量审查：审查指定路径下的 Git 跟踪文件

**SKILL.md 结构性更新**

- R10. 结构性更新 SKILL.md：保留阶段化骨架，移除 GitHub 特定路径，新增路由表驱动和范围检测
- R11. 移除所有 GitHub 特定路径：PR URL/PR 编号参数解析、`gh pr checkout`、PR 元数据获取、fork 安全局远程解析
- R12. 新增检测成功后的透明确认：展示基准、变更文件数、变更量，让用户确认或修正
- R13. 新增检测失败时的友好降级：提供选项（审查最近 N 次提交 / 仅审查工作区 / 手动指定 / 查看提交历史）

**references 文件更新**

- R14. `persona-catalog.md`：按路由分组重新组织审查者目录（不含文档审查者），新增 4 个领域专用审查者定义
- R15. `subagent-template.md`：适配全量审查模式（完整文件内容 vs diff 两种输入）
- R16. `findings-schema.json`：保持纯代码审查 schema（file:line 定位），文档发现使用 ae-document-review 独立 schema
- R17. `review-output-template.md`：适配新的路由分组展示，文档发现使用独立展示格式

**ae-document-review 通用化**

- R18. 支持审查任意路径的文档：优先搜索 `docs/ae/brainstorms/` 和 `docs/ae/plans/`，但也接受任何传入的文件路径
- R19. 文档分类改为基于内容特征而非文件路径：通过分析文档内容（frontmatter、标题结构、关键词）判断是 requirements/plan/general 类型，路径仅作辅助信号
- R20. 支持被其他技能调用时的批量场景：当被 ae-review 调用时，每个文档独立审查，返回结构化发现供调用方合并

## 范围边界

- 不修改审查者人设 .md 文件本身
- 不改变 4 种审查模式（interactive、autofix、report-only、headless）
- 不改变严重级别（P0-P3）和动作路由（safe_auto/gated_auto/manual/advisory）
- 不改变子代理派发和发现合并的核心逻辑
- 状态文件不提交到仓库
- 路由表可扩展，本轮为配置/基础设施/数据库/脚本路由新增 4 个领域专用审查者（config-reviewer、infra-reviewer、database-reviewer、script-reviewer）
- 允许结构性更新：SKILL.md 结构性更新，`base:` 映射到 `from:` 保持兼容

## 待定问题

- `review.defaultBase` 配置放在 `opencode.json` 还是 AGENTS.md
- 无扩展名文件（如 Makefile）的路由匹配规则是否需要正则/glob 支持
- ae-review 调用 ae-document-review 的批次粒度（逐文件 vs 按目录分组）
- `recent:<N>` 的默认 N 值（当前设计为 10）是否需要项目配置覆盖

## 下一步

-> /ae-plan
