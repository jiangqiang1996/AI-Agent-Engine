# AE Skills

**通用 Agent Skills 合集** —— 一组可移植的 AI 代理技能，覆盖需求澄清、设计、编码、审查、测试、文档与运维。

遵循 [Agent Skills 规范](https://agentskills.io/specification)，可安装到 **Claude Code、Codex、Cursor、OpenCode、GitHub Copilot、Gemini CLI、Cline、Windsurf、Amp、Roo Code、Kiro、OpenClaw** 等 40+ 宿主。

- 纯 **SKILL.md + Node.js 脚本**，无插件、无宿主 SDK、无运行时服务
- 每个技能**高内聚、低耦合**：可以只装一个，也能整套使用
- 零 npm 依赖起步：脚本只用 Node 标准库，需要时用外部 CLI 或技能自带的 `package.json`

---

## 安装

### 用 `npx skills`（推荐）

```bash
# 安装全部技能到当前项目（交互选择技能与宿主）
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git

# 只装一个技能，装到指定宿主
npx skills add https://gitee.com/jiangqiang1996/ai-agent-engine.git --skill ae-prd -a claude-code

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
| OpenCode / Codex / Cursor / Cline / Amp / Gemini CLI / Copilot | `.agents/skills/` | `~/.config/opencode/skills/` 等 |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |

> 也支持 `gh skill install owner/repo --skill <name>`，发现规则相同。

### 手动安装

把需要的技能目录复制到宿主的技能目录即可（例如 `~/.claude/skills/ae-prd/`）。

---

## 技能目录

### 需求与设计

| 技能 | 用途 |
|---|---|
| `ae-prd` | 需求澄清，产出需求文档（WHAT） |
| `ae-grill` | 深度追问方案决策，一问一答推进共识 |
| `ae-design` | 产出设计文档：架构、接口、数据模型、测试用例、验收标准（HOW） |
| `ae-spec-html` | 需求规格与源码的双向同步 |
| `ae-brainstorm` | 5 视角（乐观 / 批判 / 务实 / 创新 / 系统）多角色发散 |
| `ae-slides-outline` | 幻灯片大纲生成与交互式修改 |
| `ae-prototype-preview` | 原型文档 → 技术栈无关的多页面 HTML 静态原型 |

### 实施与交付

| 技能 | 用途 |
|---|---|
| `ae-work` | 按设计或直接任务实施，产出代码/文档/测试/报告 |
| `ae-align-verify` | 设计→代码→单测→接口测试→E2E 的对齐验证流水线 |
| `ae-task-loop` | 目标驱动的自包含迭代执行器（子代理隔离实施 + 审查闭环） |
| `ae-backend-fix` | 后端错误分析、根因定位、修复与回归验证 |
| `ae-frontend-fix` | 前端视觉、交互、状态、API 联调与无障碍修复 |
| `ae-commit` | 生成合规提交信息并完成本地提交（含敏感文件筛查） |
| `ae-merge-branch` | 分支 / worktree 变更合并与结果验证 |

### 审查

| 技能 | 用途 |
|---|---|
| `ae-review` | 通用审查入口：范围分析 → 角色卡并行审查 → 去重合并 → 修复方案 |
| `ae-ocr-code-review` | 基于 OpenCodeReview delegate 模式的规则驱动源码审查 |

### 测试

| 技能 | 用途 |
|---|---|
| `ae-unit-test` | 单元测试生成、执行与覆盖率分析 |
| `ae-api-test` | 接口级后端测试与业务流程编排 |
| `ae-e2e-test` | 浏览器 E2E 测试脚本编写与执行 |
| `ae-playwright-verify` | 完整 E2E 测试工程：分层勘察、基建搭建、取证、失败归因、视觉确认 |

### 文档

| 技能 | 用途 |
|---|---|
| `ae-officecli` | 官方 officecli CLI 操作 Office 文档（自动检测并按需安装二进制） |
| `ae-docx` | `.docx` 专属操作 |
| `ae-pptx` | `.pptx` 专属操作 |
| `ae-xlsx` | `.xlsx` 专属操作（含公式计算、数据透视表） |
| `ae-pdf` | PDF 创建、合并、拆分、提取、填表、水印、转 Markdown、转图片 |

### 媒体

| 技能 | 用途 |
|---|---|
| `ae-image` | 图片 → Markdown 描述（模型不支持图像输入时的降级通道） |
| `ae-audio` | 音频 → Markdown 转写 |
| `ae-video` | 视频 → 关键帧描述 + 音轨转写 |

### 数据与运维

| 技能 | 用途 |
|---|---|
| `ae-sql` | 通过 JDBC 连接数据库执行 SQL |
| `ae-linux-remote-ops` | SSH 远程操作内网 Linux：命令、SFTP 传输、状态与日志 |

### 元能力

| 技能 | 用途 |
|---|---|
| `ae-skill-creator` | 创建 / 更新符合 Agent Skills 规范的技能目录 |
| `ae-agent-creator` | 创建可移植的**角色卡**（`references/roles/<role>.md`） |
| `ae-prompt-optimize` | 六维度提示词优化，产出可直接复制的优化版 |
| `ae-project-explore` | 任意文件集合的结构与关系画像 |
| `ae-save-experience` | 经验沉淀：先存 solution，再提炼 rules |
| `ae-work-report` | 基于 Git 变更生成日报 / 周报 / 阶段总结 |
| `ae-my-code-changes` | 查询指定时间范围内本人的代码变更 |

---

## 约定

### 产物路径

| 类型 | 路径 |
|---|---|
| 持久产物 | `<cwd>/ae/<skill-slug>/` |
| 临时产物 | `<cwd>/ae/<skill-slug>/tmp/` |
| 日志 | `<cwd>/ae/logs/<skill-slug>/` |

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀（`ae-pdf` → `pdf`）。

### 配置

统一从 `ae.jsonc` 读取，查找顺序：

1. 环境变量 `AE_CONFIG` 指向的文件
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`
4. `~/.ae.jsonc`

**每个技能只读自己同名顶层 key**，互不干扰：

```jsonc
{
  "ae-image":     { "endpoint": "https://api.openai.com/v1/chat/completions", "model": "gpt-4o-mini", "apiKeyEnv": "OPENAI_API_KEY" },
  "ae-officecli": { "timeoutMs": 30000 },
  "ae-pdf":       { "cjkFontPath": "C:/Windows/Fonts/msyh.ttc" }
}
```

详见 [docs/configuration.md](docs/configuration.md)。

---

## 典型流程

```
/ae-prd          # 澄清需求
/ae-design       # 产出设计
/ae-align-verify # 设计→代码→单测→接口测试→E2E 全链路验证
/ae-review       # 审查
```

宿主以「技能」形式加载（由宿主的技能发现机制触发），不依赖任何斜杠命令语法。

---

## 开发

```bash
npm install      # 仅安装 devDependencies（yaml）
npm run validate # 规范校验
npm run sync     # 同步共享脚本到各技能
npm test         # 技能脚本单元测试
npm run doctor   # 全量自检（含外部工具探测）
```

- 技能编写规范：[docs/skill-authoring.md](docs/skill-authoring.md)
- 仓库开发规范：[docs/development.md](docs/development.md)
- 媒体降级策略：[docs/media-policy.md](docs/media-policy.md)

---

## 许可

[GPL-3.0-or-later](LICENSE)。第三方组件声明见 [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES)。
