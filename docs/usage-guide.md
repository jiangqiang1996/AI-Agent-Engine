# 使用指南

AE Skills 是一组可移植的 AI 代理技能。技能由宿主的技能发现机制加载并按需激活——你不需要记命令，直接用自然语言提出需求即可。

> 安装方式见 [INSTALL.md](INSTALL.md)；配置说明见 [configuration.md](configuration.md)。

---

## 1. 核心概念

### 技能是自动触发的

每个技能在 `SKILL.md` 的 `description` 中声明了「做什么」和「何时使用」。宿主在启动时读取全部技能的一句话描述，当你的请求匹配某个描述时自动加载该技能的完整说明。

所以：

- 想用某个技能时，**直接说出你要做的事**，不必指定技能名
- 想强制走某个技能的流程时，可以显式点名（例如「用 ae-prd 走一遍需求澄清」）
- 一次请求可能触发多个技能，宿主会按需组合

### 角色卡（role card）

多角色协作的技能（`ae-review`、`ae-design`、`ae-work` 等）把每个角色写成一张**角色卡**：`references/roles/<role>.md`，固定 5 段：

```
# 角色：<中文角色名>
## 职责        ## 触发条件        ## 输入契约        ## 输出契约        ## 工作流
```

角色卡是纯 Markdown，不绑定任何宿主。执行时：

- 宿主**支持子代理派发** → 并行分派，每卡一份独立上下文
- 宿主**不支持** → 在当前会话内顺序执行同一批角色卡

两种模式产出格式完全一致。

### 三条路径约定

| 类型 | 路径 |
|---|---|
| 持久产物 | `<cwd>/ae/<skill-slug>/` |
| 临时产物 | `<cwd>/ae/<skill-slug>/tmp/` |
| 日志 | `<cwd>/ae/logs/<skill-slug>/` |

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀。例如 `ae-pdf` 写到 `ae/pdf/`，日志写到 `ae/logs/pdf/`。

跨技能**只读**允许（`ae-design` 可以读 `ae/prd/`），**写入**禁止。

---

## 2. 典型工作流

### 从零做一个功能

```
1. 澄清需求     →  ae-prd        产出 ae/prd/<topic>-<日期>/
2. 产出设计     →  ae-design     产出 ae/design/<topic>-<日期>/
3. 实施         →  ae-work       产出代码与测试
4. 验证         →  ae-align-verify  设计→代码→单测→接口测试→E2E
5. 审查         →  ae-review     产出 ae/review/<run-id>/
6. 提交         →  ae-commit
```

### 只做审查

说「审查这些改动」即可，`ae-review` 会：

1. 运行 `scripts/scope-analyze.mjs` 判定范围 → 选出审查角色 → 生成每个角色的提示词
2. 并行（或顺序）执行角色卡
3. 运行 `scripts/aggregate.mjs` 合并去重、解决冲突
4. 运行 `scripts/write-proof.mjs` 写入结构化审查证明

也可以指定范围：

```
审查 ae/design/ 下的所有设计文档
审查这次提交改动的所有文件
审查 src/ 目录，但排除测试文件
```

### 只做测试

| 需求 | 技能 |
|---|---|
| 单元测试：生成、执行、覆盖率 | `ae-unit-test` |
| 接口测试：业务流程编排 + 接口边界 | `ae-api-test` |
| 浏览器 E2E：脚本编写 + 执行取证 | `ae-e2e-test` |
| 完整 E2E 工程：分层勘察、基建搭建、失败归因 | `playwright-verify` |

### 文档

| 需求 | 技能 |
|---|---|
| 任意 Office 文档的高级操作 | `ae-officecli` |
| Word 文档 | `ae-docx` |
| PowerPoint | `ae-pptx` |
| Excel（公式、透视表、条件格式） | `ae-xlsx` |
| PDF 读取/创建/合并/拆分/转 Markdown | `ae-pdf` |

`ae-officecli` 系列技能的**步骤 0 会自动检测 `officecli` 是否已安装**，未安装则按优先级安装（npm → brew → scoop → 官方安装脚本），已安装则直接使用。

### 媒体降级

当你的模型**不支持**直接读取图片/音频/视频时：

| 技能 | 作用 | 后端优先级 |
|---|---|---|
| `ae-image` | 图片 → Markdown 描述 | 配置的视觉接口 → 本地 tesseract → 元信息 |
| `ae-audio` | 音频 → Markdown 转写 | 配置的转写接口 → 本地 whisper → 元信息 |
| `ae-video` | 视频 → 关键帧描述 + 音轨转写 | 同上（需要 ffmpeg） |

配置视觉/转写接口见 [configuration.md](configuration.md#各技能可用配置)。

---

## 3. 常用技能速查

### 需求与设计

| 技能 | 用途 |
|---|---|
| `ae-prd` | 需求澄清，产出需求文档 |
| `ae-grill` | 深度追问方案决策，一问一答推进共识 |
| `ae-design` | 架构、接口、数据模型、测试用例、验收标准 |
| `ae-spec-html` | 需求规格与源码双向同步 |
| `ae-brainstorm` | 5 视角多角色发散讨论 |
| `ae-slides-outline` | 幻灯片大纲生成与迭代修改 |
| `ae-prototype-preview` | 原型文档 → 多页面 HTML 静态原型 |

### 实施与交付

| 技能 | 用途 |
|---|---|
| `ae-work` | 按设计或直接任务实施 |
| `ae-align-verify` | 对齐验证流水线（6 步，可指定范围） |
| `ae-task-loop` | 目标驱动的自包含迭代执行器 |
| `ae-backend-fix` | 后端错误分析与修复 |
| `ae-frontend-fix` | 前端视觉/交互/联调/a11y 修复 |
| `ae-commit` | 生成合规提交信息并本地提交 |
| `ae-merge-branch` | 分支 / worktree 变更合并与验证 |

### 审查与测试

| 技能 | 用途 |
|---|---|
| `ae-review` | 通用审查（代码/文档/设计/配置/测试用例） |
| `ocr-code-review` | 规则驱动的源码审查（OpenCodeReview delegate 模式） |
| `ae-unit-test` / `ae-api-test` / `ae-e2e-test` | 三层测试 |
| `playwright-verify` | 完整 E2E 测试工程 |

### 元能力

| 技能 | 用途 |
|---|---|
| `ae-skill-creator` | 创建符合 Agent Skills 规范的技能 |
| `ae-agent-creator` | 创建可移植角色卡 |
| `ae-prompt-optimize` | 六维度提示词优化 |
| `ae-project-explore` | 任意文件集合的结构画像 |
| `ae-save-experience` | 经验沉淀（solution → rules） |
| `ae-work-report` | 日报 / 周报 / 阶段总结 |
| `ae-my-code-changes` | 查询本人指定时间内的代码变更 |

---

## 4. 按场景速查

| 我想… | 用 |
|---|---|
| 把一个模糊想法变成清晰需求 | `ae-prd` |
| 在动手前把方案问透 | `ae-grill` |
| 让设计覆盖架构/接口/数据/测试 | `ae-design` |
| 让现有代码对齐设计 | `ae-work` |
| 查这次改动有没有问题 | `ae-review` |
| 找出是谁在什么时候改了什么 | `ae-my-code-changes` |
| 写点测试 | `ae-unit-test` / `ae-api-test` / `ae-e2e-test` |
| 出一份日报/周报 | `ae-work-report` |
| 读一个 PDF | `ae-pdf` |
| 改一个 Excel（含公式） | `ae-xlsx` |
| 做一个 PPT | `ae-pptx` |
| 看懂一张截图/一段录音/一个视频 | `ae-image` / `ae-audio` / `ae-video` |
| 查数据库 | `ae-sql` |
| 操作内网 Linux 服务器 | `linux-remote-ops` |
| 开发微信小程序 | `wechatide-skill` |

---

## 5. 边界与注意事项

### 技能不做什么

- **不做远程写操作**：不提供 push、建 PR、发 Issue、Release 的流程
- **不代替授权**：Git 写操作、破坏性文件操作需要你明确授权
- **不假设宿主能力**：技能按能力抽象描述，遇到宿主不支持的能力会降级执行而非报错
- **不猜语法**：涉及外部 CLI（如 `officecli`）时，技能会先跑 `help` 而不是猜参数

### 外部工具与网络

部分技能需要外部工具或网络（见 [INSTALL.md](INSTALL.md#外部依赖)）。缺失时技能会明确提示并给出安装方式，不会静默失败。

### 敏感信息

- 提交类技能会硬阻断敏感文件（`.env*`、`*.pem`、`*.key`、`credentials*` 等）
- 配置里的密钥请用**环境变量名**间接引用，不要写进 `ae.jsonc`

---

## 6. 目录与文档

| 路径 | 内容 |
|---|---|
| `skills/<name>/SKILL.md` | 技能入口（frontmatter + 说明） |
| `skills/<name>/references/` | 深度文档，按需加载 |
| `skills/<name>/references/roles/` | 角色卡 |
| `skills/<name>/scripts/` | Node.js 脚本（零依赖或技能自带 `package.json`） |
| `skills/<name>/tests/` | 该技能脚本的单元测试 |
| `ae.jsonc` | 配置（项目级；全局用 `~/.ae.jsonc`） |
| `ae/` | 运行产物 |

相关文档：

- [INSTALL.md](INSTALL.md) —— 安装、升级、卸载
- [configuration.md](configuration.md) —— 配置项
- [media-policy.md](media-policy.md) —— 媒体降级策略（可粘贴进项目指令文件）
- [skill-authoring.md](skill-authoring.md) —— 编写自己的技能
- [development.md](development.md) —— 仓库开发规范
