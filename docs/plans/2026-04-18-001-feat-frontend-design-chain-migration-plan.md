# 前端设计技能链迁移计划

> 由 `/ae-plan` 生成，日期：2026-04-18
> 源文档：`docs/brainstorms/2026-04-18-frontend-design-chain-migration-requirements.md`

## Overview

将 CE 前端设计引用链中 3 个可迁移节点（design-iterator 代理、ae:setup 技能、ae:test-browser 技能）迁移到 AE 项目，注册到构建系统，并更新 ae:frontend-design 的引用使其形成完整闭环。

## Out of Scope

以下内容明确不在本轮范围内，为二期或按需迁移：
- Figma MCP 相关代理（design-implementation-reviewer、figma-design-sync）
- todo-create / todo-triage / todo-resolve 工作项管理体系
- gh CLI 集成
- CE 配置体系（config-template.yaml、compound-engineering.local.md）
- demo/reel 工具链（vhs、silicon、ffmpeg）
- ce-update / CE 版本管理机制
- swiss-design 等不存在的技能

## 约定

- 面向用户的提示文本使用命令语法（`/ae-setup`），技术文档和 catalog 使用技能名（`ae:setup`）
- 跨平台检测命令统一为 `command -v agent-browser 2>/dev/null || where agent-browser 2>NUL`
- 代理调用语法为 `@ae/design-iterator`（opencode 子代理解析 `agents/<stage>/<name>.md` 时使用组前缀）

## Problem Frame

ae:frontend-design 已迁移但引用链断裂：视觉验证环节指向不存在的代理、agent-browser 安装无引导、浏览器测试无技能支撑。需要补齐这 3 个节点并接入 AE 构建同步。

## Requirements Trace

| REQ | 标题 | 依赖 |
|-----|------|------|
| REQ-0 | 注册已有资产到 ae-catalog.ts | 无（前置） |
| REQ-1 | 迁移 design-iterator 代理 | REQ-0 |
| REQ-2 | 创建 ae:setup 技能 | REQ-0 |
| REQ-3 | 迁移 test-browser 技能 | REQ-0 |
| REQ-4 | 更新 ae:frontend-design 引用 | REQ-1 + REQ-2 + REQ-3 |

---

## Unit 0: 注册资产到 ae-catalog.ts（含预注册）

**Goal**: 将已创建的 `ae:frontend-design` 技能/命令注册到 catalog（skillFile 指向已存在的文件）。同时为 `ae:setup` 和 `ae:test-browser` 预注册 schema 枚举值和 catalog 条目（skillFile 暂留空字符串，与 `ae:save-rules` 同模式），待 Unit 2/3 创建文件后回填。

**Dependencies**: 无

**Files**:

- [ ] `src/schemas/ae-asset-schema.ts` — 在 `AeSkillNameSchema` 枚举中添加 `'ae:frontend-design'`、`'ae:setup'`、`'ae:test-browser'`；在 `AeCommandNameSchema` 枚举中添加 `'ae-frontend-design'`、`'ae-setup'`、`'ae-test-browser'`
- [ ] `src/services/ae-catalog.ts` — 在 `PHASE_ONE_ENTRIES` 末尾追加 3 个条目：
  - `ae:frontend-design` / `ae-frontend-design`（skillFile: `skills/ae-frontend-design/SKILL.md`，**源文件已存在**）
  - `ae:setup` / `ae-setup`（skillFile: `''`，空字符串，Unit 2 创建后回填）
  - `ae:test-browser` / `ae-test-browser`（skillFile: `''`，空字符串，Unit 3 创建后回填）
- [ ] `src/services/ae-catalog.test.ts` — 更新 `toHaveLength(8)` → `toHaveLength(11)`
- [ ] `src/services/argument-contract.test.ts` — 更新 `toHaveLength(8)` → `toHaveLength(11)`
- [ ] `src/services/command-registration.test.ts` — 更新 `toHaveLength(8)` → `toHaveLength(11)`
- [ ] `tests/integration/runtime-entry-validation.test.ts` — 更新 `toBe(8)` → `toBe(11)`
- [ ] `tests/integration/skill-command-parity.test.ts` — 确认 `skillFile` 为空字符串时跳过存在性检查（已有 `if (entry.skillFile)` 守卫，`ae:setup` 和 `ae:test-browser` 的空 skillFile 会被跳过）

**Approach**:

1. 在 schema 的两个枚举中各加 3 个值
2. 在 catalog 的 `PHASE_ONE_ENTRIES` 数组追加 3 个条目：`ae:frontend-design` 的 skillFile 指向已存在文件；`ae:setup` 和 `ae:test-browser` 的 skillFile 设为空字符串（与 `ae:save-rules` 条目同模式）
3. 全量搜索 `toHaveLength(8)` 和 `toBe(8)` 相关断言（共 4 处），全部更新为 11
4. 运行 `npm run build && npm run test` 验证

**Test scenarios**:

- `npm run test` 全部通过（空 skillFile 条目被 `skill-command-parity.test.ts` 的守卫跳过）
- 新条目被 `getPhaseOneEntries()` 返回
- `getDefaultEntry()` 仍返回 `ae:lfg`

**Verification**:

- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过
- [ ] `.opencode/commands/` 目录下出现 `ae-frontend-design.md`（构建同步产物，源文件已存在）

---

## Unit 1: 迁移 design-iterator 代理

**Goal**: 将 CE 的 `design-iterator` 代理翻译为中文并创建源文件。代理已在 `GILDED_AGENTS` 中预注册，创建文件即自动纳入构建同步。

**Dependencies**: Unit 0

**Files**:

- [ ] `agents/workflow/design-iterator.md` — 新建，中文翻译 + 平台适配

**Source**: `E:\Documents\IdeaProjects\compound-engineering-plugin\plugins\compound-engineering\agents\design\design-iterator.md`

**Approach**:

1. 读取 CE 源文件
2. 翻译全部正文为中文
3. 保留 YAML frontmatter，`name` 保持 `design-iterator`，`description` 翻译为中文
4. 移除 `swiss-design` 引用（第 161 行附近，改为仅提及 `ae:frontend-design`）
5. 删除 `<frontend_aesthetics>` 块（第 188-197 行），因已由 `ae:frontend-design` 技能覆盖
6. agent-browser 调用语法保持原样
7. 在"开始迭代循环"部分增加前置检查步骤：执行 `command -v agent-browser 2>/dev/null || where agent-browser 2>NUL`，不可用时返回提示"agent-browser 未安装。请先运行 /ae-setup 安装。"
8. 竞品参考列表（Stripe/Linear/Vercel 等）保留不翻译（品牌名）
9. 写入 `agents/workflow/design-iterator.md`

**Test scenarios**:

- 文件存在于 `agents/workflow/design-iterator.md`
- YAML frontmatter 包含 `name: design-iterator` 和中文 `description`
- 内容不含 `swiss-design`
- 内容不含 `<frontend_aesthetics>`
- 内容包含 agent-browser 前置检查步骤
- `npm run build` 后 `.opencode/agents/ae/workflow/design-iterator.md` 存在

**Verification**:

- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过（含 `tests/integration/agent-sync.test.ts`）
- [ ] 代理文件出现在 `.opencode/agents/ae/workflow/design-iterator.md`

---

## Unit 2: 创建 ae:setup 技能

**Goal**: 创建 AE 的环境安装技能，检查并引导安装 agent-browser。

**Dependencies**: Unit 0

**Files**:

- [ ] `skills/ae-setup/SKILL.md` — 新建，中文，包含内联检查/安装逻辑
- [ ] `commands/ae-setup.md` — 新建，标准委托格式
- [ ] `src/services/ae-catalog.ts` — 将 `ae:setup` 条目的 `skillFile` 从 `''` 回填为 `skills/ae-setup/SKILL.md`

**Source**: `E:\Documents\IdeaProjects\compound-engineering-plugin\plugins\compound-engineering\skills\ce-setup\SKILL.md`（参考，需重写）

**Approach**:

1. 创建 `skills/ae-setup/SKILL.md`，frontmatter: `name: ae:setup`, `description` 描述为"诊断并安装 AE 前端设计所需的外部依赖（agent-browser）"
2. 正文结构：
   - **第一步：检查 agent-browser** — 执行 `command -v agent-browser 2>/dev/null || where agent-browser 2>NUL`，根据结果判断是否已安装
   - **第二步：展示结果** — 已安装显示 `✅ agent-browser 已安装`；未安装显示 `⚠️ agent-browser 未安装` 并询问是否安装
   - **第三步：安装引导** — 用户确认后执行 `npm install -g agent-browser && npx agent-browser install`；提示 Windows 可能需要管理员权限；安装后验证
   - **第四步：完成提示** — 汇总安装结果
3. 提问使用 opencode 的 `question` 工具
4. 创建 `commands/ae-setup.md`，标准格式：`使用 ae:setup 技能处理这次请求，并沿用参数：$ARGUMENTS。`

**Test scenarios**:

- `skills/ae-setup/SKILL.md` 存在且 frontmatter 正确
- `commands/ae-setup.md` 存在且为标准委托格式
- SKILL.md 内容不包含 `AskUserQuestion`、`CLAUDE_PLUGIN_ROOT`、`claude-in-chrome` 等 CE 专属引用
- SKILL.md 内容不包含 `gh`、`vhs`、`silicon`、`ffmpeg`
- SKILL.md 内容包含 `npm install -g agent-browser` 安装命令
- SKILL.md 内容包含 Windows 管理员权限提示
- SKILL.md frontmatter 的 `name` 字段为 `ae:setup`（与 catalog `skillName` 一致）
- catalog 中 `ae:setup` 的 `skillFile` 已回填为 `skills/ae-setup/SKILL.md`
- `npm run build` 后 `.opencode/commands/ae-setup.md` 存在

**Verification**:

- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过
- [ ] `.opencode/commands/ae-setup.md` 存在

---

## Unit 3: 迁移 ae:test-browser 技能

**Goal**: 将 CE 的 `test-browser` 技能迁移为 AE 技能，移除平台绑定。

**Dependencies**: Unit 0

**Files**:

- [ ] `skills/ae-test-browser/SKILL.md` — 新建，中文翻译 + 平台适配
- [ ] `commands/ae-test-browser.md` — 新建，标准委托格式
- [ ] `src/services/ae-catalog.ts` — 将 `ae:test-browser` 条目的 `skillFile` 从 `''` 回填为 `skills/ae-test-browser/SKILL.md`

**Source**: `E:\Documents\IdeaProjects\compound-engineering-plugin\plugins\compound-engineering\skills\test-browser\SKILL.md`

**Approach**:

1. 读取 CE 源文件
2. 翻译全部正文为中文
3. frontmatter: `name: ae:test-browser`, `description` 翻译为中文
4. 移除内容：
   - `gh` CLI 相关逻辑（PR 文件列表获取、`gh pr view` 命令）
   - `claude-in-chrome` MCP 禁止声明（"do not use Chrome MCP tools" 整段）
   - `todo-create` 技能集成（创建 todo 的选项和步骤）
   - `AGENTS.md` / `CLAUDE.md` 端口检测（改为检查 `package.json` 的 `scripts.dev` 字段推断开发服务器端口，默认 `http://localhost:3000`）
5. 保留内容：
   - agent-browser 安装检查和 CLI 参考文档
   - 核心测试流程：启动页面 → 截图 → 交互 → 验证
   - 错误处理和截图命名约定
   - `agent-browser` CLI 参考表
6. 创建 `commands/ae-test-browser.md`，标准格式

**Test scenarios**:

- `skills/ae-test-browser/SKILL.md` 存在且 frontmatter 正确
- 内容不含 `gh` CLI 引用
- 内容不含 `claude-in-chrome`
- 内容不含 `todo-create`
- 内容包含 agent-browser CLI 参考
- SKILL.md frontmatter 的 `name` 字段为 `ae:test-browser`（与 catalog `skillName` 一致）
- catalog 中 `ae:test-browser` 的 `skillFile` 已回填为 `skills/ae-test-browser/SKILL.md`
- `npm run build` 后 `.opencode/commands/ae-test-browser.md` 存在

**Verification**:

- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过
- [ ] `.opencode/commands/ae-test-browser.md` 存在

---

## Unit 4: 更新 ae:frontend-design 引用

**Goal**: 更新 `ae:frontend-design` 技能的视觉验证和迭代设计相关段落，将通用表述替换为具体的 AE 技能/代理引用。

**Dependencies**: Unit 1 + Unit 2 + Unit 3

**Files**:

- [ ] `skills/ae-frontend-design/SKILL.md` — 编辑 3 处引用

**Approach**:

1. **视觉验证 → 工具优先级** 部分：将"命令行浏览器工具"替换为明确的 agent-browser 安装引导：`如果未安装 agent-browser，请先使用 /ae-setup 安装。`
2. **视觉验证 → 范围控制** 部分：将"如需多轮截图-评估-修复的迭代细化，切换到迭代设计模式"替换为"如需多轮截图-评估-修复的迭代细化，使用 @ae/design-iterator 代理"（调用语法为 `@ae/design-iterator`，与 opencode 子代理解析 `agents/workflow/design-iterator.md` 一致）
3. 浏览器测试引用：在视觉验证段落末尾追加"完整的浏览器端到端测试请使用 /ae-test-browser。"
4. 确保不引入任何 CE 专属引用

**Test scenarios**:

- `skills/ae-frontend-design/SKILL.md` 包含 `@ae/design-iterator` 引用
- 包含 `/ae-setup` 引用
- 包含 `/ae-test-browser` 引用
- 不包含 CE 专属引用（`ce-setup`、`compound-engineering`）

**Verification**:

- [ ] 文件内容包含 3 处具体引用
- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过

---

## Build & Final Verification

所有 Unit 完成后执行：

- [ ] `npm run build` 无错误
- [ ] `npm run test` 全部通过
- [ ] `.opencode/commands/` 包含 `ae-frontend-design.md`、`ae-setup.md`、`ae-test-browser.md`
- [ ] `.opencode/agents/ae/workflow/design-iterator.md` 存在
- [ ] `skills/ae-frontend-design/SKILL.md` 的视觉验证段落包含具体 AE 技能/代理引用

### 手动验证（需 agent-browser 环境）

以下 Success Criteria 需在安装了 agent-browser 的环境中手动验证：
- `/ae-setup` 能检测 agent-browser 安装状态并引导安装
- `/ae-test-browser` 能执行基本的浏览器测试
- `@ae/design-iterator` 能通过 agent-browser 进行截图迭代
