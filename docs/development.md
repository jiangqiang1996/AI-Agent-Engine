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
  scripts/                  # 可执行脚本（.mjs / .js / .cjs，少数技能用 .py）
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

`skills/` 整个目录都是**用户侧资产**——`SKILL.md`、`references/`、`scripts/`、`tests/` 会随技能一起分发。
`tools/`、`docs/`、`ae/` 都不是。

> `tests/` 随技能分发是为了让使用者能自行验证脚本；体积敏感时可从发布物中剔除，
> 但仓库内的 `skills/<name>/tests/*.test.mjs` 必须保留（`npm test` 会跑）。

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
| `ae-async-bash` `ae-review-proof` `ae-specialist-aggregate` `ae-review-scope-analyze` `ae-test-triage` `ae-create-session` `ae-handoff` | 已移除的插件工具名（悬空引用） | 描述该能力本身 |

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
`SKILL.md` + `references/**/*.md` + `scripts/**/*.{mjs,js,cjs}` + `tests/**/*.{mjs,js,cjs}`，
匹配形如 `ae-<slug>` 的标识符（slug 至少两段，避免误伤 `ae-config` 等文件名）。
随技能分发的第三方打包产物（如 `*.dist.cjs`）跳过扫描。

新增/删除技能时，务必同步：

| 位置 | 动作 |
|---|---|
| `tools/validate.mjs` `AE_DIR_OWNER` | 登记 `ae/<slug>/` 产物的归属技能 |
| `tools/validate.mjs` `SHARED_AE_DIRS` | 声明可被多技能共享的 `ae/<dir>/` |
| `tools/shared-map.json` | 登记需要下发的共享脚本副本 |
| `.claude-plugin/plugin.json` | 增删 `skills` 条目 |
| `README.md` / `AGENTS.md` | 同步技能清单与分组表 |
| `ae.schema.json` | 若该技能有配置项，补充其顶层 key |
| `ae.jsonc.example` | 同步配置样例 |

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

日志目录同样归属唯一：`ae/logs/<slug>/` 里的 `<slug>` 必须等于本技能 slug，
写错归属（例如把日志写到 `ae/logs/officecli/`）会被校验器直接报错。

> 例外：把测试代码写进**目标项目自身**的测试目录（如 `tests/`、`src/test/`）是允许的，
> 那不属于本仓库的 `ae/` 产物目录。

---

### 4.1 校验器的数值限制

`tools/validate.mjs` 的常量即硬性上限（AGENTS.md §3.1–§3.3 的展开）：

| 常量 | 值 | 约束对象 |
|---|---|---|
| `MAX_NAME_LENGTH` | 64 | frontmatter `name` |
| `MAX_DESCRIPTION_LENGTH` | 1024 | frontmatter `description` |
| `MAX_COMPATIBILITY_LENGTH` | 500 | frontmatter `compatibility` |
| `MAX_BODY_LINES` | 500 | SKILL.md 正文行数（超了是 WARN 不是 ERROR） |
| `ALLOWED_FRONTMATTER` | 6 个字段 | `name` `description` `license` `compatibility` `metadata` `allowed-tools` |
| `SKILL_NAME_PREFIX` | `ae-` | 技能目录名 |
| `NAME_PATTERN` | `^[a-z0-9]+(-[a-z0-9]+)*$` | `name` 字符集 |

这些数值与 [Agent Skills 规范](https://agentskills.io/specification)一致。

---

## 5. 共享脚本

同一份逻辑被多个技能使用时：

1. 真源放 `tools/shared/<name>.mjs`
2. 在 `tools/shared-map.json` 登记分发目标
3. 执行 `npm run sync` 把副本写入各技能的 `scripts/`
4. `npm run check` 的第一步 `sync-shared.mjs --check` 会检测漂移

共享脚本**不得**写死技能名。需要感知归属时，从脚本自身路径推导
（见 `tools/shared/ae-paths.mjs` 的 `resolveOwningSkillName()`）。

---

## 6. 提交前检查

```bash
npm run check
```

`check` = `sync --check` + `validate` + `test`：

| 命令 | 检查内容 |
|---|---|
| `node tools/sync-shared.mjs --check` | 共享脚本副本是否漂移 |
| `node tools/validate.mjs` | 目录结构、frontmatter 字段与数值上限、正文行数、相对引用（含 references/ 内链接）、脚本语法（含 .cjs）、禁用词、产物与日志归属、跨技能引用、脆弱入口守卫、officecli 调用形态 |
| `node tools/run-tests.mjs` | `skills/**/tests/*.test.mjs` 与 `tools/tests/*.test.mjs` |

> Python 技能（见 `ae-qwen3-tts`）的自测不进 `npm test`：用技能自带的
> `python tests/test_tts.py --fast` 跑，退出码 0=通过、1=失败。

`npm run doctor` 额外探测外部工具（git / node / python / officecli / playwright 等）是否可用，仅提示不阻断。

---

## 7. 校验器回归测试

`tools/tests/validate-regression.test.mjs` 把**历史上真实出现过的缺陷**逐个注入临时副本，
断言 `tools/validate.mjs` 能拦住。修 bug 时同步补一条用例，防止规则被悄悄删掉。

```bash
node --test tools/tests/validate-regression.test.mjs
```

---

## 8. 命名

- 技能目录名统一 `ae-` 前缀，避免与他人技能撞名。
- 禁止过于通用的目录名（`test`、`build`、`docs`、`utils` 等，见 `GENERIC_DIR_NAMES`）。
- 角色卡命名 `<role>.md`，放在 `references/roles/` 下。

---

## 9. 发布与用户侧更新

分发形态是纯 `npx skills`（见 [AGENTS.md](../AGENTS.md) §一），没有构建产物与版本号发布流程：

1. 改动落在 `skills/<name>/`，`npm run check` 全绿后提交并推送到 `master`；
2. 用户侧用 `npx skills update` 回源比对 `skills-lock.json` 里的 git 来源，拉到最新内容；
3. 宿主侧目录是否自动生效取决于安装模式：软链接（macOS/Linux 默认）立即生效，Windows 的复制模式由 `update` 重写副本。

```bash
# 用户侧
npx skills list            # 看已安装与来源
npx skills update          # 更新全部
npx skills update ae-grill # 更新指定技能
npx skills remove -s ae-grill -y
```

详细命令表见 [README](../README.md) 的「安装 / 更新 / 卸载」小节。

> 仓库本身不发 npm 包，`package.json` 的 `version` 仅作内部标记，与用户拿到的技能版本无关。
> 技能能力有变化时，同步改 `README.md` 的技能清单表与本节说明，避免文档与实际能力脱节。
