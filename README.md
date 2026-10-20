# AE Skills

**通用 Agent Skills 合集** —— 一组可移植的 AI 代理技能，覆盖需求追问、前后端开发与修复、三层测试、PPTX 文档与服务器运维。
遵循 [Agent Skills 规范](https://agentskills.io/specification)，可安装到 **Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、Cline、Windsurf、Amp、Roo Code、Kiro、OpenClaw** 等 40+ 宿主。

- 纯 **SKILL.md + Node.js 脚本**，无插件、无宿主 SDK、无运行时服务
- 每个技能**高内聚、低耦合**：可以只装一个独立使用，技能之间**零交叉引用**
- 零 npm 依赖起步：脚本只用 Node 标准库，需要时用外部 CLI

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

# 先看看有哪些技能（不安装）
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --list
```

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
| `ae-pptx` | PowerPoint `.pptx` 创建、编辑、读取与视觉验证（需全局可执行的 `officecli` 命令，缺失时按技能步骤 0 安装） |

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
