---
name: ocr-code-review
description: 使用 OpenCodeReview (OCR) delegate 模式进行源码审查——文件筛选、规则匹配、diff 获取，子代理并行审查，行级精确定位与强制覆盖率。支持差异审查与全项目审查（所有源码文件，含已提交文件）；Git 仓库全功能，非 Git 目录可用全项目模式。当用户要求代码审查、CR、code review、代码审计，提到"审查"、"review"、"ocr"、"open-code-review"，要求检查某个分支/提交/文件的代码质量，或要求审查整个项目/全部源码时使用。
metadata:
  ae-group: 审查
---

# OCR Delegate 代码审查

使用 [OpenCodeReview](https://github.com/alibaba/open-code-review) CLI (`ocr`) 的 **delegate 模式** 进行确定性、规则驱动的源码审查。OCR 提供工程层：文件筛选、规则解析、范围元数据；实际审查由宿主代理派发的子代理（subagent/task）并行执行，主代理负责派发、覆盖率核对与汇总。

本技能与宿主 AI 软件、目标项目均解耦：子代理派发、文件读写、命令执行一律按能力抽象描述，宿主差异经字段等价映射（见 `references/subagent-dispatch.md`）；项目专属审查规则经 OCR 自身的 `.opencodereview/rule.json` 注入，技能正文零项目假设。

## 适用场景
- 用户要求审查工作区变更、分支差异或指定提交
- 用户要求**审查整个项目 / 所有源码（包括已提交的文件）**
- 用户要求审计特定文件或目录，或"审查并修复"
- 用户提到"代码审查"、"CR"、"review"、"ocr"

## 前置条件
- `ocr` CLI：`npm install -g @alibaba-group/open-code-review`；`--format json` 需 v1.9.0+（`ocr --version` 确认）。未安装、版本过旧的处置见 `references/edge-cases.md`
- 差异模式（workspace / range / commit）要求项目是 Git 仓库且 **Git ≥ 2.41**；全项目模式在非 Git 目录同样可用（此时 rule 命令不可用，走通用审查规则，见 `references/edge-cases.md`）
- 无需配置 LLM —— delegate 模式在 OCR 侧全程零 LLM 调用，子代理即审查执行者
- `ocr` 操作**当前工作目录**的 Git 仓库；跨目录调用时用 `--repo <path>` 指定仓库根
- **运行产物目录**：本次运行的所有中间产物与报告统一写入 `.ocr-review/<run-id>/`（见"运行产物布局"）；`temp/`、仓库根目录等其他位置一律不落盘

## 参考文件索引（按需读取）

| 文件 | 内容 | 读取时机 |
|------|------|---------|
| `references/cli-reference.md` | 子命令与参数、JSON 输出 schema、`.opencodereview/rule.json` 自定义规则、背景超限、版本兼容 | 第一至三步需要字段、参数、schema 细节时 |
| `references/subagent-dispatch.md` | 拆分策略细则、子代理任务模板、派发示例、结果落盘双路径、plan.json 状态机 | 第五步派发前**必读全文** |
| `references/edge-cases.md` | 环境异常、Git 边界、降级与补派策略、通用审查规则文本 | 遇到报错、空清单、非 Git 目录等边界场景时 |

## 审查流程

### 第零步：创建运行目录（run dir）

每次审查对应一个独立目录，全部中间产物落盘于此：

- run-id 格式：`YYYYMMDD-HHmm-<mode>`（`mode` ∈ workspace / range / commit / project / direct），如 `20260923-1530-workspace`
- 完整路径：`<repo 根>/.ocr-review/<run-id>/`；后续步骤的 `<run>` 均指该目录，第一步执行前创建：`mkdir -p .ocr-review/<run-id>/results`（PowerShell 5.1+ 与 POSIX shell 均可用；其他宿主用等价的递归建目录能力）
- **git 忽略**：run dir 是审查产物，不应入库。仓库为 Git 且 `.gitignore` 未包含 `.ocr-review/` 时，将 `.ocr-review/` 追加进 `.git/info/exclude`（本地生效、不改动项目文件）；用户明确要求入库时才写 `.gitignore`。`git status` 与 `ocr scan` 的文件枚举都会看到未忽略的点目录，project 模式命令固定携带 `--exclude ".ocr-review/**"`（见第二步 2B）防止产物混入待审清单
- **同分钟重跑**：run-id 相同的目录直接复用，`preview.json` 等同名产物覆盖，`results/` 先清空再重新派发（重跑 = 全新开始）。同一次运行**内**的补派沿用下一个未用序号追加结果文件（如 g01-b06），已有结果一律保留；禁止用 `-2`、`-now` 等后缀另起目录或文件
- **历史清理**：`.ocr-review/` 下旧 run 目录可整体删除，不影响后续审查；保留最近一次的 report.md 供引用即可

#### 运行产物布局（固定文件名）

```
.ocr-review/<run-id>/
├── preview.json          # workspace / range / commit：ocr delegate preview 输出
├── scan.json             # project：ocr scan --preview 输出（与 preview.json 二选一）
├── rules.json            # 合并后的规则分组（第三步最终产物；通用规则兜底时可省略）
├── rules-batch-N.json    # 可选：rule 分批调用时各批原始输出，N 从 1 起递增；合并后仍产出 rules.json
├── background.md         # 可选：背景超限时的摘要文件（供 -B 使用）
├── plan.json             # 派发清单：批次 ↔ 子代理描述 ↔ 文件列表 ↔ 状态（waiting/done/failed/retried）
├── results/gNN-bNN.md    # 子代理批次结果；NN 为零填充编号；direct 模式无分组时用 g00-bNN
├── report.md             # 最终汇总报告（第六步）
└── fixes.md              # 可选：第七步修复清单（每项：文件、行号、严重级别、改动摘要）
```

**约束**：
- 所有 `ocr` 命令的 JSON 输出重定向到上表对应文件；CLI 的 stderr 留在对话上下文即可，无需落盘
- 产物只写入 `<run>/`；大文件清单、批次划分等派生数据统一由 `plan.json` 承载，避免生成 `*-files.txt`、`wave*.json`、`rule-*.txt` 等碎片文件

### 第一步：确定审查范围

根据用户输入判断审查模式：

| 用户输入 | 模式 | OCR 命令 |
|---------|------|---------|
| "审查我的改动" / 无参数 | workspace | `ocr delegate preview --format json` |
| "审查 feature 分支相对 main 的改动" | range | `ocr delegate preview --from <base> --to <feature> --format json` |
| "审查提交 abc123" | commit | `ocr delegate preview --commit <hash> --format json` |
| "审查整个项目" / "审查所有源码" / "全量审查" | project | `ocr scan --preview --exclude ".ocr-review/**" --format json` |
| "审查这些文件：a.ts b.ts" | direct | 跳过 preview，直接进入第三步 |

用户提供了需求背景（设计文档、验收标准）时，给 `preview` 附加 `-b "<背景摘要>"` 或 `-B <背景文件.md>`；背景随输出回显（JSON 的 `background` 字段），供审查时参照。`ocr scan`（project 模式）**只支持 `-b`**——背景是文件时先摘要再以 `-b` 传入，或直接把背景摘要写进第五步的子代理任务文本（更稳妥，所有模式通用）。超限处理与 shell 引号安全见 `references/cli-reference.md`。

**全项目模式的范围收敛**（`ocr scan`）：默认枚举整个仓库；`--path src` 或 `--path src,scripts` 限定目录/文件；`--exclude '<gitignore 风格模式>'` 追加排除。锁定文件、LICENSE、根配置、点目录内 JSON 默认都会纳入可审查清单；用户只要求"源码"时用 `--path` 收敛并在汇总中说明排除项。细节见 `references/cli-reference.md`。

### 第二步：运行 preview 获取文件清单

完整 JSON schema（各模式的字段差异、缺键规律）见 `references/cli-reference.md`，此处列流程要点。

#### 2A. 差异模式（workspace / range / commit）

在项目根目录执行 `ocr delegate preview`，JSON 输出重定向到 `<run>/preview.json`。解析要点：

- `reviewable_files` — 待审查文件列表（含 `path`、`status`、`insertions`、`deletions`）
  - **以 `(path, status)` 作为文件身份**：workspace 模式下，文件先从索引删除、再以未跟踪文件重建时，同一 `path` 会出现两次，两条记录都要审查
- `excluded_files` — 被排除的文件及原因（**必须向用户报告**）
- `mode`、`from`、`to`、`commit`、`merge_base` — 范围元数据；当前模式不适用的字段**整体缺失（键不存在）**，解析按缺键防御处理；**保留存在的字段，第四步构造 git 命令需要**。commit 模式的 `background` 字段默认携带提交信息
- `total_files`、`reviewable_count`、`excluded_count` — 统计摘要

#### 2B. 全项目模式（project）

执行 `ocr scan --preview --exclude ".ocr-review/**" --format json`（`--preview` 只枚举文件，零 LLM 调用、零网络请求），输出重定向到 `<run>/scan.json`。解析要点：

- `files` — 全量文件列表；每项含 `path`、`insertions`（**整文件行数**口径）、`will_review`、`exclude_reason`
  - 只保留 `will_review == true` 的文件进入后续流程
  - `--exclude` 命中的条目仍保留在 `files` 里，以 `will_review=false` + `exclude_reason=user_exclude` 标注；过滤统一按 `will_review == true`
  - 常见 `exclude_reason`：`default_path`（node_modules、构建产物等）、`unsupported_ext`（不支持审查的扩展名，如 `.md`）、`user_exclude`（命中 `--exclude`）
- `total_files`、`reviewable_count`、`excluded_count`、`total_insertions` — 统计摘要

两种模式的输出形态不同，产出物一致：**一份待审查文件 `(path, status)` 清单**，交给第三步。

**若 `reviewable_count` 为 0**：先区分原因——
- **workspace 模式且工作区干净**（`git status --porcelain` 无输出）：向用户报告"工作区无待审查改动"，建议改用全项目模式或指定分支/提交范围。
- **其他情况**：报告 "未找到可审查文件。已排除 N 个文件（原因：...）。可调整 `.opencodereview/rule.json` 排除规则，或用 `--exclude` 调整范围。"

### 第三步：解析审查规则

将所有待审查文件路径传给 `ocr delegate rule`（**不限文件是否出现在 diff 中**——已提交的存量文件、`.md` 文档同样能解析出规则）：

```bash
ocr delegate rule <path1> <path2> ... --format json
```

**关键**：所有 reviewable 文件路径**一次性传入**；命令行长度受系统限制（Windows 约 8K 字符，POSIX 通常大得多），超出则分批调用后合并。OCR 按规则内容自动分组，JSON 输出重定向到 `<run>/rules-batch-N.json`（单批直接写 `<run>/rules.json`）。

- 每个 group 含 `group_id`、`source`（system / project）、`pattern`、`files`、`rule`（Markdown 规则文本）
- **分批合并**：`group_id` 仅在单次调用内有效，跨批合并必须按 `pattern` + `source`（必要时比对 `rule` 文本）归并同规则组，再统一重新编号；归并结果写 `<run>/rules.json`，batch 文件仅作留档
- **非 Git 目录**：`ocr delegate rule` 会报 "is not a git repository"（project 模式非 Git 目录、direct 模式均可能命中）——此时整体走**通用审查规则**兜底（规则文本见 `references/edge-cases.md`），`rules.json` 省略，流程继续
- **单路径失败**：某路径解析报错时仅对该文件用通用审查规则
- 项目自定义规则文件 `.opencodereview/rule.json` 必须为 **UTF-8 无 BOM**，损坏时 preview/rule/scan 全部报错，处置见 `references/cli-reference.md`

### 第四步：确定每个文件的 diff 获取方式

OCR 只产出文件清单与规则；主代理根据 preview 的范围元数据，为每个文件确定 diff 获取命令，并写入子代理任务：

| 模式 / 文件状态 | diff 获取命令 |
|----------------|--------------|
| range | `git diff <merge_base>..<to> -- <path>` |
| commit | `git show <commit> -- <path>` |
| workspace（已跟踪文件） | `git diff HEAD -- <path>` |
| workspace（未跟踪 / 新建文件） | 直接读取整个文件——整文件都是新代码 |
| project | 直接读取整个文件 |
| direct | 默认直接读取整个文件；用户明确要求"只看改动"时按 workspace 口径取 diff |

- `merge_base`、`to`、`commit` 取自 preview 输出；workspace 模式的比较基线是 `HEAD`
- `status` 为未跟踪/新增的文件，`git diff` 无输出，必须改为直接读文件；子代理任务中按文件标注获取方式，避免子代理对未跟踪文件空跑 diff
- 审查对象是**变更本身**：子代理可读取整文件获取上下文，发现应落在真实存在的代码行上（行号以新文件为准）

### 第五步：派发子代理并行审查

**这是核心步骤。** 审查工作全部由子代理并行执行：主代理把每个规则组拆分为子代理任务，自己负责派发、核对与汇总。**派发前先读 `references/subagent-dispatch.md` 全文**（任务模板、拆分细则、派发示例、结果落盘双路径都在其中），要点：

- 每规则组 ≤ 5 个文件一个子代理，> 5 个按每批 5 个文件拆分
- **行数预算**：`insertions` 双口径——差异模式为新增行数，project 模式为整文件行数；单批总行数建议 ≤ 2000，超 800 行的大文件单独一批
- 任何波次的并发子代理数**不得超过 6 个**；批次总数超过 6 时按规则组/目录**分波派发**（每波 ≤ 6 个子代理），波与波之间串行、波内并行；待审查 > 100 个文件时优先核心源码目录，派发前向用户报告文件总数与分波计划
- 同一波所有子代理任务**一次性并行发起**；子代理类型优先**只读/通用型**（审查不改代码）
- `(path, status)` 重复出现的文件两条记录都进任务清单，条目上用 `@<status>` 后缀区分（如 `src/a.ts@deleted`、`src/a.ts@added`）
- **结果落盘双路径**：有写权限的子代理自行写入 `<run>/results/gNN-bNN.md`；只读型子代理把完整结果文本随最终回复返回，由主代理落盘——两条路径都算正常完成
- 派发前把批次清单写入 `<run>/plan.json`，每批核对后更新其状态（waiting → done / failed / retried）

### 第六步：汇总结果（覆盖率强制）

子代理全部完成后，**先做覆盖率核对，再写报告**：

- **比对基准 = 第二步产出的清单**：workspace/range/commit 用 `preview.json` 的 `reviewable_files`；project 用 `scan.json` 中 `will_review == true` 的文件；direct 用用户指定的文件列表
- 将子代理输出的每文件处置（✅ 已审查 / ⏭️ 跳过）与基准逐一比对——每个文件必须以"已审查"或"跳过（含具体原因）"收尾；发现遗漏须补派子代理，禁止静默省略
- 补派仍失败的文件计入跳过，原因标"审查失败（尝试 N 次）"

报告写入 `<run>/report.md`，并在回复中给出该路径；后续引用本次审查结果一律指向该文件。

```markdown
## 产物与日志

| 类型 | 路径 |
|---|---|
| OCR 预览/规则 JSON | `ae/ocr-code-review/tmp/` |
| 执行日志 | `ae/logs/ocr-code-review/` |

`ocr delegate preview` 与 `ocr delegate rule` 的 JSON 输出请重定向到 `ae/ocr-code-review/tmp/` 下的文件，
不要留在仓库根目录。命令原始输出同时记录到 `ae/logs/ocr-code-review/`。

## 审查汇总

- 范围：<mode>（<from>..<to> / commit <hash> / workspace / 全项目，N 个源码文件）
- 覆盖率：已审查 X / Y（Z%）；跳过 K
  - 跳过明细：<path> — <原因>
- 发现问题：M
  - 🔴 critical：X | 🟠 high：Y | 🟡 medium：Z | 🔵 low：W
- 已排除：N 个文件（<原因>）
- 自定义规则：`.opencodereview/rule.json` <已应用 / 不存在 / 解析失败已兜底>
- 业务背景：<已附加 / 未提供>
- 审查耗时：可选，分波派发时记录波数与各波用时，用于后续任务拆分预算参考

## 详细发现

<按严重级别降序排列子代理输出；同级别内按文件路径分组；子代理输出的 `[待确认]` 标注原样保留>
```

报告策略：
- 🔴 critical / 🟠 high：全部报告，附代码片段与修复建议
- 🟡 medium：附上下文报告，说明触发条件与影响
- 🔵 low：仅报告明确有价值的；疑似误报静默丢弃

### 第七步：修复与复核（可选）

用户要求"审查并修复"时，按严重级别处置：
- 🔴 critical / 🟠 high：直接修改代码，修改范围限于该问题本身
- 🟡 medium：改动小且无歧义时直接修改；否则描述修复方案，留待用户决策
- 🔵 low：跳过，除非一行可改完
- 修复后在报告中列出每个修复对应的文件、行号与改动摘要，并写入 `<run>/fixes.md`

**复核闭环**：修复产生的是新的工作区变更，可用 workspace 模式开一个新 run-id 复审被改动的文件；复审通过后在 `report.md` 的对应修复条目追加"已复核"标注，未通过则回到本步继续修复。用户未要求严格闭环时，提示复审选项即可。

## 参考（References）
- 技能内参考：`references/cli-reference.md`、`references/subagent-dispatch.md`、`references/edge-cases.md`
- OCR 文档：https://open-codereview.ai/docs
- OCR delegate 模式：https://github.com/alibaba/open-code-review
- 项目规则：`.opencodereview/rule.json`
