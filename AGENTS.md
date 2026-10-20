# AI Agent Engine (AE Skills)

- 本仓库是 **Agent Skills 合集**。面向使用者的可分发能力**只以 `skills/` 下定义为真源**。
- 本文件只约束开发当前仓库的会话，不会作为技能用户侧资产打包。
- `tools/`、`docs/`、`ae/` 等内容属于仓库内部开发、调试或运行产物，不是技能用户侧资产真源。

---

## 一、硬性约束

违反以下任一条，`npm run validate` 直接报错。

1. **宿主无关**：技能内容不得出现任何宿主专属语法、插件、工具名、配置键或路径（清单见 §3.5）。
2. **分发形态**：纯 `npx skills` 分发。技能必须位于 `skills/<name>/SKILL.md`，且**目录名 == frontmatter `name`**。
3. **统一前缀**：技能目录名必须以 `ae-` 开头（命名空间隔离，避免与他人技能撞名）。
4. **高内聚低耦合**：技能可被单独拷走独立使用，不依赖任何其它技能。
5. **零交叉引用**：技能内**不得出现其它技能的名称**，也不得残留已删除技能的悬空名。
6. **脚本可用**：所有 `.mjs` 必须通过 `node --check`，且无模板字面量转义隐患。
7. **改动后必跑**：`npm run check`（同步检查 + 规范校验 + 单元测试）必须全绿。

---

## 二、目录结构

```
skills/<name>/              # 技能，可单独拷走独立使用
  SKILL.md                  # 唯一必需文件
  references/               # 渐进披露的细则（.md）
    roles/<role>.md         # 角色卡：技能的内部实现细节
  scripts/                  # 可执行脚本（.mjs）
  tests/                    # 脚本单元测试（*.test.mjs）
tools/                      # 仓库内部工具，不随技能分发
  shared/                   # 共享脚本真源
  shared-map.json           # 共享脚本分发清单
  validate.mjs              # 规范校验器
  sync-shared.mjs           # 共享脚本同步器
  run-tests.mjs             # 脚本测试运行器
  doctor.mjs                # 全量自检
docs/                       # 仓库内部文档
ae.schema.json              # 用户配置文件 ae.jsonc 的 JSON Schema
ae.jsonc.example            # 配置样例（$schema 指向远端 schema）
```

---

## 三、技能规范

### 3.1 命名

| 项 | 规则 |
|---|---|
| 目录名 / `name` | 必须一致，必须以 `ae-` 开头 |
| 字符集 | `^[a-z0-9]+(-[a-z0-9]+)*$`（仅小写字母/数字/连字符，无首尾/连续连字符） |
| 长度 | ≤ 64 字符 |
| 禁用名 | `test` `build` `deploy` `docs` `utils` `helper` `common` `skill` `agent` `command` 等通用词（见 `GENERIC_DIR_NAMES`） |

角色卡命名 `<role>.md`，放在 `references/roles/` 下。

### 3.2 Frontmatter

只允许 Agent Skills 规范的 **6 个字段**，多一个就报错。

```yaml
---
name: ae-example              # 必填，== 目录名
description: 一句话说清「做什么 + 什么时候用」   # 必填，≤1024 字符
license: GPL-3.0-or-later      # 可选
compatibility: 运行前置条件    # 可选，≤500 字符
metadata:                     # 可选，值必须全是字符串
  author: ae-skills
  version: 1.0.0
  ae-group: 测试
allowed-tools: Bash Read      # 可选，空格分隔的字符串
---
```

- `description` 是技能召回的**唯一依据**，必须覆盖中英文触发词。
- `compatibility` 必须与**实际依赖一致**：没脚本就别写「需要 Node.js 以运行本技能附带脚本」。

### 3.3 正文结构

正文 ≤ **500 行**（超了会有 WARN）。超长内容拆到 `references/`，SKILL.md 只留主干。

推荐骨架：

```markdown
# 技能名

## 角色          # 这个技能扮演什么角色
## 何时使用      # 什么时候用
## 何时不使用    # 什么时候不用（只描述职责边界，不点名其它技能）
## 执行流程      # 分步骤、可操作
## 实现要求      # 硬约束：改什么、不改什么
## 产物与日志    # ae/<slug>/ 与 ae/logs/<slug>/
## 安全边界      # 禁止动作
## 完成标准      # 可勾选的验收项
```

**相对引用必须真实存在**：`references/xxx.md`、`scripts/xxx.mjs`。
写法：`` `references/xxx.md` `` 或 `[标题](references/xxx.md)`。

### 3.4 零交叉引用（硬性）

技能**不得**提到其它技能的名称——既不允许引用现存技能，也不允许残留已删除技能的悬空名。

- ❌ `浏览器端到端测试 → 使用 ae-e2e-test`
- ✅ `浏览器端到端测试与取证 → 属于端到端测试范畴`

「不适用场景」只写**职责类别**（前端 / 后端 / 端到端测试 / 单元测试 / 需求追问 …），
让调用方自己决定交给谁。

技能**内部**的相对引用（`references/`、`scripts/`）不受此约束。

> 校验实现：`tools/validate.mjs` 的 `findCrossSkillReferences()`，
> 扫描 `SKILL.md` + `references/**/*.md` + `scripts/**/*.{mjs,js}`，
> 匹配形如 `ae-<slug>` 的标识符（slug 至少两段，避免误伤 `ae-config` 等文件名）。

### 3.5 宿主无关（硬性）

| 禁止 | 替代写法 |
|---|---|
| `opencode` / `.opencode/` / `~/.config/opencode` | 「宿主的交互式提问能力」「宿主的文件读取能力」 |
| `$ARGUMENTS` | 描述性参数名，如 `mode=script` |
| `subagent_type` / `mode: subagent` | 描述角色卡调度语义 |
| `model: $xxx` | 不声明具体模型 |
| `` `@frontend-dev` `` 等 @代理 寻址 | `references/roles/<role>.md` 角色卡 |
| `AskUserQuestion` / `question` 工具 | 「宿主的交互式提问能力」 |
| `` `xxx` 工具 `` | 「技能」 |

> 可执行形式：`tools/validate.mjs` 的 `FORBIDDEN_PATTERNS` 与 `HOST_AGENT_NAMES`。

### 3.6 多模式技能（`mode=`）

一个技能覆盖两类差异明显的工作时，用**模式**分流，而不是拆成两个技能。

| 模式 | 入口 | 改动量 | 典型例子 |
|---|---|---|---|
| `dev` | 从零/按需求实现 | 按需求自由设计 | 新建页面、新增接口 |
| `fix` | 先诊断再改 | **最小改动** | 修 bug、修样式 |

写法要点：

1. **模式判定表**放在 SKILL.md 靠前位置，说明触发条件与判定细则。
2. **护栏必须按模式分段**——「不改测试代码、最小改动、不引入新功能」这类约束
   只在 `fix` 模式生效，混在一起会污染 `dev` 模式。
3. 共享部分（上下文检测、实现规范、验证闭环）**只写一份**，不要复制。
4. 每个模式一张角色卡，放在 `references/roles/`。
5. 用户显式给 `mode=xxx` 时严格照办；未给时按判定表推断，拿不准先问一句。

现有多模式技能：`ae-frontend`（dev/fix）、`ae-backend`（dev/fix）、`ae-e2e-test`（test-only/script）。

### 3.7 角色卡

复杂技能可把子职责拆成角色卡，放在 `references/roles/<role>.md`：

```markdown
# 角色：<名称>

> 模式：<dev|fix>（如适用）

## 职责          # 这个角色负责什么
## 触发条件      # 什么时候用这张卡
## 输入契约      # 需要什么输入
## 输出契约      # 产出什么
## 工作流        # 步骤
## 边界          # 不做什么
```

角色卡是**技能内部实现细节**，不是技能之间的接口。角色卡不得引用其它技能。

### 3.8 脚本

- 放 `scripts/`，扩展名 `.mjs`，纯 Node 标准库优先，不引第三方依赖。
- 必须通过 `node --check`。
- **模板字面量里不要写单反斜杠 + 非转义字符**（`\.` 会被 JS 吞掉）。用 `RegExp` 构造或写 `\\.`。
- 写操作前先确认目标路径与权限归属。
- 密码、令牌一律走环境变量，不落配置文件、不进日志。
- 不得写死技能名。需要感知归属时，从脚本自身路径推导
  （见 `tools/shared/officecli.mjs` 的 `resolveOwningSkillName()`）。

多技能共用同一份脚本时：真源放 `tools/shared/`，在 `tools/shared-map.json` 登记分发目标，
执行 `npm run sync` 写入各技能副本。`npm run check` 的第一步会检测副本漂移。

### 3.9 产物路径

```
ae/<skill-slug>/            # 持久产物
ae/<skill-slug>/tmp/        # 临时产物
ae/logs/<skill-slug>/       # 日志
```

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀。

**归属唯一**：一个 `ae/<slug>/` 只属于一个技能，其它技能不得写入。
登记在 `tools/validate.mjs` 的 `AE_DIR_OWNER`；可被多技能共享的目录登记在 `SHARED_AE_DIRS`。
校验器用 `WRITE_CONTEXT` 关键词识别「产出上下文」中的越界写入。

把测试代码写进**目标项目自身**的测试目录（如 `tests/`、`src/test/`）是允许的例外。

### 3.10 配置

统一从 `ae.jsonc` 读取，查找顺序（先命中先用）：

1. 环境变量 `AE_CONFIG` 指向的文件
2. `<cwd>/ae.jsonc`
3. 从 `<cwd>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

**每个技能只读自己同名顶层 key**，互不干扰。样例见 `ae.jsonc.example`，
其 `$schema` 指向远端 `ae.schema.json`（单技能安装时本地没有该文件，故用远端 URL）。

---

## 四、仓库工具

| 命令 | 作用 |
|---|---|
| `npm run validate` | 规范校验（结构 / frontmatter / 正文 / 脚本 / 禁用词 / 产物归属 / 跨技能引用） |
| `npm run sync` | 把 `tools/shared/` 的共享脚本同步到各技能 |
| `npm test` | 运行 `skills/**/tests/*.test.mjs` |
| `npm run check` | `sync --check` + `validate` + `test`（**提交前必跑**） |
| `npm run doctor` | 全量自检 + 外部工具探测（仅提示，不阻断） |

---

## 五、新增 / 删除技能时的同步清单

| 位置 | 动作 |
|---|---|
| `skills/<name>/` | 目录名 == frontmatter `name`，带 `ae-` 前缀 |
| `tools/validate.mjs` `AE_DIR_OWNER` | 登记 `ae/<slug>/` 产物的归属技能 |
| `tools/validate.mjs` `SHARED_AE_DIRS` | 声明可被多技能共享的 `ae/<dir>/` |
| `tools/shared-map.json` | 登记需要下发的共享脚本副本 |
| `.claude-plugin/plugin.json` | 增删 `skills` 条目 |
| `README.md` / `AGENTS.md` | 同步技能清单 |
| `ae.schema.json` | 若该技能有配置项，补充其顶层 key |
| `ae.jsonc.example` | 同步配置样例 |

删除技能时，**必须**清理所有残留引用，否则跨技能引用校验会报「悬空技能引用」。

---

## 六、当前技能集合

| 分组 | 技能 |
|---|---|
| 需求 | `ae-grill` |
| 开发与修复 | `ae-frontend` `ae-backend` |
| 测试 | `ae-unit-test` `ae-integration-test` `ae-e2e-test` `ae-e2e-suite` |
| 文档与运维 | `ae-pptx` `ae-linux-remote-ops` |

> `ae-e2e-test` 面向**用例级**（写/跑单个 spec）；`ae-e2e-suite` 面向**工程级**（分层、基建、完整套件、覆盖率、CI）。

---

## 七、参考文档

- 仓库开发规范：[docs/development.md](docs/development.md)
- 技能编写规范：[docs/skill-authoring.md](docs/skill-authoring.md)
