# 仓库开发规范

> **规范以 [AGENTS.md](../AGENTS.md) 为准**（仓库内的唯一真源，由 `npm run validate` 强制执行）。
> 本文是它的展开说明：补充工作流、背景与示例。

本文约束**本仓库的维护者**，不随技能分发给使用者。

---

## 1. 目录结构

```
skills/<name>/              # 技能，可被单独拷走独立使用
  SKILL.md                  # 唯一必需文件
  references/               # 渐进披露的细则（.md）
    roles/<role>.md         # 角色卡：技能的内部实现细节
  scripts/                  # 可执行脚本（.mjs / .js）
  tests/                    # 脚本单元测试（*.test.mjs）
tools/                      # 仓库内部工具，不随技能分发
  shared/                   # 共享脚本真源
  shared-map.json           # 共享脚本分发清单
  validate.mjs              # 规范校验器
  sync-shared.mjs           # 共享脚本同步器
  run-tests.mjs             # 脚本测试运行器
  doctor.mjs                # 全量自检
docs/                       # 仓库内部文档
```

`skills/` 下**只有** `SKILL.md` 与脚本属于用户侧资产；`tools/`、`docs/`、`ae/` 都不是。

---

## 2. 宿主无关（硬性）

技能内容**不得**出现任何宿主专属语法、插件、工具名、配置键或路径。

| 禁止 | 说明 | 替代写法 |
|---|---|---|
| `opencode` / `.opencode/` / `~/.config/opencode` | 宿主专属名与路径 | 「宿主的交互式提问能力」「宿主的文件读取能力」 |
| `$ARGUMENTS` | 宿主专属占位符 | 描述性参数名，如 `mode=script` |
| `subagent_type` / `mode: subagent` | 宿主专属 frontmatter | 描述角色卡调度语义 |
| `model: $xxx` | 宿主专属场景变量 | 不声明具体模型 |
| `` `@frontend-dev` `` 等 | 宿主专属 @代理 寻址 | `references/roles/<role>.md` 角色卡 |
| `AskUserQuestion` / `question` 工具 | 宿主专属工具名 | 「宿主的交互式提问能力」 |
| `` `xxx` 工具 `` | 把技能当工具叫 | 「技能」 |

`tools/validate.mjs` 的 `FORBIDDEN_PATTERNS` 与 `HOST_AGENT_NAMES` 是该约束的可执行形式。

---

## 3. 技能之间禁止交叉引用（硬性）

每个技能都必须**自包含**：可以被单独拷走独立使用。

- 技能内**不得出现**其它技能的名称（现存技能名与已删除技能的悬空名都不允许）。
- 需要表达"这个场景不归我管"时，只描述**职责边界**，不点名任何技能。

  ✅ `浏览器端到端测试与取证 → 属于端到端测试范畴`
  ❌ `浏览器端到端测试 → 使用 ae-e2e-test`

- 技能**内部**的相对引用（`references/xxx.md`、`scripts/xxx.mjs`）不受此约束。

校验实现：`tools/validate.mjs` 的 `findCrossSkillReferences()`，扫描
`SKILL.md` + `references/**/*.md` + `scripts/**/*.{mjs,js}`，
匹配形如 `ae-<slug>` 的标识符（slug 至少两段，避免误伤 `ae-config` 等文件名）。

新增/删除技能时，务必同步：

| 位置 | 动作 |
|---|---|
| `tools/validate.mjs` `AE_DIR_OWNER` | 登记 `ae/<slug>/` 产物的归属技能 |
| `tools/validate.mjs` `SHARED_AE_DIRS` | 声明可被多技能共享的 `ae/<dir>/` |
| `tools/shared-map.json` | 登记需要下发的共享脚本副本 |
| `.claude-plugin/plugin.json` | 增删 `skills` 条目 |
| `README.md` / `AGENTS.md` | 同步技能清单 |

---

## 4. 产物路径约定

```
ae/<skill-slug>/            # 持久产物
ae/<skill-slug>/tmp/        # 临时产物
ae/logs/<skill-slug>/       # 日志
```

`<skill-slug>` = 技能目录名去掉 `ae-` 前缀。

**归属唯一**：一个 `ae/<slug>/` 目录只属于一个技能，其它技能不得写入。
校验器通过 `AE_DIR_OWNER` + 写入上下文关键词（`WRITE_CONTEXT`）识别越界写入。

---

## 5. 共享脚本

同一份逻辑被多个技能使用时：

1. 真源放 `tools/shared/<name>.mjs`
2. 在 `tools/shared-map.json` 登记分发目标
3. 执行 `npm run sync` 把副本写入各技能的 `scripts/`
4. `npm run check` 的第一步 `sync-shared.mjs --check` 会检测漂移

共享脚本**不得**写死技能名。需要感知归属时，从脚本自身路径推导
（见 `tools/shared/officecli.mjs` 的 `resolveOwningSkillName()`）。

---

## 6. 提交前检查

```bash
npm run check
```

等价于：

| 命令 | 检查内容 |
|---|---|
| `node tools/sync-shared.mjs --check` | 共享脚本副本是否漂移 |
| `node tools/validate.mjs` | 目录结构、frontmatter、正文、脚本语法、禁用词、产物归属、**跨技能引用** |
| `node tools/run-tests.mjs` | `skills/**/tests/*.test.mjs` |

`npm run doctor` 额外探测外部工具（git / node / officecli / playwright 等）是否可用，仅提示不阻断。

---

## 7. 命名

- 技能目录名统一 `ae-` 前缀，避免与他人技能撞名。
- 禁止过于通用的目录名（`test`、`build`、`docs`、`utils` 等，见 `GENERIC_DIR_NAMES`）。
- 角色卡命名 `<role>.md`，放在 `references/roles/` 下。
