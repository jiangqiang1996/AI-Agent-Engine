# AI Agent Engine

AE 是一套面向 opencode 的工程工作流插件：以 `ae:*` 技能为能力真源，以 `/ae-*` 命令为默认发现入口，围绕需求、计划、执行、审查和跨会话恢复建立可持续的工程闭环。

## 支持范围

本项目**只支持 opencode**。

当前不提供以下运行环境的安装与兼容承诺：
- Claude Code
- Cursor
- Codex CLI / Codex App
- Gemini CLI
- 其他非 opencode 代理运行时

## 安装

### 一句话安装（推荐）

把下面这句话原样复制给你的 **opencode AI 代理**：

```text
Fetch and follow instructions from https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/.opencode/INSTALL.md
```

AI 代理会自动完成克隆、构建和插件注册。安装前它会先检查是否存在 `oh-my-openagent`、`oh-my-opencode`、`superpowers` 等可能冲突的插件并给出警告。

### 手动安装

1. 克隆仓库到固定目录：

```bash
git clone https://gitee.com/jiangqiang1996/ai-agent-engine.git ~/.config/opencode/ai-agent-engine
```

2. 安装依赖并构建：

```bash
cd ~/.config/opencode/ai-agent-engine
npm install
npm run build
```

3. 在全局插件目录创建桥接文件（opencode 会自动加载该目录下的 `.js` 文件）：

```bash
echo "export { default } from '../ai-agent-engine/dist/src/index.js'" > ~/.config/opencode/plugins/ae-server.js
echo "export { default } from '../ai-agent-engine/dist/src/tui.js'" > ~/.config/opencode/plugins/ae-tui.js
```

> **说明：** `opencode.json` 的 `plugin` 字段仅接受 npm 包名，不支持本地文件路径。本地插件应放入 `~/.config/opencode/plugins/`（全局）或 `.opencode/plugins/`（项目级）由 opencode 自动加载。`npm run build` 会同步生成 `.opencode/plugins/`、`.opencode/commands/`、`.opencode/agents/ae/` 里的运行时产物。

4. 重启 opencode，然后尝试 `/ae-lfg` 验证安装成功。

## 更新

拉取最新代码后重新构建即可，桥接文件无需变动：

```bash
cd ~/.config/opencode/ai-agent-engine
git pull
npm install
npm run build
```

构建完成后重启 opencode 即生效。如果 `package.json` 中依赖版本未变更，`npm install` 可以省略。

也可以让 AI 代理执行更新：

```text
帮我更新 ai-agent-engine 插件：进入 ~/.config/opencode/ai-agent-engine 执行 git pull、npm install、npm run build
```

## 卸载

1. 删除全局插件目录中的桥接文件：

```bash
rm ~/.config/opencode/plugins/ae-server.js
rm ~/.config/opencode/plugins/ae-tui.js
```

2. 删除克隆的仓库目录：

```bash
rm -rf ~/.config/opencode/ai-agent-engine
```

3. 重启 opencode，确认 `/ae-lfg` 不再可用即表示卸载完成。

也可以让 AI 代理执行卸载：

```text
帮我卸载 ai-agent-engine 插件：删除 ~/.config/opencode/plugins/ae-server.js 和 ae-tui.js，然后删除 ~/.config/opencode/ai-agent-engine 目录
```

卸载过程不会影响用户已有的 `opencode.json` 配置。

## 构建与开发

| 项目 | 说明 |
| --- | --- |
| 开发真源 | 根目录 `package.json`、`src/`、`skills/`、`commands/`、`agents/` |
| 运行时入口 | `.opencode/plugins/ae-server.js`、`.opencode/plugins/ae-tui.js` |
| 构建命令 | `npm run build` |
| 测试命令 | `npm run test` |
| 全局插件目录 | `~/.config/opencode/plugins/`，opencode 自动加载该目录下的 `.js` / `.ts` 文件 |

## 默认入口

| 推荐入口 | 用途 | 无产物时行为 | 有产物时行为 |
| --- | --- | --- | --- |
| `/ae-lfg` | 默认用户入口，驱动主链路 | 回到 `ae:brainstorm` / `/ae-brainstorm` | 先尝试恢复到对应阶段 |
| `ae:lfg` | 同 `/ae-lfg`，适合技能直调 | 同上 | 同上 |

## 技能与命令矩阵

| 技能 | 命令 | 功能 | 典型输入 | 输出产物 | 支持跨会话继续 |
| --- | --- | --- | --- | --- | --- |
| `ae:brainstorm` | `/ae-brainstorm` | 围绕需求做头脑风暴并生成 requirements 文档 | 需求描述、已有 requirements 路径 | `docs/brainstorms/*-requirements.md` | 是 |
| `ae:document-review` | `/ae-review-doc` | 对需求文档做多 reviewer 审查 | `mode:*`、文档路径 | findings / gate 结论 | 是 |
| `ae:plan` | `/ae-plan` | 生成或更新 CE 式 living plan | plan 路径、requirements 路径、需求描述 | `docs/plans/*-plan.md` | 是 |
| `ae:plan-review` | `/ae-review-plan` | 对计划文档做多 reviewer 审查 | `mode:*`、计划路径 | findings / gate 结论 | 是 |
| `ae:work` | `/ae-work` | 按 living plan 执行工作，默认 subagent-first | plan 路径、工作描述 | 代码改动、`.context/ae/work/*` | 是 |
| `ae:review` | `/ae-review-code` | 对代码改动做 CE 风格多 reviewer 审查 | `mode:*`、`plan:<path>`、`base:<ref>` | findings / gate 结论、`.context/ae/review/*` | 是 |
| `ae:lfg` | `/ae-lfg` | 默认总入口，驱动从需求到执行的 AE 主链路 | 需求描述、已有产物路径 | 按阶段推进或恢复 | 是 |

## 参数总表

| 入口 | 参数 / token | 必填 | 说明 | 默认行为 | 冲突规则 |
| --- | --- | --- | --- | --- | --- |
| `ae:brainstorm` / `/ae-brainstorm` | 自由文本 | 否 | 需求描述或已有 requirements 路径 | 无输入时要求补充需求 | 无 |
| `ae:document-review` / `/ae-review-doc` | `mode:*` | 否 | 审查模式，如 `interactive`、`headless` | 默认 `interactive` | 多个 `mode:*` 同时出现视为冲突 |
| `ae:document-review` / `/ae-review-doc` | 文档路径 | 否 | 指定要审查的 requirements 文档 | 省略时由恢复/最近产物规则决定 | 与不存在路径组合时返回错误 |
| `ae:plan` / `/ae-plan` | plan 路径 | 否 | 续写已有计划 | 若路径存在则优先更新 | 与 requirements 路径同时传入时，以显式目标为准 |
| `ae:plan` / `/ae-plan` | requirements 路径 | 否 | 以已有 requirements 生成计划 | 若存在单一 requirements 候选可自动选中 | 多候选时必须显式选择 |
| `ae:plan` / `/ae-plan` | 自由文本 | 否 | 直接从用户描述规划 | 无上游文档时走规划 bootstrap | 无 |
| `ae:plan-review` / `/ae-review-plan` | `mode:*` | 否 | 计划审查模式 | 默认 `interactive` | 多个 `mode:*` 冲突 |
| `ae:plan-review` / `/ae-review-plan` | 计划路径 | 否 | 指定 plan 文档 | 若省略则按恢复规则查找 | 无效路径返回错误 |
| `ae:work` / `/ae-work` | plan 路径 | 否 | 指定要执行的 living plan | 存在单一候选 plan 时自动恢复 | 多候选强制选择 |
| `ae:work` / `/ae-work` | 自由文本 | 否 | 直接描述工作 | 优先建议先有 plan，再决定是否继续 | 与 plan 路径同时给出时，以 plan 为准 |
| `ae:review` / `/ae-review-code` | `mode:*` | 否 | `interactive` / `headless` / `report-only` / `autofix` | 默认 `interactive` | 多个 `mode:*` 冲突 |
| `ae:review` / `/ae-review-code` | `plan:<path>` | 否 | 用于 requirements completeness 校验 | 省略时只审代码上下文 | 与无效路径组合时报错 |
| `ae:review` / `/ae-review-code` | `base:<ref>` | 否 | 明确 diff 基线 | 省略时由当前上下文推断 | 与非法 ref 组合时报错 |
| `ae:lfg` / `/ae-lfg` | 自由文本 | 否 | 需求描述或已有产物路径 | 无输入时优先恢复，恢复失败则回到 brainstorm | 多候选产物不自动猜测 |

## 审查模式

| 模式 | 适用入口 | 行为 | 是否 gate |
| --- | --- | --- | --- |
| `interactive` | 文档/计划/代码审查 | 标准交互式审查 | 是 |
| `headless` | 文档/计划/代码审查 | 供 skill-to-skill 或 pipeline 使用 | 由调用方决定 |
| `report-only` | 代码审查 | 只输出 findings，不改文件 | 否 |
| `autofix` | 代码审查 | 仅允许处理 `safe_auto` 类问题 | 是 |

## 产物路径

| 路径 | 作用 | 事实来源 | 说明 |
| --- | --- | --- | --- |
| `docs/brainstorms/` | requirements 文档 | 是 | `ae:brainstorm` 的主要输出 |
| `docs/plans/` | living plan 文档 | 是 | `ae:plan` 的主要输出 |
| `.context/ae/review/` | 审查运行产物 | 是 | 供 `ae:review` 与恢复逻辑使用 |
| `.context/ae/work/` | 执行运行产物 | 是 | 供 `ae:work` 与恢复逻辑使用 |
| `.opencode/plugins/` | plugin 运行时入口 | 否 | 构建产物，不是长期维护真源 |
| `.opencode/commands/` | 原生命令执行镜像 | 否 | 由根目录 `commands/` 同步生成 |
| `.opencode/agents/ae/` | agent 运行时镜像 | 否 | 由根目录 `agents/` 同步生成 |

## 恢复规则

| 场景 | 默认行为 | 下一步 |
| --- | --- | --- |
| 无产物 | 不自动猜测 | 回到 `ae:brainstorm` / `/ae-brainstorm` |
| 单一候选产物 | 自动恢复 | 继续对应阶段 |
| 多个候选产物 | 停止自动推进 | 要求显式选择 |
| 空产物 | 视为异常 | 修复或重跑上游阶段 |
| 损坏产物 | 视为异常 | 修复 frontmatter 或重建产物 |
| requirements 与 plan 不一致 | 阻止继续执行旧 plan | 回到 `ae:plan` / `ae:plan-review` |
| 审查失败 | 停留在当前阶段 | 先修复再继续 |
| 用户中止 | 保留当前产物 | 下次会话可继续 |

## Agent 分桶

| 桶 | 说明 | 代表项 |
| --- | --- | --- |
| Required | 一期必需迁入 | `coherence-reviewer`、`correctness-reviewer`、`repo-research-analyst` |
| Gilded | 可适当镀金提前迁入 | `architecture-strategist`、`performance-oracle`、`session-historian` |
| Deferred | 暂不首发但保留清单 | `data-migrations-reviewer`、`kieran-python-reviewer`、`ankane-readme-writer` |

## 典型用法

| 场景 | 推荐入口 | 示例 |
| --- | --- | --- |
| 新需求从零开始 | `/ae-lfg` | `/ae-lfg 实现一套 AE 工作流插件` |
| 只做需求文档 | `/ae-brainstorm` | `/ae-brainstorm 为 AE 一期定义需求边界` |
| 基于 requirements 写计划 | `/ae-plan` | `/ae-plan docs/brainstorms/2026-04-18-ae-plugin-phase-one-requirements.md` |
| 直接执行已有 plan | `/ae-work` | `/ae-work docs/plans/2026-04-18-001-feat-ae-phase-one-workflow-plugin-plan.md` |
| 只做代码审查 | `/ae-review-code` | `/ae-review-code mode:report-only plan:docs/plans/2026-04-18-001-feat-ae-phase-one-workflow-plugin-plan.md` |
| 跨会话恢复 | `/ae-lfg` | `/ae-lfg` |

## 工作方式摘要

1. 默认从 `/ae-lfg` 进入。
2. 若已有产物，优先恢复而不是重复创建文档。
3. `ae:plan` 输出 living plan，`ae:work` 默认 subagent-first。
4. 文档、计划、代码三类审查都使用多 reviewer。
5. 技能与命令共享同一套参数 contract、帮助语义和恢复语义。
