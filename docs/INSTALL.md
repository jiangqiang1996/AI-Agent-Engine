# 安装与卸载

AE Skills 遵循 [Agent Skills 规范](https://agentskills.io/specification)，通过 `npx skills` 分发，**不依赖任何插件或宿主 SDK**。

---

## 安装

### 方式一：`npx skills`（推荐）

需要 Node.js 22.20 或更高版本。

```bash
# 交互式：选择技能 + 选择宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--skill <名称...>` | 只安装指定技能（可用 `'*'` 表示全部） |
| `--agent <名称...>` | 指定目标宿主（可用 `'*'` 表示全部） |
| `-g, --global` | 安装到用户级目录（所有项目可用） |
| `--list` | 只列出可用技能，不安装 |
| `--copy` | 用复制代替软链接（Windows 或不支持软链接的环境） |
| `-y, --yes` | 跳过所有确认提示（CI 友好） |

示例：

```bash
# 只装一个技能到 Claude Code
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --skill ae-prd -a claude-code

# 装到多个宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git -a claude-code -a cursor -a opencode

# 全局安装全部技能到全部已检测到的宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --skill '*' -g -a '*' -y

# 先看看有哪些技能
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --list
```

GitHub 镜像仓库可用简写：

```bash
npx skills add <owner>/ai-agent-engine
```

### 安装位置

由 `skills` CLI 决定。默认使用**软链接**（canonical 副本在 `.agents/skills/`，各宿主目录软链过去），
软链接不可用时自动降级为复制。

| 宿主 | `--agent` 值 | 项目级路径 | 全局路径 |
|---|---|---|---|
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| GitHub Copilot | `github-copilot` | `.agents/skills/` | `~/.copilot/skills/` |
| Gemini CLI | `gemini-cli` | `.agents/skills/` | `~/.gemini/skills/` |
| Cline | `cline` | `.agents/skills/` | `~/.agents/skills/` |
| Amp | `amp` | `.agents/skills/` | `~/.config/agents/skills/` |
| Roo Code | `roo` | `.roo/skills/` | `~/.roo/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| 通用 | `universal` | `.agents/skills/` | `~/.config/agents/skills/` |

完整清单见 `skills` CLI 的 Supported Agents 文档。

### 方式二：GitHub CLI

```bash
gh skill install <owner>/ai-agent-engine --skill ae-prd --agent claude-code --scope user
```

发现规则与 `npx skills` 一致（`skills/*/SKILL.md`）。

### 方式三：手动复制

不需要 Node.js 时，直接把技能目录复制到宿主的技能目录：

```bash
cp -r skills/ae-prd ~/.claude/skills/ae-prd
```

Windows PowerShell：

```powershell
Copy-Item -Recurse skills\ae-prd $env:USERPROFILE\.claude\skills\ae-prd
```

手动安装的技能不参与 `npx skills update`，需要自行更新。

---

## 验证安装

1. 重启宿主（或执行其重载技能的命令，如 Claude Code 的 `/reload-skills`）
2. 确认技能被识别：向代理提问一个该技能覆盖的问题，看是否触发
3. 检查安装目录：

```bash
ls .agents/skills/          # 项目级
ls ~/.claude/skills/        # 全局（按你的宿主替换）
```

### 外部依赖

多数技能**零安装**即可用。部分技能需要外部工具：

| 技能 | 依赖 | 缺失时 |
|---|---|---|
| `ae-officecli` / `ae-docx` / `ae-pptx` / `ae-xlsx` | `officecli` 二进制 | 技能的**步骤 0 会自动检测并安装**（npm → brew → scoop → 官方安装脚本） |
| `ae-pdf` | 技能目录内的 npm 依赖 | 首次使用时在技能目录执行 `npm install --omit=dev` |
| `ae-image` / `ae-audio` / `ae-video` | 可选：`ffmpeg` / `tesseract` / `whisper`；或配置 `ae.jsonc` 的接口 | 退化为元信息输出，并提示如何配置 |
| `ae-e2e-test` / `ae-playwright-verify` | Playwright 与浏览器内核 | 需用户自行安装（`npx playwright install`） |
| `ae-ocr-code-review` | `ocr` CLI（npm `@alibaba-group/open-code-review`） | 需用户自行安装 |
| `ae-linux-remote-ops` | 无（ssh2 已内置） | — |
| `ae-playwright-verify` | Playwright 与浏览器 | 需用户自行安装 |

检查本机可用性：

```bash
npm run doctor
```

---

## 升级

```bash
npx skills check      # 预览可更新项
npx skills update     # 更新全部已安装技能
npx skills list       # 查看已安装技能
```

软链接模式下，canonical 副本更新后所有宿主立即可见。

---

## 卸载

```bash
# 交互式选择要卸载的技能
npx skills remove

# 指定技能
npx skills remove ae-prd
```

或直接删除对应目录：

```bash
rm -rf .agents/skills/ae-prd ~/.claude/skills/ae-prd
```

---

## 常见问题

**技能没被识别？**

1. 确认安装目录符合上表
2. 确认 `SKILL.md` 存在且 frontmatter 有 `name` 与 `description`
3. 重启宿主（部分宿主需要显式重载）

**Windows 上软链接失败？**

`skills` CLI 会自动降级为复制。也可以显式加 `--copy`。

**技能之间会互相影响吗？**

不会。每个技能只读 `ae.jsonc` 中与自己同名的 key，产物写入各自的 `ae/<slug>/` 目录。

**能只用一个技能吗？**

可以，这是本合集的设计目标。`--skill <名称>` 精确安装，或直接复制单个技能目录。
