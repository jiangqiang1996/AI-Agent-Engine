# AE 用户手册

本手册说明 AI Agent Engine（AE）的常用流程、命令参数、代理分工、工具边界和产物路径。当前运行时实际可用能力以 `/ae-help` 为准。

## 先选入口

| 目标 | 用这个 |
| --- | --- |
| 想多角度发散讨论一个主题 | `/ae-brainstorm` |
| 产出需求文档 | `/ae-prd` |
| 产出设计文档（架构、接口、数据模型、实现单元） | `/ae-design` |
| 深度追问方案决策 | `/ae-grill` |
| 已有设计，需要执行 | `/ae-work` |
| Worktree 继续执行 | `/ae-work-continue` |
| 合并分支或 worktree | `/ae-merge-branch` |
| 生成工作总结 | `/ae-work-report` |
| 查看本人代码变更 | `/ae-my-code-changes` |
| 探索性修复（循环验证） | `/ae-task-loop` |
| 智能提交变更 | `/ae-commit` |
| 清理分支/worktree | `/ae-remove-local-branch-worktree` |
| 只看风险，不改文件 | `/ae-review mode:report-only` |
| 快速审查并自动修复 | `/ae-review-auto` |
| 代码审查（CLI 模式） | `/ae-ocr` |
| 前端修复（视觉/交互/状态管理/接口/无障碍） | `/ae-fix frontend` |
| 后端修复（错误分析/根因定位/修复实现/回归验证） | `/ae-fix backend` |
| 浏览器操作 | `/ae-playwright` |
| 浏览器 E2E 测试与验收 | `/ae-test e2e` |
| 后端单元测试 | `/ae-test unit` |
| 接口测试 | `/ae-test api` |
| 数据库查询或操作 | `/ae-sql` |
| 图片转 Markdown 描述 | `/ae-image` |
| 音频转 Markdown 描述 | `/ae-audio` |
| 视频转 Markdown 描述 | `/ae-video` |
| 创建或编辑 DOCX | `/ae-docx` |
| 创建或编辑 PDF | `/ae-pdf` |
| 创建或编辑 PPTX | `/ae-pptx` |
| 创建或编辑 XLSX | `/ae-xlsx` |
| Office 文档原生操作 | `/ae-officecli` |
| 幻灯片大纲生成 | `/ae-slides-outline` |
| 原型预览 | `/ae-prototype-preview` |
| 项目结构探索 | `/ae-project-explore` |
| 保存经验 | `/ae-save-experience` |
| 提示词优化 | `/ae-prompt-optimize` |
| 交接到新会话 | `/ae-handoff` |
| 创建或更新技能 | `/ae-skill-creator` |
| 创建或更新代理 | `/ae-agent-creator` |
| 安装或更新插件 | `/ae-install` |
| 卸载插件 | `/ae-uninstall` |
| 查看完整帮助 | `/ae-help` |

## 使用场景速查

按开发场景分类，快速找到对应的技能、命令和代理。

### 需求与设计

从想法到可执行设计的完整链路。

| 场景 | 命令/技能 | 代理 | 说明 |
| --- | --- | --- | --- |
| 多角度发散讨论 | `/ae-brainstorm` | — | 不产出文档，讨论结果转 `/ae-prd` 沉淀 |
| 产出需求文档 | `/ae-prd` | — | 澄清目标、边界、约束和成功标准；修改已有需求时传入需求文档路径 |
| 深度追问方案决策 | `/ae-grill` | — | 适用于模糊需求逐层澄清 |
| 产出设计文档 | `/ae-design` | `@architecture-designer` `@api-designer` `@database-designer` `@ui-designer` `@security-designer` `@observability-designer` `@non-functional-designer` `@test-cases-designer` | 含架构、接口、数据模型、测试用例与验收标准；修改已有设计时传入设计路径 |
| 原型预览 | `/ae-prototype-preview` | — | 将原型文档转为 HTML 静态文件验证效果 |
| 项目结构探索 | `/ae-project-explore` | `@repo-research-analyst` | 分析任意文件集合的结构与关系 |

### 前端开发

| 场景 | 命令/技能 | 代理 | 说明 |
| --- | --- | --- | --- |
| 有设计稿实现页面 | `/ae-work` | `@frontend-dev` | 视觉实现 + 交互逻辑/状态管理/API 联调 |
| 无设计稿提升视觉 | `/ae-work` | `@frontend-dev` | 自由设计模式，按决策包实现 |
| 前端修复（视觉/交互/接口） | `/ae-fix frontend` | `@frontend-fix` | 以 DOM 结构化数据诊断为主，截图为辅；具备上下文检测→诊断→修复→验证闭环；修复遵循项目开发规范 |
| 浏览器操作 | `/ae-playwright` | — | 所有浏览器操作一律通过本技能 |
| 原型转 HTML 预览 | `/ae-prototype-preview` | — | 技术栈无关，禁止打包构建工具 |
| UI/UX 设计 | — | `@ui-designer` | 统一 UI/UX 设计入口：设计决策包（spec）、ui-ux 契约（contract）、内联决策（inline） |
`/ae-work` 在执行前端任务时自动调度 `@frontend-dev`（视觉实现和逻辑实现），用户一般不需要手动指定代理。

### 后端开发

| 场景 | 命令/技能 | 代理 | 说明 |
| --- | --- | --- | --- |
| 实现后端功能 | `/ae-work` | `@backend-dev` | 处理 API、数据层、业务逻辑和中间件 |
| 后端修复 | `/ae-fix backend` | `@backend-fix` | 错误分析、根因定位、修复实现和回归验证，遵循项目架构规范 |
| 数据库查询或操作 | `/ae-sql` | — | 通过 JDBC 连接任意数据库执行 SQL |
| 接口设计维度 | — | `@api-designer` | 端点清单、TypeScript interface、错误码体系 |
| 数据库设计维度 | — | `@database-designer` | ER 模型、表结构、关系与外键、迁移策略 |
| 架构设计维度 | — | `@architecture-designer` | 模块边界、依赖方向、分层规则、数据流 |

### 测试

| 场景 | 命令/技能 | 代理 | 说明 |
| --- | --- | --- | --- |
| 后端单元测试 | `/ae-test unit` | `@unit-test-runner` | 生成、执行、覆盖率分析；路由 Vitest/JUnit/pytest/Go test/Rust test |
| 接口测试 | `/ae-test api` | — | 业务流程编排为主、接口边界测试为辅；支持登录认证 |
| 浏览器 E2E 测试 | `/ae-test e2e` | `@e2e-test-runner` | 验收测试、测试生成、测试修复和回归；底层依赖 ae:playwright |
| 测试用例设计 | — | `@test-cases-designer` | 覆盖矩阵、P0-P3 用例、行为契约规格 |
| 测试失败诊断 | — | `@test-triage` | 分析失败根因并分派修复方向 |
| 统一测试入口 | `/ae-test [unit\|e2e\|api]` | — | 按参数或上下文自动推测路由到对应测试技能 |

单元测试有设计用例时从用例规格编译骨架，无则从代码结构推断测试点。接口测试有设计用例时从用例规格编译接口测试骨架，无则从接口文档生成。E2E 测试有设计用例时从用例规格编译 Playwright 骨架，无则从页面描述生成。

### 代码审查

| 场景 | 命令/技能 | 代理 | 说明 |
| --- | --- | --- | --- |
| 通用审查 | `/ae-review` | 13 个审查代理全并行 | 自动识别场景，支持代码/文档/设计/混合范围 |
| 只审查不修改 | `/ae-review mode:report-only` | 同上 | 只报告发现，不自动修复 |
| 快速审查并自动修复 | `/ae-review-auto` | 同上 | 审查与修复一体化 |
| CLI 代码审查 | `/ae-ocr` | `@ocr-reviewer` | 覆盖 bug/安全/性能/可维护性/测试覆盖/风格 |
| 文档审查 | `/ae-review domain:document` | `@document-reviewer` 等 | 不会把文档当代码 diff 处理 |
| 设计审查 | `/ae-review design:<path>` | `@design-integrity-reviewer` 等 | 审查设计文档各维度产物 |
| 目标对齐审查 | `/ae-review goals=<text>` | `@goal-alignment-reviewer` | 对照审查目标逐条校验是否达成 |

审查代理全并行调度只找问题不做修复，合并层负责去重、冲突解决、因果分析和修复方案生成。

### 文档生成

| 场景 | 命令/技能 | 说明 |
| --- | --- | --- |
| 创建或编辑 Word | `/ae-docx` | 段落、表格、修订追踪、页眉页脚、目录等 |
| 创建或编辑 PDF | `/ae-pdf` | 创建、合并、拆分、提取、表单、水印等；to-markdown 转 Markdown |
| 创建或编辑 PowerPoint | `/ae-pptx` | 幻灯片、形状、图表、动画、母版等 |
| 创建或编辑 Excel | `/ae-xlsx` | 公式计算、数据透视表、条件格式、图表等 |
| Office 原生操作 | `/ae-officecli` | L1 读取/L2 DOM 编辑/L3 raw XML |
| 幻灯片大纲生成 | `/ae-slides-outline` | 逐页内容大纲，支持对话反复修改 |

### 媒体识别

| 场景 | 命令/技能 | 说明 |
| --- | --- | --- |
| 图片转 Markdown | `/ae-image` | JPG/PNG/GIF/WebP/BMP |
| 音频转 Markdown | `/ae-audio` | MP3/WAV/OGG/FLAC/M4A/AAC |
| 视频转 Markdown | `/ae-video` | MP4/WebM/AVI/MOV/MKV/FLV |

模型不支持对应媒体输入时，系统自动降级为路径文本，LLM 按需调用对应技能识别内容。

### 通用任务与协作

| 场景 | 命令/技能 | 说明 |
| --- | --- | --- |
| 通用实施 | `/ae-work` | 执行设计或直接任务，产出代码、文档、测试等交付物 |
| 探索性修复 | `/ae-task-loop` | 循环执行和验证直到目标达成 |
| 会话交接 | `/ae-handoff` | 提取上下文创建独立新会话 |
| 工作总结 | `/ae-work-report` | 基于提交和未提交变更生成日报/周报 |
| 查看本人代码变更 | `/ae-my-code-changes` | 指定时间内本人提交的所有代码变更 |
| 分支或 worktree 合并 | `/ae-merge-branch` | 合并变更并用 AE 交接验证 |
| 智能提交 | `/ae-commit` | 遵循项目 Git 提交规范，只做本地提交 |
| 经验沉淀 | `/ae-save-experience` | 保存 solution，并按需提炼 rules |
| 提示词优化 | `/ae-prompt-optimize` | 优化后新开会话自动执行或暂停等待 |

### 维护与配置

| 场景 | 命令/技能 | 说明 |
| --- | --- | --- |
| 创建或更新技能 | `/ae-skill-creator` | 支持技能、命令或二者同时创建 |
| 创建或更新代理 | `/ae-agent-creator` | 默认项目级，支持全局级和同级命令 |
| 安装或更新插件 | `/ae-install` | 自动判断已装则更新、未装则安装 |
| 卸载插件 | `/ae-uninstall` | 自动检测安装范围供用户选择 |
| 查看帮助 | `/ae-help` | 权威只读入口，列出所有运行时能力 |

## 经典用法

### 手动阶段流

适合团队希望逐步确认需求、设计和实现的任务。

```text
/ae-brainstorm 设计一个多租户数据隔离方案
/ae-prd
/ae-design
/ae-review domain:document
/ae-work
/ae-review
```

`/ae-brainstorm` 仅做多视角发散讨论，不写文件；需要沉淀为正式需求文档时由 `/ae-prd` 承接。`/ae-design` 在需求之后产出设计文档，包含架构、接口、数据模型、测试用例和实现单元，供 `/ae-work` 直接执行。第一轮文档审查用于发现需求漏洞，第二轮代码审查用于检查实现风险。

### 只审查不修改

适合交付前风险扫描、PR 前自查或文档评审。

```text
/ae-review mode:report-only
/ae-review domain:document ae/designs/example.md
```

`mode:report-only` 只报告发现，不自动修复。`domain:document` 会走文档审查团队，不会把文档当代码 diff 处理。

### 前端与浏览器

```text
/ae-playwright
/ae-fix frontend 修复登录页间距和按钮对齐问题
/ae-test e2e 验收 http://localhost:3000/login
/ae-test e2e 为用户登录流程生成 E2E 测试
```

浏览器操作一律通过 `ae:playwright` 技能完成。`/ae-fix frontend` 是统一前端修复入口，以 DOM 结构化数据诊断为主（computed style、bounding box），覆盖视觉修复、交互修复、状态管理修复、接口联调修复和无障碍修复，具备上下文检测→诊断→修复→验证内部闭环。`/ae-test e2e` 是浏览器 E2E 测试入口，覆盖验收测试、测试场景设计（plan/generate）、测试修复（heal）和回归验证。`ae:work` 在执行前端创建/修改任务时自动调度 `@frontend-dev`（视觉实现和逻辑实现）。

### 接口测试

```text
/ae-test api ./openapi.json
```

以真实业务流程编排为主、接口边界测试为辅的自动化接口测试，支持登录认证与接口请求脚本生成。

### 图片转 Markdown

```text
/ae-image file=./photo.jpg
```

将图片内容转为 Markdown 描述。支持 JPG/PNG/GIF/WebP/BMP 格式。转换结果写入 `ae/markdown/` 子目录。

PDF 文件的 Markdown 读取功能通过 `ae:pdf` 技能的 `to-markdown` 操作；DOCX/PPTX/XLSX 通过 `ae:officecli` 的 `view mode=text` 提取纯文本。

### 探索性修复

```text
/ae-task-loop 修复所有 TypeScript 编译错误
```

适合"执行、观察、修复、再验证"的问题。需求定义不清、范围很大的产品功能，不适合直接丢给 task-loop。

## 技能命令

下表按使用顺序组织，而不是按字母排序。

| 命令 | 参数 | 用途 | 关键边界 |
| --- | --- | --- | --- |
| `/ae-brainstorm` | `[讨论主题]` | 使用多个子代理从不同视角进行多轮发散讨论并汇总 | 不产出持久文档；需求沉淀转 `/ae-prd` |
| `/ae-prd` | `[目标描述\|需求文档路径]` | 澄清目标、边界、约束、成功标准和待定问题，产出需求文档；传入已有路径时修改该需求 | 产物是需求文档 |
| `/ae-design` | `[需求文档路径\|旧 design\|裸描述] [dimensions=...] [refactor=true]` | 产出设计文档，含概览、架构、接口、数据模型、测试用例与实现单元；`refactor=true` 用于重构或技术债治理；传入已有设计路径时全量重新生成 | 供实施和审查对齐 |
| `/ae-grill` | `[需求文档路径\|设计文档路径\|方案描述]` | 深度追问方案决策，一问一答推进共识 | 适用于模糊需求逐层澄清 |
| `/ae-work` | `[设计路径\|交接文件路径\|工作描述]` | 按设计执行变更并验证 | 交付前检查验证、审查和 Git 授权证据 |
| `/ae-work-report` | `[日报\|周报\|时间段\|提交范围]` | 基于提交和未提交变更生成工作报告 | 不执行 Git 写操作 |
| `/ae-my-code-changes` | `since=<date> [until=<date>]` | 获取指定时间内本人提交的所有代码变更 | 只取最终状态，不输出中间过程 |
| `/ae-merge-branch` | `[来源分支名\|本地 worktree 路径]` | 合并来源分支或 worktree 变更 | 本地 Git 写操作需明确授权 |
| `/ae-review` | `[mode:*] [domain:code\|domain:document] [from:<ref>] [full] [full:<path>] [session] [design:<path>] [路径...]` | 审查代码、文档、设计、全量路径或会话变更 | 代码域和文档域分开处理 |
| `/ae-ocr` | `[review\|scan] [路径或 ref]` | 通过 ae-ocr 工具调用 OpenCodeReview CLI 执行 AI 代码审查 | 覆盖 bug/安全/性能/可维护性/测试覆盖/风格 |
| `/ae-playwright` | `[url] [action] [mode] [browser] [port] [task=任务描述]` | 浏览器能力中枢，操作浏览器执行任务 | 通过 ae:playwright 技能操作浏览器 |
| `/ae-prototype-preview` | `[prd目录路径\|原型文档路径] [--no-inspect\|--yes]` | 将 ae:prd 原型文档转换为多页面 HTML 静态文件 | 禁止使用打包构建工具，禁止镀金 |
| `/ae-fix frontend` | `[问题描述] [url]` | 统一前端修复：视觉修复、交互修复、状态管理修复、接口联调修复、无障碍修复 | 以 DOM 结构化数据诊断为主，截图为辅 |
| `/ae-fix backend` | `[问题描述\|错误信息]` | 后端修复：错误分析、根因定位、修复实现和回归验证 | |
| `/ae-test e2e` | `[url\|功能描述] [设计用例路径(可选)]` | 浏览器 E2E 测试：验收、测试生成、测试修复和回归 | 浏览器操作通过 ae:playwright 技能 |
| `/ae-test unit` | `[代码文件/目录] [设计用例路径(可选)]` | 后端单元测试：生成、执行、覆盖率分析 | |
| `/ae-test api` | `[接口文档\|业务流程描述] [设计用例路径(可选)]` | 接口级后端测试：业务流程编排为主、接口边界测试为辅 | |
| `/ae-handoff` | `—` | 提取上下文并创建独立新会话 | 用于交接 |
| `/ae-task-loop` | `[一句话目标描述]` | 循环执行和验证直到目标达成 | 不适合需求不清的大型功能 |
| `/ae-sql` | `[SQL 语句]` | 通过 JDBC 连接数据库并执行 SQL | 执行前应确认目标库和语句风险 |
| `/ae-image` | `file=图片路径 [format=jpg|png] [outputPath=路径]` | 将本地图片转换为 Markdown 描述 | 支持 JPG/PNG/GIF/WebP/BMP |
| `/ae-audio` | `file=音频路径 [format=mp3\|wav\|ogg\|flac\|m4a\|aac] [outputPath=路径]` | 将本地音频转换为 Markdown 描述 | 支持 MP3/WAV/OGG/FLAC/M4A/AAC |
| `/ae-video` | `file=视频路径 [format=mp4\|webm\|avi\|mov\|mkv\|flv] [outputPath=路径]` | 将本地视频转换为 Markdown 描述 | 支持 MP4/WebM/AVI/MOV/MKV/FLV |
| `/ae-docx` | `[创建\|编辑\|分析\|读取\|追加\|格式转换] [文件路径] [任务描述]` | 创建、编辑、分析 Word 文档 | 底层通过 ae-officecli 工具执行 |
| `/ae-pdf` | `[创建\|合并\|拆分\|提取\|表单\|旋转\|删除\|水印\|追加\|更新] [文件路径] [任务描述]` | 处理 PDF 文档：创建、合并、拆分、提取、表单等 | to-markdown 可将 PDF 转为 Markdown |
| `/ae-pptx` | `[创建\|编辑\|分析\|读取\|追加\|更新\|预览] [文件路径] [任务描述]` | 创建、编辑、分析 PowerPoint 演示文稿 | 底层通过 ae-officecli 工具执行 |
| `/ae-xlsx` | `[创建\|编辑\|分析\|读取\|追加\|公式\|透视表] [文件路径] [任务描述]` | 创建、编辑、分析 Excel 电子表格 | 底层通过 ae-officecli 工具执行 |
| `/ae-officecli` | `[文件路径] [command=...] [path=...] [props=...]` | 通过 OfficeCLI 原生二进制操作 Office 文档 | 支持 L1 读取/L2 DOM 编辑/L3 raw XML |
| `/ae-slides-outline` | `[主题\|需求描述\|大纲文件路径\|现有 HTML 幻灯片文件路径]` | 幻灯片大纲生成与交互修改 | 支持对话反复修改直到用户确认 |
| `/ae-project-explore` | `[target] [focus=structure\|content\|relations\|patterns\|all] [depth=quick\|standard\|deep]` | 探索和分析任意文件集合的结构与关系 | 输出带置信度标注的结构化画像 |
| `/ae-save-experience` | `[经验摘要\|保存目标]` | 保存 solution，并按需提炼 rules | 不把临时结论直接当长期规则 |
| `/ae-prompt-optimize` | `[提示词内容] [mode=auto\|pause]` | 优化提示词并通过 ae-create-session 新开会话自动执行或暂停等待；mode=auto/pause 跳过确认提问 | 禁止与原始逻辑违背 |
| `/ae-agent-creator` | `[代理用途\|代理名称] [--global] [--command]` | 创建或更新 OpenCode 原生代理 | 默认项目级；全局级需显式指定 |
| `/ae-skill-creator` | `<技能名或需求描述> [--global] [--no-command\|--command-only] [--from-session]` | 创建或更新 OpenCode 原生技能和命令 | 支持技能、命令或二者同时创建；`--from-session` 从当前会话沉淀技能 |
| `/ae-help` | `[技能名或关键词]` | 查看运行时能力清单 | 权威只读入口 |
| `/ae-install` | `[global\|project]` | 安装或更新 AE 插件 | 自动判断已装则更新、未装则安装 |
| `/ae-uninstall` | `[global\|project]` | 卸载 AE 插件 | 删除桥接文件和仓库目录 |

## 非技能基础命令

| 命令                                 | 用途 | 边界 |
|------------------------------------| --- | --- |
| `/ae-work-continue`                | 在 B worktree 查找交接文件并继续执行 `ae:work` | 仅用于 A→B worktree 转移后的目标工作空间；多个交接文件时先让用户选择 |
| `/ae-commit`                       | 智能提交当前变更 | 只做本地提交；不等同于 push、PR、跳过 hooks 或改 Git 配置 |
| `/ae-remove-local-branch-worktree` | 安全清理本地分支、worktree 和对应本地目录 | 删除分支、worktree 或目录前必须确认目标和风险 |
| `/ae-review-auto`                  | 快速审查并自动修复 | 审查与修复一体化 |

## 审查代理

一般用户优先用 `/ae-review`，让 AE 自动选择代理。需要手动指定时，可在会话中使用 `@<代理名>`。

AE 采用 13 代理全并行架构，所有激活代理在同一轮一次性发出 Task 调用，只找问题不做修复；合并层负责去重、冲突解决、因果分析和修复方案生成。

| 代理 | 关注点 |
| --- | --- |
| `@ocr-reviewer` | 代码审查主引擎：bug、安全、性能、可维护性、测试覆盖、代码风格 |
| `@document-reviewer` | 文档审查主引擎：内部一致性、可行性、产品视角、步骤粒度、需求质量和证据核验 |
| `@architecture-design-reviewer` | 架构视角分析代码变更，检查架构边界、跨模块依赖和系统级抽象 |
| `@api-design-reviewer` | 审查接口契约破坏性变更和兼容性 |
| `@database-design-reviewer` | 审查数据迁移方案与执行细节（含数据库审查） |
| `@ui-ux-design-reviewer` | 审查 UI/UX 设计维度的交互流程完整性、状态覆盖、与需求的一致性以及原型完整性 |
| `@test-cases-design-reviewer` | 审查测试用例维度的结构完整性、覆盖完备性、步骤可执行性、结果可验证性和需求对齐程度 |
| `@security-design-reviewer` | 文档域安全审查：评估设计文档中的安全缺口、认证授权假设、数据暴露和威胁模型 |
| `@observability-design-reviewer` | 审查可观测性维度产物：日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义 |
| `@non-functional-design-reviewer` | 审查非功能维度产物：性能目标、并发模型、事务边界、缓存策略和容量规划 |
| `@design-integrity-reviewer` | 审查设计文档与需求的一致性、设计维度完整性、架构与数据模型可行性和安全设计覆盖 |
| `@traceability-reviewer` | 审查需求-设计-原型-实现-测试链路追溯，识别断裂引用、孤儿条目和未声明延期 |
| `@goal-alignment-reviewer` | 对照审查目标逐条校验变更是否达成，识别未达成项和偏离 |

## 研究与流程代理

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@repo-research-analyst` | 研究仓库结构、文档、约定和实现模式 | 只做仓库研究，不替代实现 |
| `@web-researcher` | 做外部网络研究、竞品扫描和跨领域类比 | 用于外部上下文，不读取本地私有代码 |
| `@spec-flow-analyzer` | 分析规格、设计或功能描述中的用户流程缺口 | 不直接写代码 |
| `@frontend-dev` | 前端开发：视觉实现（自由设计/设计稿还原）+ 交互逻辑、API联调、状态管理、组件开发、重构、性能优化、可访问性 | 浏览器操作通过 ae:playwright 技能；不负责设计决策推断或修复 |
| `@frontend-fix` | 统一前端修复：视觉修复、交互修复、状态管理修复、接口联调修复、无障碍修复 | 以 DOM 结构化数据诊断为主，截图为辅；具备上下文检测→诊断→修复→验证闭环；修复遵循项目开发规范 |
| `@e2e-test-runner` | 浏览器 E2E 测试：验收测试、测试场景设计、Playwright 测试生成和回归验证 | 可修改测试文件，不修改产品代码 |
| `@unit-test-runner` | 单元测试执行：生成、执行并分析覆盖率 | 支持 Vitest/JUnit/pytest/Go test/Rust test |
| `@test-triage` | 测试失败诊断：分析失败根因并分派修复方向 | 不直接修复代码 |

## 设计维度代理

设计维度代理由 `ae:design` 编排层自动调度，用户一般不需要手动指定。

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@ui-designer` | 统一 UI/UX 设计入口：支持 spec/contract/full/inline 四种模式，产出设计决策包和 ui-ux 设计契约 | 不写实现代码、不操作浏览器 |
| `@architecture-designer` | 架构设计维度：模块边界、依赖方向、分层规则、数据流、错误传播链 | — |
| `@api-designer` | 接口设计维度：端点清单、TypeScript interface、认证授权、错误码体系 | — |
| `@database-designer` | 数据库设计维度：ER 模型、表结构、关系与外键、迁移策略 | — |
| `@test-cases-designer` | 测试用例设计维度：覆盖矩阵、P0-P3 用例、行为契约规格 | — |
| `@security-designer` | 安全设计维度：威胁模型、信任边界、认证授权流程、数据分级 | — |
| `@observability-designer` | 可观测性设计维度：日志规范、指标体系、告警规则、健康检查 | — |
| `@non-functional-designer` | 非功能设计维度：性能目标、并发模型、事务边界、缓存策略 | — |

## 开发专精代理

开发专精代理由 `ae:work` 编排层自动调度，用户一般不需要手动指定。

| 代理 | 用途 | 边界 |
| --- | --- | --- |
| `@frontend-dev` | 前端开发：视觉实现（设计还原/自由设计）、交互逻辑、API联调、状态管理、组件开发、重构、性能优化、可访问性 | 由 ae:work 编排层调度 |
| `@backend-dev` | 后端开发专精代理：处理 API、数据层、业务逻辑和中间件 | 由 ae:work 编排层调度 |
| `@backend-fix` | 后端修复专精代理：处理错误分析、根因定位、修复实现和回归验证，遵循项目架构规范 | 由 ae:work 编排层调度 |

## 工具层能力

工具通常由技能或代理调用，用户一般不用直接调用。

| 工具 | 作用                                    | 不做什么 |
| --- |---------------------------------------| --- |
| `ae-help` | 生成当/前运行时帮助                            | 不修改配置 |
| `ae-handoff` | 创建独立新会话并注入上下文                         | 不做提示词优化 |
| `ae-image` | 将本地图片转换为 Markdown 描述                  | 不支持远程 URL，不处理音频/视频 |
| `ae-audio` | 将本地音频转换为 Markdown 描述                  | 不支持远程 URL，不处理图片/视频 |
| `ae-video` | 将本地视频转换为 Markdown 描述                  | 不支持远程 URL，不处理图片/音频 |
| `ae-worktree-handoff` | 生成 A→B worktree 转移交接文件                | 不创建新会话 |
| `ae-create-session` | 创建独立新会话，可选注入上下文或自动执行                  | 不做会话级上下文交接 |
| `ae-domain-catalog` | 查询开发专精代理目录，获取专精代理信息                   | 不执行代理调度 |
| `ae-work-specialist-select` | 为 ae:work 预计算开发专精代理列表、协调策略和 prompt 模板 | 不执行代理调度 |
| `ae-specialist-aggregate` | 将专精代理结果按策略聚合为 DomainExecutionResult   | 单一代理执行无需聚合 |
| `ae-review-scope-analyze` | 分析审查范围并选择审查代理，返回代理列表和审查上下文           | 不执行代理调度 |
| `ae-review-proof` | 写入 ae:review 结构化审查证明                  | 不替代真实代码或文档审查 |
| `ae-timer` | 倒计时等待工具，暂停会话指定时长后继续                   | 不用于轮询或精确毫秒级定时 |
| `ae-async-bash` | 在后台启动长期运行的命令并立即返回                     | 不等待命令完成，不获取退出码 |
| `ae-pdf` | 创建、合并、拆分、提取文本、填写表单、旋转、删除页面、添加水印等     | 不支持加密 PDF |
| `ae-brainstorm` | 多视角头脑风暴，多模型并行讨论并汇总                    | 不产出持久产物 |
| `ae-officecli` | 通过 OfficeCLI 操作 Office 文档             | 仅处理 .docx/.xlsx/.pptx |
| `ae-ocr` | 通过 OpenCodeReview CLI 执行 AI 代码审查     | 审查只找问题，不做修复 |
| `ae-test-triage` | 诊断测试失败根因并分派修复方向 | 不直接修复代码 |

## 前端能力怎么选

| 场景 | 顺序 |
| --- | --- |
| 有设计稿但没有页面 | `/ae-work` 调度 `@frontend-dev` |
| 已有页面，需要贴合 Figma | `/ae-work` 调度 `@frontend-dev` → `/ae-test e2e` 验收 |
| 没有设计稿，但要提升视觉质量 | `/ae-work` 调度 `@frontend-dev` → `/ae-test e2e` 验收 |
| 修复视觉/交互/接口问题 | `/ae-fix frontend` |
| 只验证功能流程 | `/ae-test e2e` |
| 生成或修复 E2E 测试 | `/ae-test e2e` 生成测试/修复测试 |

浏览器相关路径都通过 `ae:playwright` 技能操作浏览器。

## 测试能力怎么选

| 场景 | 命令 | 代理 | 说明 |
| --- | --- | --- | --- |
| 后端单元测试 | `/ae-test unit` | `@unit-test-runner` | 有设计用例从用例编译骨架，无则从代码结构推断 |
| 接口测试 | `/ae-test api` | — | 有设计用例从用例编译骨架，无则从接口文档生成 |
| 浏览器 E2E 测试 | `/ae-test e2e` | `@e2e-test-runner` | 有设计用例从用例编译 Playwright 骨架，无则从页面描述生成 |
| 测试失败根因诊断 | — | `@test-triage` | 按 5 条优先级短路规则分类根因并分派修复方向 |
| 测试用例设计 | — | `@test-cases-designer` | 产出覆盖矩阵、P0-P3 用例、行为契约规格 |

`/ae-test` 是统一测试入口，显式传 `unit`/`e2e`/`api` 时直接路由；未传时按目标描述关键词、变更文件类型、已有测试资产和设计用例路径自动推测。

## 产物路径

| 路径 | 作用 |
| --- | --- |
| `ae/prds/` | 需求文档 |
| `ae/designs/` | 设计文档 |
| `ae/solutions/` | 历史方案、研究和经验沉淀 |
| `ae/reviews/` | 审查证明 |
| `ae/markdown/` | 文件转 Markdown 产物 |
| `.opencode/rules/` | 项目长期规则，可由经验沉淀流程写入 |
| `.opencode/ae.jsonc` | 项目级 AE 配置 |

这些是 AE 工作流产物和可选配置入口，不代表业务项目必须采用本源码仓库结构。

## 配置速记

AE 默认提供 `context7` 和 `gh_grep` 两个远程 MCP。项目级 `.opencode/ae.jsonc` 和全局 `~/.config/opencode/ae.jsonc` 可覆盖允许字段。

模型场景配置示例：

```jsonc
{
  "$schema": "https://raw.giteeusercontent.com/jiangqiang1996/ai-agent-engine/raw/master/src/assets/config/ae.schema.json",
  "modelScenarios": {
    "quick": "provider/fast-model",
    "standard": "provider/default-model",
    "deep": "provider/strong-model",
    "vision": "provider/vision-model",
    "audio": "provider/audio-model",
    "video": "provider/video-model"
  }
}
```

`quick` 适合帮助和快速查询，`standard` 适合常规任务，`deep` 适合计划、工作和审查，`vision` 适合浏览器截图和前端视觉任务，`audio` 适合音频任务，`video` 适合视频任务。完整合并规则见 [builtin-config.md](builtin-config.md)。

## 安全边界

| 边界 | 说明 |
| --- | --- |
| Git 写操作 | 提交、拉取、重置、清理、变基、推送都需要明确授权；`/ae-commit` 只代表本地提交 |
| 远程协作 | 用户侧流程不提供 push、创建 PR、创建 Issue 或 Release 的远程写流程 |
| 浏览器操作 | 浏览器操作一律通过 `ae:playwright` 技能完成 |
| 插件维护 | `/ae-install`、`/ae-uninstall` 面向 AE 插件安装或源码维护，不是普通业务项目更新流程 |

## 查看最新帮助

```text
/ae-help
/ae-help review
/ae-help frontend
```
