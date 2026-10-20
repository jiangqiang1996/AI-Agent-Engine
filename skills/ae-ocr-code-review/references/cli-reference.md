# OCR CLI 参考（delegate 流程视角）

命令与 schema 以 ocr v1.12.9 实测为准；更低版本按"CLI 版本兼容性"降级。

## 产物落盘位置

所有 `ocr` 命令的 JSON 输出用命令执行能力重定向到下列文件，不落在仓库根目录：

| 命令 | 输出文件 | 内容 |
|------|---------|------|
| `ocr delegate preview` | `ae/ocr-code-review/tmp/preview.json` | 待审查文件清单 + 模式/范围元数据 |
| `ocr scan --preview` | `ae/ocr-code-review/tmp/scan.json` | 全项目文件枚举 |
| `ocr delegate rule` | `ae/ocr-code-review/tmp/rules.json`（分批时为 `rules-batch-N.json`） | 按规则内容分组的审查规则 |
| 背景摘要 | `ae/ocr-code-review/tmp/background.md` | 背景超限时的摘要文件（供 `-B` 使用） |

命令与状态另记入 `ae/logs/ocr-code-review/<run-id>.log`。

## 子命令

| 命令 | 用途 |
|------|------|
| `ocr delegate preview` | 待审查文件清单 + 模式/范围元数据（`from`/`to`/`commit`/`merge_base`） |
| `ocr delegate rule <path...>` | 按规则内容分组返回审查规则；路径不限于 diff 内文件 |
| `ocr scan --preview` | 全项目文件枚举（零 LLM 调用；`--preview` 可写作 `-p`） |
| `ocr --version` | 确认 CLI 版本（`--format` 需要 v1.9.0+） |

`ocr scan` 去掉 `--preview` 会直接调用 LLM 执行审查，delegate 流程**必须始终带 `--preview`**（provider/模型等参数与本流程无关）。delegate 两个子命令的 `--format` 支持 `text|json`（sarif 不支持）；`scan` 另支持 sarif。

## 通用参数（`preview` / `rule` 均支持）

| 参数 | 说明 |
|------|------|
| `--from <ref>` / `--to <ref>` | range 模式的源/目标 ref |
| `-c, --commit <hash>` | 单提交模式（vs 其父提交） |
| `--repo <path>` | 仓库根（默认当前目录）；跨目录、子目录、worktree、CI 环境必用，避免 preview 输出与预期分支不符 |
| `--rule <path>` | 自定义 rule.json 路径（默认读项目根 `.opencodereview/rule.json`） |
| `--exclude <patterns>` | 逗号分隔的 gitignore 风格排除模式，与 rule.json 的排除规则合并 |
| `-b, --background <text>` | 业务需求背景（回显在输出 `background` 字段供审查参照） |
| `-B, --background-file <path>` | 从 Markdown 文件读取背景（优先于 `-b`） |
| `-f, --format <text\|json>` | 输出格式；审查流程固定用 `json` |
| `--max-git-procs <n>` | git 子进程并发上限（默认 16），一般无需调整 |

`ocr scan` 的参数差异：支持 `--path`（逗号分隔目录/文件收敛范围）、`--exclude`、`-b`、`--repo`、`--format`、`-o <file>`（结果写文件）；**没有 `-B/--background-file`、`--from/--to/--commit`**。

## JSON 输出 schema（实测）

### `ocr delegate preview`

顶层：`schema_version`、`mode`（workspace/range/commit）、`repository`（仓库绝对路径）、`total_files`、`reviewable_count`、`excluded_count`、`total_insertions`、`total_deletions`、`reviewable_files[]`、`excluded_files[]`。

- `reviewable_files[]` 条目：`path`、`status`（modified/added/deleted/untracked 等）、`insertions`（**新增行数**口径）、`deletions`
- `excluded_files[]` 条目：`path` + 排除原因
- 范围元数据按键缺席规律出现：
  - workspace — 无 `from`/`to`/`commit`/`merge_base` 键
  - range — 有 `from`、`to`、`merge_base`
  - commit — 有 `commit`；且 `background` 字段默认携带**提交信息**
- 解析一律按**缺键防御**处理，保留存在的字段供第四步构造 git 命令

### `ocr scan --preview`

顶层：`files[]`、`total_files`、`reviewable_count`、`excluded_count`、`total_insertions`。

- `files[]` 条目：`path`、`status`（恒为 `scan`）、`insertions`（**整文件行数**口径）、`deletions`、`will_review`、`exclude_reason`（仅被排除时出现）
- `--exclude` 命中项**保留在 `files[]` 中**，以 `will_review=false` + `exclude_reason=user_exclude` 标注；过滤统一按 `will_review == true`
- `exclude_reason` 常见值：`default_path`（node_modules、构建产物等）、`unsupported_ext`（如 `.md`/`.txt` 文档类）、`user_exclude`
- 点目录（`.opencodereview/`、`ae/` 等）**会**进入枚举，其中 JSON 等受支持扩展名默认 `will_review=true`——project 模式命令必须携带 `--exclude "ae/ocr-code-review/**"`

### `ocr delegate rule`

顶层：`schema_version`、`groups[]`。

- `groups[]` 条目：`group_id`（**单次调用内**的顺序编号）、`source`（`system` 内置 / `project` 来自 rule.json）、`pattern`（匹配的 glob）、`files[]`、`rule`（Markdown 规则文本）
- `merge_system_rule: true` 时，`rule` 文本 = 系统规则 + `## User-Specific Rules (Mandatory)` 段拼接的自定义规则
- 跨批合并以 `pattern` + `source` 为键归并，`group_id` 冲突属预期行为
- `groups[].rule` 文本特征决定该分组启用哪些角色卡，见 [persona-catalog.md](persona-catalog.md)

## 自定义项目规则（`.opencodereview/rule.json`）

项目根目录创建该文件即可注入项目专属审查规则；自定义规则生效时在汇总报告标注"已应用"。

```json
{
  "rules": [
    {
      "path": "src/**/*.ts",
      "rule": "## 项目审查规则\n- HTTP 调用一律经共享 request 封装，检查超时与重试配置\n- 异步函数必须有错误处理，禁止吞异常\n- 公共 API 的参数与返回值类型标注完整",
      "merge_system_rule": true
    }
  ]
}
```

字段说明：
- `path` — 文件匹配 glob 模式
- `rule` — Markdown 格式的审查指令
- `merge_system_rule` — `true` = 追加到系统规则；`false` = 替换系统规则

**编码硬约束**：该文件必须为 **UTF-8 无 BOM**。带 BOM 时 preview/rule/scan 全部子命令报 `load rules: unmarshal project rule: invalid character 'ï' looking for beginning of value`——遇到此报错先检查 BOM。可用命令执行能力配合宿主的无 BOM 写文件能力修正（部分 Windows shell 的 `Set-Content -Encoding UTF8` 会写入 BOM，改用显式指定无 BOM 编码的写法），修正前先取得用户同意——审查流程对该文件只读。

## 背景上下文超限（`-B/--background-file`）

`--background-file` 有两个独立上限：原始文件 ≤ 1 MiB，净化后内容 ≤ 8000 字符；任一超限都会中止命令。命令报错后：
1. 不要静默截断原文件
2. 对原始材料做摘要，保留需求、约束、验收标准等审查关键信息
3. 摘要写入 `ae/ocr-code-review/tmp/background.md`，以 `-B` 重试；短摘要也可经 `-b` 传入，但未经校验的文本直接拼进双引号 shell 模板会有展开风险（`$()`、反引号、引号、变量引用），传参前确认转义安全。重试时去掉原 `--background-file` 参数，避免再次加载超限文件

## CLI 版本兼容性（`--format` 与降级路径）

- `--format json` 需要 ocr v1.9.0+；`ocr --version` 确认，低版本升级：`npm install -g @alibaba-group/open-code-review`
- 若 `preview` / `rule` 带 `--format json` 报错 `unknown flag: --format`：去掉该参数重跑，后续流程改用文本输出；保留文本中的模式、ref、文件、规则等显式信息，文本输出按原文阅读（JSON 解析器只用于 JSON 输出），schema 中缺失的字段在文本模式下同样可能缺席
- 其他错误（非 `unknown flag`）：报告错误并停止对应流程，降级与兜底策略见 [edge-cases.md](edge-cases.md)
