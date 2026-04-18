# 前端设计技能链迁移需求

> 由 `/ae-brainstorm` 生成，日期：2026-04-18

## Problem Frame

`ae:frontend-design` 技能已从 compound-engineering-plugin (CE) 迁移并翻译为中文，但引用链中的 **19 个下游/上游节点**（排除 `frontend-design` 自身，含 18 个已识别节点 + 1 个分析中额外发现的浏览器测试技能）尚未迁移。当前技能中的视觉验证环节、迭代设计环节和浏览器测试环节均降级为通用表述，缺乏可落地的执行路径。

CE 项目是 Claude Code 生态插件，AE 项目是 opencode 生态插件，两者平台 API、工具命名、安装机制均不同。迁移不能简单复制，需要逐节点评估可行性。

**已知约束**：明确不使用 `gh` 节点。

## 节点迁移评估

### 评估维度

每个节点从以下维度评估：

- **平台依赖性**：是否依赖 Claude Code 专属 API / 环境变量 / MCP
- **opencode 兼容性**：opencode 是否有等价能力
- **迁移复杂度**：直接可用 / 需适配 / 需重写 / 不适用
- **用户价值**：对 AE 用户的前端设计工作流价值

### 逐节点分析

#### R1. `design-iterator` 代理 — 迁移（需适配）

| 维度 | 评估 |
|------|------|
| 来源 | `agents/design/design-iterator.md` |
| 功能 | 多轮截图-分析-改进的迭代设计细化，每轮 1-2 个小改动 |
| 平台依赖 | 依赖 `agent-browser` CLI 做截图，无其他平台绑定 |
| opencode 兼容 | agent-browser 是通用 CLI，opencode 可通过 bash 工具调用 |
| 迁移复杂度 | **需适配** — 移除 `swiss-design` 引用、将 agent-browser 指令适配为 opencode bash 调用 |
| 用户价值 | **高** — 前端设计最核心的迭代闭环能力，ae:frontend-design 明确指向此代理 |

迁移要点：
- 创建 `agents/workflow/design-iterator.md`（`design-iterator` 已在 `ae-catalog.ts` 的 `GILDED_AGENTS` 中注册为 `['design-iterator', 'workflow', '推动多轮设计迭代']`，只需创建源文件即可自动纳入构建同步）
- 翻译为中文
- 移除 `swiss-design` 引用（该技能在 CE 项目中也无对应文件，仅为按名引用，不迁移）
- `<frontend_aesthetics>` 块已被 `ae:frontend-design` 技能覆盖，删除避免重复
- agent-browser 调用保持原样（通过 opencode 的 bash 工具执行）
- 代理中增加前置检查：若 `agent-browser` 不可用，返回友好提示并引导用户运行 `ae:setup`
- 平台提问工具改为 opencode 的 `question`

#### R2. `agent-browser` CLI — 作为外部依赖声明

| 维度 | 评估 |
|------|------|
| 来源 | https://github.com/vercel-labs/agent-browser |
| 功能 | 无头浏览器自动化：打开页面、截图、点击、填表、DOM 快照 |
| 平台依赖 | 无，独立 Node.js CLI 工具 |
| opencode 兼容 | 通过 bash 工具直接调用 |
| 迁移复杂度 | **不迁移** — 这是外部 npm 包，不是技能/代理 |
| 用户价值 | **高** — 设计迭代和视觉验证的底层依赖 |

处理方式：
- 不作为技能迁移，但需要在 AE 文档中声明为推荐依赖
- 安装方式：`npm install -g agent-browser && npx agent-browser install`（跨平台，全局安装）
- 调用方式：安装后直接通过 `agent-browser` 命令调用，或通过 `npx agent-browser` 调用
- 系统级依赖：agent-browser 基于 Playwright，安装时需下载浏览器二进制文件（约 300MB）
- 可考虑创建 `ae:setup` 技能（见 R4）来自动化安装

#### R3. `Browser MCP / claude-in-chrome` — 不适用

| 维度 | 评估 |
|------|------|
| 功能 | Chrome 浏览器自动化 MCP |
| 平台依赖 | Claude Code 专属 MCP 服务 |
| opencode 兼容 | opencode 有自己的 MCP 生态，但 `claude-in-chrome` 不可用 |
| 迁移复杂度 | **不适用** — 平台绑定 |
| 用户价值 | **低** — opencode 用户不会安装 Claude Code MCP |

处理方式：ae:frontend-design 的视觉验证级联中已用通用表述"浏览器 MCP 工具"替代，保持不变即可。

#### R4. `/ce-setup` 技能 — 可迁移为 `ae:setup`

| 维度 | 评估 |
|------|------|
| 来源 | `skills/ce-setup/SKILL.md` |
| 功能 | 交互式环境诊断、依赖安装、配置引导 |
| 平台依赖 | 部分依赖 Claude Code 特有机制（`AskUserQuestion`、`CLAUDE_PLUGIN_ROOT`） |
| opencode 兼容 | opencode 有 `question` 工具替代 `AskUserQuestion`；无 `CLAUDE_PLUGIN_ROOT` 但可用其他方式定位 |
| 迁移复杂度 | **需重写** — CE 的 check-health 脚本、config-template、遗留清理逻辑均不适用 |
| 用户价值 | **中高** — 自动化安装 agent-browser 等依赖，降低用户上手门槛 |

迁移要点：
- 新建 `skills/ae-setup/SKILL.md`
- check-health 脚本需要大幅简化：移除 CE 特有检查项（遗留配置清理、gitignore 安全检查）
- 保留核心逻辑：检测 agent-browser 是否安装，未安装则引导安装
- 移除 `gh` 依赖项（用户明确不使用）
- 移除 Codex/OpenAI 委派相关配置
- 将 `AskUserQuestion` 替换为 opencode 的 `question` 工具
- 配置文件路径从 `.compound-engineering/` 改为 `.opencode/` 相关路径
- 对应命令 `commands/ae-setup.md`

#### R5. `check-health` 脚本 — 可迁移（大幅简化）

| 维度 | 评估 |
|------|------|
| 来源 | `skills/ce-setup/scripts/check-health` |
| 功能 | 一键检查 CLI 工具安装状态 |
| 平台依赖 | 无平台绑定，但原脚本为 bash 语法，Windows PowerShell 不兼容 |
| opencode 兼容 | 需改写为跨平台方案（Node.js 脚本或 SKILL.md 内联指令） |
| 迁移复杂度 | **需简化** — 移除 CE 特有检查项，只保留工具安装检查，同时需跨平台适配 |
| 用户价值 | **中** — ae:setup 的底层支撑 |

迁移要点：
- 检查逻辑内联在 `SKILL.md` 中（不使用独立脚本文件，当前 AE 技能均无 `scripts/` 子目录先例）
- 移除 CE 配置检查（compound-engineering.local.md、config.local.yaml）
- 移除 gitignore 安全检查
- 保留工具检查逻辑：agent-browser（必须依赖）
- 移除 `gh`（用户明确不使用）
- 安装命令使用 npm（跨平台）：`npm install -g agent-browser && npx agent-browser install`
- Windows 环境注意：`npm install -g` 可能需要管理员权限；建议提供 `npx agent-browser` 备选方案

#### R6. `config-template.yaml` — 不适用

| 维度 | 评估 |
|------|------|
| 功能 | CE 本地配置模板，含 Codex 委派和模型选择 |
| 平台依赖 | CE 配置体系绑定 |
| 迁移复杂度 | **不适用** — AE 项目使用 `opencode.json` 配置，不使用 CE 配置体系 |

#### R7. `/ce-update` 技能 — 不适用

| 维度 | 评估 |
|------|------|
| 功能 | 检查 CE 插件版本并清理缓存 |
| 平台依赖 | Claude Code 专属（`CLAUDE_PLUGIN_ROOT`、`/plugin marketplace update`） |
| 迁移复杂度 | **不适用** — AE 插件更新机制完全不同（npm/git） |

#### R8. `gh` CLI — 排除

用户明确不使用。

#### R9. `jq` CLI — 不迁移

| 维度 | 评估 |
|------|------|
| 功能 | 命令行 JSON 处理 |
| 迁移复杂度 | **不迁移** — 通用工具，非前端设计专属依赖。如需要可由用户自行安装 |

#### R10. `vhs` CLI — 不迁移

| 维度 | 评估 |
|------|------|
| 功能 | 终端录屏生成 GIF |
| 迁移复杂度 | **不迁移** — 属于 demo/reel 生态，非前端设计核心 |

#### R11. `silicon` CLI — 不迁移

| 维度 | 评估 |
|------|------|
| 功能 | 代码截图渲染 |
| 迁移复杂度 | **不迁移** — 属于 demo/reel 生态，非前端设计核心 |

#### R12. `ffmpeg` CLI — 不迁移

| 维度 | 评估 |
|------|------|
| 功能 | 音视频处理 |
| 迁移复杂度 | **不迁移** — 属于 demo/reel 生态，非前端设计核心 |

#### R13. `brew` 包管理器 — 不迁移

macOS 专属包管理器，AE 项目需支持 Windows。安装脚本应改用 npm 或跨平台方案。

#### R14. `git` CLI — 不迁移

系统自带，无需迁移。

#### R15. `swiss-design` 技能 — 不存在

CE 项目中也无对应文件，仅为按名引用。不迁移。

#### R16. `Codex / OpenAI` 外部服务 — 不适用

AE 项目不使用 Codex 委派机制。

#### R17. `EveryInc/compound-engineering-plugin` GitHub 仓库 — 不适用

CE 插件的源码仓库，与 AE 项目无关。

#### R18. `CLAUDE_PLUGIN_ROOT` 环境变量 — 不适用

Claude Code 专属环境变量。opencode 使用不同的插件路径机制。

### 浏览器测试技能（已纳入 REQ-3 正式范围）

在分析引用链过程中发现以下 CE 浏览器相关技能也与前端设计工作流相关：

#### R19. `test-browser` 技能 — 可迁移（需大幅适配）

| 维度 | 评估 |
|------|------|
| 来源 | `skills/test-browser/SKILL.md` |
| 功能 | 端到端浏览器测试：启动页面 → 截图 → 交互 → 验证 |
| 平台依赖 | 依赖 agent-browser、gh（PR 文件列表） |
| opencode 兼容 | agent-browser 可用；gh 需移除或替换 |
| 迁移复杂度 | **需大幅适配** — 移除 gh 依赖、移除 claude-in-chrome 排斥逻辑、移除 todo-create 集成 |
| 用户价值 | **中高** — 前端设计的下游验证能力 |

迁移要点：
- 新建 `skills/ae-test-browser/SKILL.md`
- 翻译为中文
- 移除 `gh` 相关的 PR 文件列表逻辑
- 移除 `claude-in-chrome` MCP 相关的禁止逻辑
- 移除 `todo-create` 集成（AE 项目无此技能）
- 保留 agent-browser 核心测试流程

## Requirements

> **执行顺序**：REQ-0 → REQ-1/2/3 可并行 → REQ-4 在前三者全部完成后执行 → 最后 `npm run build` 构建并验证

### REQ-0: 注册已有资产到 ae-catalog.ts（前置）

将已创建但未注册的 `ae:frontend-design` 技能/命令条目添加到 `ae-catalog.ts` 的 `PHASE_ONE_ENTRIES` 数组，确保构建后命令同步到 `.opencode/commands/`。

- 输出：更新 `src/services/ae-catalog.ts` 的 `PHASE_ONE_ENTRIES`
- 关键适配点：
  - 添加 `ae:frontend-design` / `ae-frontend-design` 条目
  - 更新 `AeSkillNameSchema` 和 `AeCommandNameSchema` 添加对应枚举值
  - 同步更新相关测试中的计数断言

### REQ-1: 迁移 design-iterator 代理

将 CE 的 `design-iterator` 代理迁移为 AE 代理，翻译为中文，移除平台绑定引用。

- 输入：`agents/design/design-iterator.md`
- 输出：`agents/workflow/design-iterator.md`（已预注册在 `GILDED_AGENTS`，创建文件即生效）
- 关键适配点：
  - 翻译全部内容为中文
  - 移除 `swiss-design` 引用（CE 项目中也无对应文件，仅为按名引用，不迁移）
  - 移除 `<frontend_aesthetics>` 块（已由 `ae:frontend-design` 覆盖）
  - agent-browser 调用保持原样（通过 opencode bash 工具执行）
  - 增加前置检查步骤：若 `agent-browser` 不可用，返回友好提示并引导运行 `ae:setup`
  - 平台提问工具改为 opencode 的 `question`

### REQ-2: 创建 ae:setup 技能

基于 CE 的 `ce-setup` 创建 AE 的环境安装技能，大幅简化为仅检查和安装前端设计相关依赖。

- 输入：`skills/ce-setup/SKILL.md`
- 输出：`skills/ae-setup/SKILL.md` + `commands/ae-setup.md`，并在 `ae-catalog.ts` 中注册
- 关键适配点：
  - 仅检查 `agent-browser`（必须依赖）
  - 检查/安装逻辑内联在 SKILL.md 中（不使用独立脚本文件）
  - 安装命令使用 npm 跨平台方案：`npm install -g agent-browser && npx agent-browser install`
  - Windows 环境提示：`npm install -g` 可能需要管理员权限
  - 移除 CE 配置体系相关逻辑
  - 提问工具改为 opencode 的 `question`

### REQ-3: 迁移 test-browser 技能

将 CE 的 `test-browser` 浏览器测试技能迁移为 AE 技能，移除平台绑定。

- 输入：`skills/test-browser/SKILL.md`
- 输出：`skills/ae-test-browser/SKILL.md` + `commands/ae-test-browser.md`，并在 `ae-catalog.ts` 中注册
- 关键适配点：
  - 翻译为中文
  - 移除 `gh` CLI 依赖（PR 文件列表逻辑）
  - 移除 `claude-in-chrome` MCP 禁止逻辑
  - 移除 `todo-create` 技能集成
  - 保留 agent-browser 核心测试流程和 CLI 参考
  - 技能名 `ae:test-browser`，命令名 `ae-test-browser`（与 `ae:frontend-design` / `ae-frontend-design` 模式一致）

### REQ-4: 更新 ae:frontend-design 引用

更新已迁移的 `ae:frontend-design` 技能，将通用表述替换为具体的 AE 技能/代理引用。

- 输入：`skills/ae-frontend-design/SKILL.md`
- 输出：更新后的 `skills/ae-frontend-design/SKILL.md`
- 关键适配点：
  - 视觉验证级联中引用 `@design-iterator` 代理（REQ-1 产出）
  - agent-browser 安装引导指向 `ae:setup` 技能（REQ-2 产出）
  - 浏览器测试引用 `ae:test-browser` 技能（REQ-3 产出）

## Success Criteria

1. `ae:frontend-design` 已在 `ae-catalog.ts` 中注册，`/ae-frontend-design` 命令可正常调用
2. `design-iterator` 代理可在 opencode 中通过 `@ae/design-iterator` 调用，能使用 agent-browser 进行截图迭代
3. `ae:setup` 能检测 agent-browser 安装状态，未安装时引导用户通过 npm 安装，支持 Windows
4. `ae:test-browser` 能使用 agent-browser 执行基本的端到端浏览器测试
5. `ae:frontend-design` 的视觉验证环节能引用到具体的 AE 技能/代理，而非通用表述
6. 所有迁移产出的技能和代理内容为中文
7. 所有迁移产物遵循 AE 项目约定（`ae:` 前缀、kebab-case 命名、技能-命令双层架构）
8. 新增技能/命令已注册到 `ae-catalog.ts`，构建后出现在 `.opencode/commands/` 和 `.opencode/agents/ae/`

## Scope Boundaries

### 在范围内

- ae-catalog.ts 资产注册（REQ-0）
- design-iterator 代理迁移（REQ-1）
- ae:setup 技能创建（REQ-2）
- ae:test-browser 技能迁移（REQ-3）
- ae:frontend-design 引用更新（REQ-4）
- 所有内容的中文翻译

### 不在范围内

- `gh` CLI 相关功能（用户明确排除）
- `ce-update` / CE 版本管理机制（Claude Code 专属，AE 使用 npm/git 更新）
- CE 配置体系（config-template.yaml、compound-engineering.local.md，AE 使用 opencode.json）
- demo/reel 相关工具（vhs、silicon、ffmpeg，非前端设计核心）
- Figma MCP 相关代理（design-implementation-reviewer、figma-design-sync，Figma MCP 是额外基础设施，可作为后续迁移）
- `todo-create` / `todo-triage` / `todo-resolve` 工作项管理体系（AE 无此体系）
- `ce:compound` 经验提炼技能（未在引用链中出现，属于 CE 工作流内部技能）
- `swiss-design` 等不存在的技能（CE 项目中也无对应文件，仅为按名引用）
- `lfg` 全自动流水线（AE 已有 `ae:lfg`）

## Key Decisions

| # | 决策 | 理由 |
|---|------|------|
| D1 | agent-browser 作为外部依赖声明而非内嵌技能 | 它是通用 npm 包，不是技能内容；CE 中也曾是上游引入后删除 |
| D2 | ae:setup 仅检查 agent-browser 一个必须依赖 | 其他工具（jq/vhs/silicon/ffmpeg）非前端设计核心，按需安装 |
| D3 | 移除 design-iterator 的 `<frontend_aesthetics>` 块 | 与 `ae:frontend-design` 的 Layer 2 内容重复，由技能覆盖 |
| D4 | test-browser 移除 gh 和 todo-create 集成 | 用户排除 gh；AE 无 todo 体系，改为直接报告测试结果 |
| D5 | Figma 相关代理暂不纳入本轮 | Figma MCP 是额外基础设施，增加迁移复杂度，可后续独立迁移 |
| D6 | 安装脚本需支持 Windows | AE 用户在 Windows 环境工作，brew 不可用，使用 npm 方案。`npm install -g` 可能需管理员权限，提供 `npx` 备选 |
| D7 | 代理放在 `agents/workflow/` 而非 `agents/ae/` | 遵循 `ae-catalog.ts` 中 `GILDED_AGENTS` 的分组约定，`design-iterator` 已预注册为 `workflow` 组 |
| D8 | 检查/安装逻辑内联在 SKILL.md 而非独立脚本 | 当前 AE 技能均无 `scripts/` 子目录先例；opencode 技能加载机制只读取 `SKILL.md`，不处理附加文件 |
