# AE 工程工作流插件（omp 版）

AE（AI Agent Engine）的 oh-my-pi 移植版：纯资产插件包，提供需求 → 设计 → 实施 → 审查的工程工作流方法论。**零 custom tool、零 extension JS、零 rules、零捆绑 MCP**——只有技能、代理与两个确定性脚本。

## 安装

**远程安装（推荐）**：把仓库根 [README.md](../README.md#快速开始安装更新与卸载) 或
[docs/INSTALL.md](../docs/INSTALL.md) 中的一键提示词复制给任意 omp 会话即可——代理会克隆 gitee
仓库（分支 `oh-my-pi`）到 `~/.omp/ai-agent-engine`，登记 marketplace 并按全局/项目级安装。
不支持直接 `omp plugin marketplace add <gitee-url>`（git 源只克隆默认分支，`master` 无 catalog）。

**本地开发链路**：marketplace 根是**仓库根**（`.omp-plugin/marketplace.json`，plugin `source: ./ae-omp-plugin`）：

```bash
# 1) 添加 marketplace（本地开发：仓库根即 marketplace；CLI 要求显式 ./ 前缀）
omp plugin marketplace add ./.

# 2) 安装——两种模式
# 全局（user scope，默认）：所有项目可用
omp plugin install ae@ae-marketplace
# 项目级（project scope）：仅当前项目可用；启用时遮蔽同名全局安装
omp plugin install ae@ae-marketplace --scope project

# 或直接链接插件目录（不经 marketplace；Windows 无符号链接特权时 EPERM）
omp plugin link ./ae-omp-plugin
```

安装后 `/reload-plugins` 刷新技能与命令。双 scope 共存时，升级/卸载/启停必须显式指定范围：
`omp plugin upgrade|uninstall|enable|disable ae@ae-marketplace --scope user|project`；
省略 `--scope` 的 upgrade 会重装所有已装 scope。

> **代理发现门控（实测，omp 18.1.14）**：marketplace 安装的插件其 `agents/` 只在
> `enabledProviders` 含 `claude-plugins` 时被 task 工具发现（`skills/` 走 omp-plugins
> provider 默认可发现）。需在 omp 配置中加入：
>
> ```yaml
> enabledProviders:
>   - claude-plugins
>   - omp-plugins
>   - native
> ```

## 测试

```bash
npm run test                                     # 仓库根目录执行
node tests/omp-plugin/run-tests.mjs --skip-integration   # 无 omp CLI/模型时只跑 L1+L2
```

三层验证：L1 静态契约（catalog/manifest/frontmatter/协议一致性/交叉引用）、L2 脚本行为
（scope-analyze 与 review-proof 正负例，临时 git 仓库）、L3 集成发现（`omp plugin doctor`、
headless `omp -p` 会话验证 7 技能与 2 代理真实可见、user/project 双 scope 安装与项目内可见性，
均含阴性对照）。omp 无专用 plugin test 命令；官方测试面为 doctor / link / headless 会话 /
`~/.omp/logs/` 日志四件套，L3 即按此构建。

## 经典用法

四阶段主链：

```text
/skill:ae-prd 设计一个多租户数据隔离方案
/skill:ae-design
/skill:ae-work
/skill:ae-review
```

单点能力：`/skill:ae-review mode:report-only`（只审查）、`/skill:ae-fix frontend|backend`、
`/skill:ae-test unit|api|e2e`、`/skill:ae-doc-gen`（Office/PDF）。OCR 审查与测试分诊不经技能入口，
由编排层派 task 代理 `ocr-reviewer` / `test-triage`。

工作规则：需求不清先澄清；审查先定范围（scope-analyze 确定性路由）；交付必须验证（审查证明
metadata.json + Git 授权证据）；浏览器操作走 omp browser prelude；Git/远程写操作需明确授权。

## 能力清单

### 技能（7 个，`/skill:<name>` 调用）

| 技能 | 用途 |
| --- | --- |
| `ae-prd` | 需求澄清与 PRD 产出（含深度追问模式），产物落 `ae/prds/` |
| `ae-design` | 设计文档：架构/接口/数据模型/测试用例/实现单元，产物落 `ae/designs/` |
| `ae-work` | 实施编排：任务分析 → 并行派发开发 persona → 验证 → 交付门禁 |
| `ae-review` | 代码/文档/设计审查：确定性范围路由 + 并行 persona 审查 + 合并层 + 审查证明 |
| `ae-test` | 测试三模式：unit（技术栈路由）/ api（流程编排）/ e2e（browser prelude） |
| `ae-fix` | 修复两模式：frontend（DOM 诊断+browser 验证）/ backend（根因分析+debug/lsp） |
| `ae-doc-gen` | Office/PDF 文档生成与编辑（eval Python/JS 路径，含中文 PDF/公式/图表约束） |

### 代理（2 个，task 派发）

| 代理 | 用途 |
| --- | --- |
| `ocr-reviewer` | 代码审查主引擎：直调上游 [open-code-review](https://github.com/alibaba/open-code-review) CLI delegate 模式获取审查规格后执行审查 |
| `test-triage` | 测试失败根因分诊：确定性规则 1/2/4/5 + 语义真源对齐（规则 3），输出 TestTriageResult |

其余审查/设计/开发 persona 不注册为代理——由 `scope-analyze.mjs` 构建完整 prompt，编排层派通用 task 子代理（见 `ae-review/references/persona-catalog.md`）。

### 脚本（技能内嵌，编排层经 bash 调用）

| 脚本 | 用途 |
| --- | --- |
| `ae-review/scripts/scope-analyze.mjs` | 审查范围 → 文件分类 → persona 路由 → goals 推断 → per-persona prompt 构建 |
| `ae-review/scripts/review-proof.mjs` | 交付门禁：git 指纹 + 审查输出一致性校验 + sha256 → 写 `ae/reviews/<run-id>/metadata.json` |

## 前置依赖

| 依赖 | 用途 | 安装 |
| --- | --- | --- |
| Git ≥ 2.41 | 审查范围/指纹 | 系统级 |
| Node.js ≥ 18 | 两个 .mjs 脚本 | 系统级 |
| `ocr` CLI | ocr-reviewer 代理（delegate 模式无需 LLM 配置） | `npm i -g @alibaba-group/open-code-review` |
| Python 3.10+ | ae-doc-gen（eval kernel） | 系统级；库按技能指引 pip 安装 |
| ffmpeg/ffprobe | ae-test e2e 视频佐证（可选） | 系统级 |

## 可选配置

模型角色映射（`~/.omp/agent/config.yml` 或 `.omp/config.yml`）：

```yaml
modelRoles:
  smol: <provider/fast-model>      # AE 原 $quick
  default: <provider/default>      # AE 原 $standard
  slow: <provider/strong-model>    # AE 原 $deep
  vision: <provider/vision-model>  # AE 原 $vision
```

文档查询 MCP（可选，非捆绑）：

```json
// .omp/mcp.json
{
  "mcpServers": {
    "context7": { "type": "http", "url": "https://mcp.context7.com/mcp", "enabled": true }
  }
}
```

GitHub 代码搜索：启用 omp `github.enabled`（需 gh CLI）替代原 gh_grep MCP。

## 产物目录

```
ae/
├── prds/        # 需求文档
├── designs/     # 设计文档（按维度分文件）
├── work/        # 实施记录
└── reviews/     # 审查报告与 <run-id>/metadata.json 审查证明
```

## 能力边界与实现路径

- 浏览器操作：omp browser prelude（命名 tab、observe/click/fill/screenshot/evaluate）
- 会话交接/fork/后台任务：omp 原生（/handoff、/fork、bash async、hub）
- 文档生成：eval（Python/JS）生成 + read 回读验证，约束见 `ae-doc-gen`
- 图片/视频理解：`read ?q=` vision 问答与抽帧组合
- 审查证明防伪：git 指纹一致性 + 流程约束（无会话历史校验，SKILL.md 注明）

## 包结构与 omp 规范合规

```
仓库根（marketplace 根）          插件目录（plugin 根）
├── .omp-plugin/
│   └── marketplace.json         # catalog：name/owner/plugins[].source=./ae-omp-plugin
└── ae-omp-plugin/
    ├── package.json             # name/version/license（GPL-3.0-or-later）；无 omp.extensions
    ├── .claude-plugin/
    │   └── plugin.json          # Claude 兼容 manifest：name/version/author/license
    ├── LICENSE                  # GPLv3 全文，随包分发
    ├── README.md
    ├── skills/                  # 7 个，一层非递归（SKILL.md 仅 name+description）
    │   └── <skill>/references|scripts/   # 经 baseDir 相对路径访问，不受一层限制
    └── agents/                  # 2 个，frontmatter 键白名单（name/description/tools/output）
```

合规要点（对照 `omp://marketplace.md`、`omp://task-agent-discovery.md`、`omp://skills/authoring-extensions.md`）：
catalog 位于 marketplace（仓库）根且必填 `name/owner.name/plugins`；plugin entry 必填 `name/source`，
相对 source 以 `./` 开头并在 marketplace 根内解析；技能目录一层非递归、frontmatter 仅 `name/description`；
代理经 Claude-plugin 路径发现（需 `claude-plugins` provider，见安装节）。

## 开源协议

**GPL-3.0-or-later**，与仓库根 `package.json` 及 `LICENSE` 一致；插件包内附 LICENSE 全文，
catalog 与两个 manifest 的 `license` 字段同源。测试套件 L1 断言四处协议字符串一致。
