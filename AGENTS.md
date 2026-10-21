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
6. **脚本可用**：所有 `.mjs` 必须通过 `node --check`，所有 `.py` 必须能被 Python 编译通过，且无模板字面量转义隐患。
7. **改动后必跑**：`npm run check`（同步检查 + 规范校验 + 单元测试）必须全绿。
8. **一步到位**：改动直接落到**最终形态**，不保留变更历史——不做「旧写法 + 新写法」并存，不留兼容别名、
   临时开关、迁移分支、TODO 占位或废弃段落。要改就改成最终样子，被取代的旧形态**直接删除**（含代码、
   文档、配置字段、schema 字段、测试）。

> 第 8 条的判定标准：看 diff 里有没有「同一件事存在两种写法」。有，就是没做到位。
> 例：改了配置字段名就删掉旧字段名与其读取分支，而不是新旧都认；
> 改了脚本输出字段就同步删掉文档里的旧字段名，而不是文档里两个都写。

---

## 二、目录结构

```
skills/<name>/              # 技能，可单独拷走独立使用
  SKILL.md                  # 唯一必需文件
  references/               # 渐进披露的细则（.md）
    roles/<role>.md         # 角色卡：技能的内部实现细节
  scripts/                  # 可执行脚本（.mjs，少数技能用 .py）
  tests/                    # 脚本单元测试（*.test.mjs，Python 技能用 *.py）
tools/                      # 仓库内部工具，不随技能分发
  shared/                   # 共享脚本真源
  shared-map.json           # 共享脚本分发清单
  validate.mjs              # 规范校验器
  sync-shared.mjs           # 共享脚本同步器
  run-tests.mjs             # 脚本测试运行器
  doctor.mjs                # 全量自检
  tests/                    # 仓库工具单测（含校验器回归测试）
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
> 扫描 `SKILL.md` + `references/**/*.md` + `scripts/**/*.{mjs,js,cjs}` + `tests/**/*.{mjs,js,cjs}`。
> 匹配分两轮：先按**仓库内已登记的技能名**精确匹配（覆盖 `ae-grill`、`ae-pptx` 这类单段 slug），
> 再用「`ae-<多段 slug>`」启发式兜底未登记的悬空名。单段且未登记的名字不报错，避免误伤
> `ae-config`（脚本文件名）、`ae-chart`（HTML id）这类合法标识符。
> 随技能分发的第三方打包产物（如 `*.dist.cjs`）跳过扫描。

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

> **适用范围**：宿主无关是**技能内容**级别的约束，`SKILL.md` / `references/` / `scripts/` / `tests/`
> 全部受约束——校验器对上述文件逐个扫描，不只是 `SKILL.md` 正文。
> 例外：随技能分发的第三方打包产物（`*.dist.cjs`）跳过扫描。

> 另有一组**已移除的插件工具名**（`ae-async-bash`、`ae-review-proof`、`ae-specialist-aggregate`、
> `ae-review-scope-analyze`、`ae-test-triage`、`ae-create-session`、`ae-handoff`）同样按硬错误处理——
> 它们是已删除技能的悬空名，出现即报错。

> **officecli 调用形态**（仅对提到 `officecli` 的技能生效，`SKILL.md` 与 `references/` 都查）：
> 官方语法是 `officecli <command> <file>`，文件写在命令前会报参数错误；
> 旧的 SDK 形态 `command=` / `props=` / `path=` / `mode=outline|text|…` / `type=paragraph|…` 一律报错。

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
- **不得写死技能名**。需要感知归属（如决定 `ae/<slug>/` 产物目录、`ae.jsonc` 分片 key）时，
  从脚本自身路径推导（见 `tools/shared/ae-paths.mjs` 的 `resolveOwningSkillName()`）。
  推导失败时抛明确错误，不要退回到写死的名字。
- 脚本入口判定不要把 `process.argv[1]` 与 `import.meta.url` 直接比较：
  经符号链接 / 联接（junction）调用时 Node 会把 `import.meta.url` 解析成 realpath，
  判定恒假、脚本静默不执行。两侧都取 realpath 后再比较，或按脚本文件名后缀判定。
  校验器按「同一个比较表达式」判定，两侧都 realpath 的写法**不算违规**。

**Python 脚本（少数技能）**：技能的运行时依赖不是 Node 时（例如深度学习推理），
允许用 `.py` 实现，规则：

- 目录仍是 `scripts/`，单测放 `tests/*.py`；不与 `.mjs` 混放同一文件。
- `.py` 不受 `node --check` 约束，但必须能被目标 Python 编译通过
  （校验器对每个 `.py` 跑 `python -m py_compile`；环境里没有 `python` 时跳过该检查）。
- 第三方依赖**不随技能分发**，由技能自带的安装脚本按需 `pip install`，
  并在 frontmatter 的 `compatibility` 里写明 Python 版本与依赖。
- 同样适用「不得写死技能名」「产物路径归属」「密钥走环境变量」等硬性约束。
- 技能自测不接入 `npm test`（只跑 `*.test.mjs`），在技能文档里写明自测命令。

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
校验器用 `WRITE_CONTEXT` 关键词识别「产出上下文」中的越界写入——
中英文都覆盖，`<slug>` 后的斜杠可有可无。

产物路径归属同样是**技能内容**级别的约束：`references/` 里描述的写入路径同样受校验。

把测试代码写进**目标项目自身**的测试目录（如 `tests/`、`src/test/`）是允许的例外。

### 3.10 角色卡

角色卡必须放在 `references/roles/<role>.md`；放在 `references/` 根下的角色卡会被校验器报错。

### 3.11 配置

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
| `npm test` | 运行 `skills/**/tests/*.test.mjs` 与 `tools/tests/*.test.mjs` |
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
| 需求与设计 | `ae-grill` |
| 实施与交付 | `ae-frontend` `ae-backend` |
| 测试 | `ae-unit-test` `ae-integration-test` `ae-e2e-test` `ae-e2e-suite` |
| 文档 | `ae-pptx` |
| 音频与多媒体 | `ae-qwen3-tts` |
| 运维 | `ae-linux-remote-ops` |

> 分组名与各技能 frontmatter 的 `metadata.ae-group` 一致，新增技能时两处同步。
> `ae-e2e-test` 面向**用例级**（写/跑单个 spec）；`ae-e2e-suite` 面向**工程级**（分层、基建、完整套件、覆盖率、CI）。
> `ae-qwen3-tts` 是**唯一使用 Python 脚本**的技能，脚本规则见 §3.8。

各技能的作用边界：

| 技能 | 作用 | 边界 |
|---|---|---|
| `ae-grill` | 逐层追问方案决策，一问一答推进共识 | 只追问，不成文、不编码 |
| `ae-frontend` | 前端页面/组件实现与缺陷修复（`mode=dev` / `mode=fix`） | 不碰后端与测试代码 |
| `ae-backend` | 后端接口、数据层、业务逻辑与中间件实现与修复 | 不碰前端与测试代码 |
| `ae-unit-test` | 单元测试生成、执行、覆盖率与失败分诊 | 默认只测后端；不修产品代码（分诊判定为生产缺陷时除外） |
| `ae-integration-test` | 业务流程编排的集成测试：认证、接口边界、数据清理 | 非 HTTP 协议、性能压测不在范围内 |
| `ae-e2e-test` | 用例级浏览器 E2E：执行或生成 Playwright 脚本并取证 | 不搭工程级基建 |
| `ae-e2e-suite` | 工程级 E2E 体系：分层判定、基建、套件、覆盖率、CI | 单个 spec 的回归验证用 `ae-e2e-test` |
| `ae-pptx` | `.pptx` 创建、编辑、读取、排版校验与配图生成 | 只处理 `.pptx`；不产出大纲 |
| `ae-qwen3-tts` | 文字转语音：预置音色、音色设计、语音克隆、批量与复现 | 不做语音识别与音频后期 |
| `ae-linux-remote-ops` | SSH 远程执行命令、SFTP 传文件、状态与日志查看 | 只走 SSH 文本通道；不碰图形界面 |

---

## 七、参考文档

- 仓库开发规范：[docs/development.md](docs/development.md)
- 技能编写规范：[docs/skill-authoring.md](docs/skill-authoring.md)
