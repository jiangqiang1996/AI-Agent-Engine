# 技能编写规范（AE Skills）

本仓库是 **Agent Skills 合集**。每个技能遵循 [Agent Skills 规范](https://agentskills.io/specification)，
可被 Claude Code、Codex、Cursor、OpenCode、Copilot、Gemini CLI、Cline、Windsurf、Amp、Roo、
Kiro、OpenClaw 等 40+ 宿主原生加载。

---

## 1. 目录结构

```
skills/<skill-name>/
├── SKILL.md          # 必须。frontmatter + 正文
├── package.json      # 可选。该技能脚本的本地依赖（首次使用时在技能目录执行 npm install）
├── references/       # 可选。按需加载的深度文档
│   ├── roles/        # 可选。角色卡（见 §6）
│   └── *.md
├── scripts/          # 可选。Node.js 脚本（.mjs）
│   └── lib/          # 可选。共享脚本副本（由 tools/sync-shared.mjs 分发）
├── assets/           # 可选。模板、静态资源
└── tests/            # 可选。该技能脚本的单元测试（*.test.mjs）
```

**渐进披露**：frontmatter（~100 token）→ SKILL.md 正文（建议 <500 行）→ references/scripts 按需加载。

---

## 2. Frontmatter

只允许 6 个字段：

| 字段 | 必填 | 约束 |
|---|---|---|
| `name` | 是 | ≤64 字符，小写字母/数字/连字符，**必须等于目录名** |
| `description` | 是 | ≤1024 字符。必须同时写清「做什么」和「何时使用」，并包含中英文触发关键词 |
| `license` | 否 | 许可证名或随附许可证文件名 |
| `compatibility` | 否 | ≤500 字符。环境要求（Node 版本、外部二进制、网络访问） |
| `metadata` | 否 | **string → string** 映射，不能有嵌套对象 |
| `allowed-tools` | 否 | 空格分隔字符串。只能用通用工具名（`Bash(git:*) Read`），禁止写宿主专属工具名 |

```yaml
---
name: ae-prd
description: 探索阶段：创建新需求或修改已有需求，澄清目标、边界、约束、成功标准和待定问题，并产出需求文档。Use when the user needs to define or revise requirements before design.
license: GPL-3.0-or-later
compatibility: 无外部依赖
metadata:
  author: ae-skills
  version: "1.0.0"
---
```

---

## 3. 宿主无关原则（最重要）

**禁止**在任何技能内容里出现：

- 宿主专属工具名：`question`、`Task`、`subagent_type`、`ae-async-bash` 等
- 宿主专属路径：`.opencode/`、`~/.config/opencode/`、`opencode.json`
- 宿主专属 frontmatter：`mode: subagent`、`steps:`、`tools:` 映射、`model: $scenario`
- 宿主专属占位符：`$ARGUMENTS`
- 宿主专属名：`opencode`（`OpenCodeReview` 是另一个产品，允许出现）

**改为能力抽象措辞**：

| 不要写 | 改写为 |
|---|---|
| 使用 `question` 工具 | 使用宿主的交互式提问能力（常见别名 AskUserQuestion / question） |
| 调用 Task 工具 | 派发子代理（若宿主支持子代理派发能力） |
| 通过 `glob` 查找 | 使用宿主的文件搜索能力 |
| 用 `bash` 执行 | 使用宿主的命令执行能力 |

**并行/降级范式**（用于角色卡）：

> 若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；
> 若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

---

## 4. 产物路径约定

| 类型 | 路径 |
|---|---|
| 持久产物 | `<cwd>/ae/<skill-slug>/` |
| 临时产物 | `<cwd>/ae/<skill-slug>/tmp/` |
| 日志 | `<cwd>/ae/logs/<skill-slug>/` |

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀（`ae-pdf` → `pdf`）。

**跨技能读取允许，跨技能写入禁止。** 例如 `ae-design` 可以读 `ae/prd/`，但只能写 `ae/design/`。
共享目录（无唯一归属）：`ae/logs/`、`ae/solutions/`、`ae/patterns/`。

---

## 5. 配置约定

配置统一从 `ae.jsonc` 读取，查找顺序：

1. 环境变量 `AE_CONFIG` 指向的文件（显式覆盖）
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

**每个技能只读自己在 `ae.jsonc` 里的顶层 key**，互不干扰：

```jsonc
{
  "ae-pdf":       { "cjkFontPath": "C:/Windows/Fonts/msyh.ttc" },
  "ae-officecli": { "timeoutMs": 30000 },
  "ae-image":     { "endpoint": "", "model": "", "apiKeyEnv": "OPENAI_API_KEY" }
}
```

读取方式：技能内 `scripts/lib/ae-config.mjs` 提供 `getSkillConfig('<skill-key>')`。

---

## 6. 角色卡

多角色协作的技能，把每个角色写成 `references/roles/<role>.md`：

```markdown
# 角色：安全设计审查者

## 职责
## 触发条件
## 输入契约
## 输出契约
## 工作流
```

---

## 7. 脚本约定

- 零外部依赖（仅 Node 标准库），或把依赖写进技能自身的 `package.json`
- 需要外部二进制时，在 `compatibility` 中声明
- 脚本产出必须落盘到 `ae/<skill-slug>/`，日志落 `ae/logs/<skill-slug>/`
- 共享逻辑放 `tools/shared/`，由 `tools/sync-shared.mjs` 同步进各技能，保证单技能可独立取用

---

## 8. 校验

```bash
npm run validate   # 规范校验
npm run sync       # 同步共享脚本
npm run test       # 技能脚本单元测试
npm run doctor     # 全量自检
```

`tools/validate.mjs` 会检查：frontmatter 字段与取值、`name` == 目录名、正文行数、
相对引用是否存在、脚本语法、禁用词、产物路径归属、目录名通用词。
