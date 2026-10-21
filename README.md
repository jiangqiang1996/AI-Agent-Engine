# AE Skills

**通用 Agent Skills 合集** —— 一组可移植的 AI 代理技能，覆盖需求追问、前后端开发与修复、三层测试、PPTX 文档、语音合成与服务器运维。
遵循 [Agent Skills 规范](https://agentskills.io/specification)，可安装到 **Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、Cline、Windsurf、Amp、Roo Code、Kiro、OpenClaw** 等 40+ 宿主。

- 纯 **SKILL.md + 脚本**（Node.js / Python），无插件、无宿主 SDK、无运行时服务
- 每个技能**高内聚、低耦合**：可以只装一个独立使用，技能之间**零交叉引用**
- 零 npm 依赖起步：脚本只用 Node 标准库或 Python 标准库，需要时用外部 CLI

---

## 安装

### 用 `npx skills`（推荐）

```bash
# 安装全部技能到当前项目（交互选择技能与宿主）
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git

# 只装一个技能，装到指定宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --skill ae-grill -a claude-code

# 装到多个宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git -a claude-code -a cursor -a opencode

# 全局安装（所有项目可用）
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --skill '*' -g -a '*'

# 等价简写：全部技能 + 全部宿主 + 跳过确认
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --all

# 先看看有哪些技能（不安装）
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --list
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--skill <name>` / `-s` | 指定技能（`*` = 全部） |
| `--agent <agents>` / `-a` | 指定宿主（`*` = 全部） |
| `--global` / `-g` | 装到用户级目录，所有项目可用 |
| `--copy` | 用复制代替软链接（默认软链接，Windows 自动降级为复制） |
| `--list` / `-l` | 只列出仓库里的技能，不安装 |
| `--yes` / `-y` | 跳过交互确认 |

> 想把 CLI 装到本机长期使用：`npm install -g skills`，之后把上面的 `npx skills` 直接写成 `skills` 即可。

安装位置由 `skills` CLI 决定（默认 symlink，Windows 自动降级 copy）：

| 宿主 | 项目级 | 全局 |
|---|---|---|
| OpenCode / Codex / Cursor / Cline / Amp / Gemini CLI / Copilot 等通用宿主 | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| PromptScript | `agent/skills/` | — |

> **Roo Code 与 Windsurf 是条件安装**：只有检测到本机已安装对应宿主（`~/.roo/`、`~/.codeium/windsurf/`）时才会写入上述目录；未安装则跳过。
>
> 也支持 `gh skill install owner/repo --skill <name>`，发现规则相同。

### 手动安装

把需要的技能目录复制到宿主的技能目录即可（例如 `~/.claude/skills/ae-grill/`）。

---

## 更新

`skills` CLI 自带更新能力：`update` 按安装时记录的来源回源比对，把已安装的技能覆盖为最新版本。

```bash
# 更新当前作用域的全部技能（交互确认作用域）
npx skills update

# 只更新指定技能
npx skills update ae-grill
npx skills update ae-grill ae-pptx

# 只更新全局 / 只更新项目级
npx skills update -g
npx skills update -p

# 非交互（自动判定作用域：项目内有项目目录用项目级，否则用全局）
npx skills update -y
```

**更新依赖 `skills-lock.json`**：安装时 CLI 会在项目根（或全局目录）生成该文件，记录每个技能的来源与内容哈希：

```json
{
  "version": 1,
  "skills": {
    "ae-grill": {
      "source": "https://gitee.com/jiangqiang1996/ai-agent-engine.git",
      "skillPath": "skills/ae-grill/SKILL.md",
      "computedHash": "9393d7c4..."
    }
  }
}
```

锁文件可用于还原安装：

```bash
npx skills experimental_install
```

**注意**：

- 软链接安装（macOS/Linux 默认）下，源仓库更新后宿主侧立即生效；Windows 降级为独立副本（安装输出形如 `ae-grill (copied)`），`update` 会重写该副本——**你在技能目录里手改过的内容会被覆盖**。
- 已是最新时输出 `All project skills are up to date`。
- Windows 上命令结束后可能打印 libuv 的 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，属 Node 进程退出时的已知崩溃；结果提示已打印即表示更新成功。

---

## 卸载

```bash
# 卸载指定技能（交互确认）
npx skills remove ae-grill

# 指定技能 + 跳过确认
npx skills remove -s ae-grill -y

# 只从指定宿主移除
npx skills remove -s ae-grill -a opencode -y

# 卸载全局安装的技能
npx skills remove -s ae-grill -g -y

# 卸载全部技能
npx skills remove --all
```

> `remove` 会删掉技能目录，并清空 `skills-lock.json` 中的对应条目（锁文件本身保留）。
> 手工删除宿主的技能目录（如 `.agents/skills/ae-grill/`）同样有效，但锁文件里的条目会残留，
> 之后执行 `npx skills experimental_install` 仍可能把它装回来——卸载请优先用 `remove`。

---

## 命令速查

| 目的 | 命令 |
|---|---|
| 查看仓库里有哪些技能 | `npx skills add <repo> --list` |
| 安装（交互选择） | `npx skills add <repo>` |
| 安装（指定技能 + 宿主） | `npx skills add <repo> --skill ae-grill -a opencode` |
| 全局安装全部 | `npx skills add <repo> --skill '*' -g -a '*'` |
| 查看已安装 | `npx skills list` |
| 更新 | `npx skills update` |
| 更新指定技能 | `npx skills update ae-grill` |
| 卸载 | `npx skills remove -s ae-grill -y` |
| 临时用一次（不安装） | `npx skills use <repo>@ae-grill` |

> 本仓库地址：`https://gitee.com/jiangqiang1996/ai-agent-engine.git`

---

## 技能目录

### 需求与设计

| 技能 | 用途 |
|---|---|
| `ae-grill` | 深度追问方案决策，一问一答推进共识 |

### 实施与交付

| 技能 | 用途 |
|---|---|
| `ae-frontend` | 前端开发与修复：页面/组件实现、视觉还原、交互逻辑、API 联调、状态管理；视觉/交互/状态/接口/无障碍缺陷诊断修复 |
| `ae-backend` | 后端开发与修复：API 接口、数据访问层、业务逻辑、中间件；错误分析、根因定位、最小改动修复与回归验证 |

> 每个技能内置 `mode=dev` / `mode=fix` 两种模式，按用户表述自动判定，也可显式指定。

### 测试

| 技能 | 用途 |
|---|---|
| `ae-unit-test` | 单元测试生成、执行与覆盖率分析 |
| `ae-integration-test` | 集成测试：业务流程编排、认证流程、接口边界测试 |
| `ae-e2e-test` | 浏览器端到端测试：Playwright 脚本编写与执行、取证与失败分诊 |
| `ae-e2e-suite` | 项目级完整 E2E 测试工程：分层判定、基建搭建、套件组织、覆盖率、CI 集成（web + electron 双轨） |

> `ae-e2e-test` 面向**用例级**（写/跑单个 spec）；`ae-e2e-suite` 面向**工程级**（分层、基建、完整套件、覆盖率、CI）。
> `ae-e2e-test` 内置 `mode=test-only`（只执行既有脚本）/ `mode=script`（编译生成脚本后执行）两种模式。

### 文档

| 技能 | 用途 |
|---|---|
| `ae-pptx` | PowerPoint `.pptx` 创建、编辑、读取与视觉验证；支持 HTML 生成 SVG 图表配图、可选调用文生图模型生成插图（需全局可执行的 `officecli` 命令，缺失时按技能步骤 0 安装） |

### 音频与多媒体

| 技能 | 用途 |
|---|---|
| `ae-qwen3-tts` | 文字转音频（TTS）：预置音色、音色设计、语音克隆，批量生成与种子复现（需 Python 3.9+，依赖按需安装） |

### 运维

| 技能 | 用途 |
|---|---|
| `ae-linux-remote-ops` | SSH 远程操作内网 Linux：命令、SFTP 传输、状态与日志 |

---

## 约定

### 技能之间禁止交叉引用

每个技能都是**自包含**的：可以被单独拷走独立使用。

- 技能内**不得出现**其它技能的名称，也不得残留已删除技能的悬空名
- 需要"这个场景该找谁"时，只描述**职责边界**（例如"浏览器端到端测试不在本技能范围内"），不点名任何技能
- 该约束由 `npm run validate` 自动校验，违规直接报错

### 产物路径

| 类型 | 路径 |
|---|---|
| 持久产物 | `<cwd>/ae/<skill-slug>/` |
| 临时产物 | `<cwd>/ae/<skill-slug>/tmp/` |
| 日志 | `<cwd>/ae/logs/<skill-slug>/` |

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀（`ae-e2e-test` → `e2e-test`）。

### 配置

统一从 `ae.jsonc` 读取，查找顺序：

1. 环境变量 `AE_CONFIG` 指向的文件
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`
4. `~/.ae.jsonc`

**每个技能只读自己同名顶层 key**，互不干扰：

```jsonc
{
  "$schema": "https://gitee.com/jiangqiang1996/ai-agent-engine/raw/master/ae.schema.json",

  "ae-linux-remote-ops": {
    "host": "10.0.0.1",
    "user": "app",
    "passwordEnv": "SSH_PASSWORD"
  }
}
```

`$schema` 指向远端的 `ae.schema.json`（JSON Schema），编辑器据此提供补全与校验。
用远端 URL 而非本地相对路径，是为了让**单技能安装**（只装 `skills/<name>/`）也能正常提示。
配置样例见 [`ae.jsonc.example`](ae.jsonc.example)。

---

## 开发

```bash
npm install      # 仅安装 devDependencies（yaml）
npm run validate # 规范校验（含跨技能引用检查）
npm run sync     # 同步共享脚本到各技能
npm test         # 单元测试（技能脚本 + 仓库工具，含校验器回归测试）
npm run check    # sync --check + validate + test（提交前必跑）
npm run doctor   # 全量自检（含外部工具探测）
```

- 规范真源（仓库内唯一）：[AGENTS.md](AGENTS.md)
- 技能编写规范：[docs/skill-authoring.md](docs/skill-authoring.md)
- 仓库开发规范：[docs/development.md](docs/development.md)

---

## 许可

[GPL-3.0-or-later](LICENSE)。第三方组件声明见 [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)。
