# 开发规范（AE Skills）

本仓库是 **Agent Skills 合集**。开发时必须遵守以下规范。

---

## 1. 仓库结构

```
ai-agent-engine/
├── skills/          # ★ 唯一真源：所有技能
├── tools/           # 仓库内部工具（校验、同步、测试），不随技能分发
├── docs/            # 文档
├── package.json     # 仅 devDependencies
└── README.md
```

**真源原则**：`skills/` 下的一切就是分发内容。`tools/` 是仓库内部设施，**不得**被技能依赖。

---

## 2. 核心约束：宿主无关

技能必须能在**任意**支持 [Agent Skills 规范](https://agentskills.io/specification) 的 AI 代理中工作。

### 禁止

| 类别 | 示例 |
|---|---|
| 宿主专属名 | `opencode`、`~/.config/opencode/`、`.opencode/` |
| 宿主专属配置 | `opencode.json`、`config.skills.paths` |
| 宿主专属 frontmatter | `mode: subagent`、`steps:`、`tools:` 映射、`model: $scenario` |
| 宿主专属占位符 | `$ARGUMENTS` |
| 宿主专属工具名 | `question`、`Task`、`subagent_type` |
| 宿主专属能力调用 | `调用 \`ae-xxx\` 工具` |

### 改为能力抽象措辞

| 不要写 | 改写为 |
|---|---|
| 使用 `question` 工具 | 使用宿主的交互式提问能力（常见别名 AskUserQuestion / question） |
| 调用 Task 工具 | 派发子代理（若宿主支持子代理派发能力） |
| 通过 `glob` 查找 | 使用宿主的文件搜索能力 |
| 用 `bash` 执行 | 使用宿主的命令执行能力 |

### 并行/降级范式

多角色技能统一这样表述：

> 若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；
> 若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

---

## 3. 技能编写

完整规范见 [skill-authoring.md](skill-authoring.md)。要点：

- frontmatter 只有 6 个合法字段：`name`（必须等于目录名）、`description`（≤1024，中英触发词）、`license`、`compatibility`（≤500）、`metadata`（string→string）、`allowed-tools`
- 正文 ≤500 行，深度内容拆到 `references/`
- 引用文件只用一层深：`references/x.md`、`scripts/y.mjs`
- 角色卡放 `references/roles/<role>.md`，固定 5 段：职责 / 触发条件 / 输入契约 / 输出契约 / 工作流

---

## 4. 产物、配置与日志约定

| 类别 | 路径 |
|---|---|
| 持久产物 | `<cwd>/ae/<skill-slug>/` |
| 临时产物 | `<cwd>/ae/<skill-slug>/tmp/` |
| 日志 | `<cwd>/ae/logs/<skill-slug>/` |
| 配置 | `<cwd>/ae.jsonc` → `~/.ae.jsonc` |

- `<skill-slug>` = 技能目录名去掉 `ae-` 前缀
- 跨技能**只读**允许，跨技能**写入**禁止
- 每个技能只读 `ae.jsonc` 中与自己同名的顶层 key

共享逻辑放 `tools/shared/`，由 `tools/sync-shared.mjs` 同步进各技能的 `scripts/lib/`，
保证仓库内单一真源、同时技能可被单独拷走使用。

---

## 5. 代码风格

### 命名

| 类型 | 格式 | 示例 |
|---|---|---|
| 技能目录 | `kebab-case` + `ae-` 前缀 | `ae-review` |
| 脚本 | `kebab-case.mjs` | `scope-analyze.mjs` |
| 测试 | `kebab-case.test.mjs` | `aggregate.test.mjs` |
| 角色卡 | `kebab-case.md` | `api-design-reviewer.md` |
| 变量 / 函数 | `camelCase` | `resolveConfigPath` |
| 常量 | `SCREAMING_SNAKE_CASE` | `BLOCKING_SEVERITIES` |

### 脚本规范

- **零外部依赖**（仅 Node 标准库）；需要依赖时在技能目录放 `package.json`，首次使用时 `npm install`
- Node ≥ 18，ESM（`.mjs`）
- **模板字面量里禁止写正则**：JS 模板字面量会吞掉 `\.` 之类的反斜杠，导致正则被静默改写。
  正则一律写在正则字面量里，或先提取到变量。`tools/validate.mjs` 会检查这一点。
- 脚本必须处理错误并给出可读信息，**不得**把原始堆栈抛给用户
- 退出码：0 成功，1 失败，2 有告警

### 格式

- 缩进 2 空格
- 单引号
- 尾随逗号（多行时）
- 注释使用中文，公共 API 用 JSDoc

---

## 6. 测试

```bash
npm test          # 运行所有技能脚本的单元测试
```

- 测试文件放 `skills/<name>/tests/*.test.mjs`
- 使用 Node 内置 `node:test` + `node:assert/strict`
- 测试必须能在**不安装可选依赖**的情况下通过（如 pdf 依赖、Java 运行时）
- 外部命令的探测逻辑要单独测试（存在 / 不存在两条路径）

---

## 7. 校验

```bash
npm run validate   # 规范校验
npm run sync       # 同步共享脚本
npm run check      # 同步检查 + 校验 + 测试
npm run doctor     # 全量自检（含外部工具探测）
```

`tools/validate.mjs` 检查项：

1. frontmatter 字段与取值、`name` == 目录名
2. 正文行数、相对引用文件是否存在
3. 脚本语法、模板字面量转义隐患
4. 禁用词扫描
5. 产物路径归属
6. 目录名通用词黑名单

**任何改动后必须 `npm run check` 全绿。**

---

## 8. Git 工作流

### 分支命名

| 类型 | 格式 | 示例 |
|---|---|---|
| 功能 | `feat/<描述>` | `feat/add-review-role-cards` |
| 修复 | `fix/<描述>` | `fix/config-lookup-order` |
| 重构 | `refactor/<描述>` | `refactor/skills-layout` |
| 文档 | `docs/<描述>` | `docs/authoring-spec` |
| 测试 | `test/<描述>` | `test/aggregate-strategies` |

### 提交规范

```
<类型>(<范围>): <简短描述>

<详细描述>（可选）
```

类型：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`

- 每次提交只做一件事，内容可独立运行
- 禁止 WIP、禁止调试代码
- 禁止提交密钥、Token、密码

### 危险操作授权

对当前工作区执行 `reset --hard`、`clean -fd`、覆盖 checkout、rebase、删除分支、pull 合并等
**可能改变或丢弃本地状态**的操作前，必须取得用户对目标仓库、目标分支和具体命令的明确授权。

授权 destructive 操作**不等于**授权 push、force push、PR、release、跳过 hooks 或修改 Git 配置——
这些仍需单独明确授权。

---

## 9. 发布

分发方式为纯 `npx skills`：

```bash
npx skills add <owner>/<repo>
npx skills add <owner>/<repo> --skill ae-prd -a claude-code
npx skills add <owner>/<repo> --list
```

因此仓库必须满足：

- 技能位于 `skills/<name>/SKILL.md`（标准发现路径）
- 目录名与 `name` 一致
- 不包含 `dist/`、`node_modules/` 等构建产物（`npx skills` 会自行排除 `node_modules`）
- 体积可控：单技能建议 < 1 MB
