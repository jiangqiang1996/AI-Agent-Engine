---
name: ae-officecli
description: 通过官方 officecli 命令行操作 Office 文档（.docx/.xlsx/.pptx），自动检测并按需安装二进制。支持 L1 读取、L2 DOM 编辑、L3 raw XML，内置公式引擎与 HTML/PNG 渲染引擎，支持实时预览、CSS 选择器查询、批量操作、模板合并、文档转储与校验。当需要读写 Office 文档、计算 Excel 公式、渲染文档截图或做批量修改时使用。Use when working with .docx, .xlsx or .pptx files that need real editing, formula evaluation or rendering.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+；officecli 二进制由本技能的 ensure 步骤自动安装；跨平台（Windows/macOS/Linux）
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 文档
---

# OfficeCLI 原生文档操作

用**官方 `officecli` 命令行**操作 Office 文档。单一二进制，无需安装 Office。

## 何时使用

- 需要 Excel **公式计算**（普通库只能存公式，不能算）
- 需要 **HTML / PNG 高保真渲染**（`view html` / `view screenshot`）或 `watch` 实时预览
- 需要 **L3 raw XML** 操作任意 OOXML 元素
- 需要 **CSS 选择器查询**或稳定路径寻址
- 需要批量操作（`batch`）、模板合并（`merge`）或文档转储（`dump`）
- 需要文档校验（`validate`）或问题检测（`view issues`）
- 需要 `refresh` 刷新 TOC 页码与交叉引用
- 需要 `load_skill` 加载融资演示 / 学术论文 / 财务模型等专用规则

## 何时不使用

- PDF 文档 → 用 `ae-pdf`
- 简单的内容录入 → 可先用 `ae-docx` / `ae-pptx` / `ae-xlsx`

---

## 步骤 0：确保 officecli 可用（必做）

**每次会话首次操作 Office 文档前执行一次**，不要跳过。

```bash
node scripts/officecli.mjs ensure
```

输出 JSON：

```json
{ "installed": true, "version": "1.2.3", "channel": "existing", "path": "/usr/local/bin/officecli", "attempts": [] }
```

| 字段 | 含义 |
|---|---|
| `installed` | 是否可用 |
| `version` | 已安装版本 |
| `channel` | `existing`（原本就装了）/ `npm` / `brew` / `scoop` / `install-script` / `failed` |
| `attempts` | 自动安装的尝试记录（含日志路径） |

**若 `installed` 为 `false`**：脚本已按优先级尝试过安装但全部失败。此时**必须停止文档操作**，按脚本输出的指引人工安装其一：

```bash
npm install -g @officecli/officecli     # 全平台
brew install officecli                  # macOS / Linux
scoop install officecli                # Windows
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
# Windows PowerShell:
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

> **一次只用一种安装渠道。** 若此前用 Homebrew 装过，要换渠道请先 `brew uninstall officecli/homebrew-officecli/officecli`。
> 装好后重新执行 `node scripts/officecli.mjs ensure` 确认。

---

## 调用方式

统一通过包装脚本调用，参数原样透传给官方 CLI：

```bash
node scripts/officecli.mjs run -- <officecli 参数…>
```

包装脚本负责：落日志到 `ae/logs/officecli/`、透传 stdout、透传退出码。

**官方 CLI 的参数形态是「命令 + 文件 + 位置参数 + 标志」**，不是 `key=value`：

```bash
officecli <command> <file> [path] [--flag value]
```

对照示例：

| 用途 | 正确写法 |
|---|---|
| 创建 | `node scripts/officecli.mjs run -- deck.pptx create` |
| 加一页 | `node scripts/officecli.mjs run -- deck.pptx add / --type slide --prop title="Q4 Report"` |
| 改属性 | `node scripts/officecli.mjs run -- report.docx set /body/p[1]/r[1] --prop bold=true` |
| 读元素 | `node scripts/officecli.mjs run -- deck.pptx get '/slide[1]/shape[1]' --json` |
| 查询 | `node scripts/officecli.mjs run -- report.docx query 'run:contains(TODO)' --json` |
| 查看 | `node scripts/officecli.mjs run -- report.docx view outline` |
| 校验 | `node scripts/officecli.mjs run -- report.docx validate` |

**元素路径**是 1 起始的路径寻址（不是 XPath）：`/Sheet1/A1`、`/slide[1]`、`/body/p[3]/r[1]`、`/body/tbl[1]/tr[2]/tc[1]`。

**属性**用 `--prop key=value` 传递，多个 `--prop` 可叠加。值的格式：

| 类型 | 可接受格式 | 示例 |
|---|---|---|
| 尺寸 | cm / in / pt / px / 原始 EMU | `2cm`、`1in`、`72pt`、`914400` |
| 颜色 | 十六进制 / 命名 / RGB / 主题色 | `#FF0000`、`FF0000`、`red`、`rgb(255,0,0)`、`accent1` |
| 字号 | 裸数字或 pt 后缀 | `14`、`14pt`、`10.5pt` |
| 间距 | pt / cm / in / 倍数 | `12pt`、`1.5x`、`150%` |

---

## 命令清单

| 命令 | 说明 |
|---|---|
| `create` | 创建空白 `.docx` / `.xlsx` / `.pptx`（按扩展名定类型） |
| `view` | 查看内容：`outline` `text` `annotated` `stats` `issues` `html` `svg` `screenshot` `pdf` `forms` |
| `get` | 获取元素及其子节点（`--depth N`、`--json`） |
| `query` | 选择器查询，支持 `and`/`or`、列名行筛选（`row[Salary>5000]`） |
| `set` | 修改元素属性（`--prop`、选择器、Excel 原生路径、`--find`/`--replace`） |
| `add` | 添加元素（`--type`，或 `--from <path>` 克隆） |
| `remove` | 删除元素 |
| `move` | 移动元素（`--to`、`--index`、`--after`、`--before`） |
| `swap` | 交换两个元素 |
| `validate` | 按 OpenXML schema 校验 |
| `batch` | 一次执行多条操作（stdin / `--input` / `--commands`） |
| `dump` | 导出为可回放的 batch JSON（可指定子树路径） |
| `merge` | 模板合并：把 `{{key}}` 占位符替换为 JSON 数据 |
| `raw` | 查看某文档部件的原始 XML |
| `raw-set` | 通过 XPath 修改原始 XML |
| `add-part` | 新增文档部件（页眉、图表等） |
| `open` / `save` / `close` | 驻留模式的开启 / 落盘 / 关闭 |
| `watch` | 启动本地实时预览服务器 |
| `refresh` | 重算 TOC 页码、`PAGE` 与交叉引用（docx） |
| `import` | 导入文件（如 CSV 到某个 sheet） |
| `load_skill` | 打印内置专用技能规则 |
| `plugins` / `config` / `install` / `mcp` | 插件、配置、安装与 MCP 注册 |
| `help` | 内置帮助 |

> 命令与标志以 `officecli --help` 与 `officecli help <format> <command>` 的实际输出为准。**不要凭记忆猜参数名。**

---

## 三层策略：L1 → L2 → L3

| 层 | 手段 | 命令 |
|---|---|---|
| **L1 读取** | 语义视图 | `view`（text / annotated / outline / stats / issues / html / svg / screenshot） |
| **L2 DOM 编辑** | 结构化元素操作 | `get` `query` `set` `add` `remove` `move` `swap` |
| **L3 raw XML** | XPath 直改，兜底方案 | `raw` `raw-set` `add-part` `validate` |

**优先使用高层**；L2 表达不了才降到 L3。L1/L2 的输出都可加 `--json` 拿结构化结果。

---

## Help 系统（重要）

**不确定属性名、值格式或命令语法时，先跑 help，不要猜。** 一次 help 胜过「猜测 → 失败 → 重试」循环。

```bash
node scripts/officecli.mjs run -- help                        # 全部命令 + 全局选项
node scripts/officecli.mjs run -- help docx                   # docx 全部元素
node scripts/officecli.mjs run -- help docx paragraph         # 完整 schema：属性、别名、示例
node scripts/officecli.mjs run -- help docx set paragraph     # 只看 set 可用的属性
node scripts/officecli.mjs run -- help pptx set shape         # pptx 形状属性
```

属性名拼错时 CLI 会返回 `suggestion` 与合法取值范围，按提示自纠即可。

---

## load_skill：先判断是否需要专用规则

开始文档操作前，先判断任务是否匹配下表场景。匹配时**先执行 `load_skill` 加载对应规则**，再遵循其输出操作。

| 匹配场景 | 应加载的 skill |
|----------|---------------|
| 融资演示、Morph 动画 | `pitch-deck`、`morph-ppt`、`morph-ppt-3d` |
| 学术论文（期刊 / 会议 / 学位论文） | `academic-paper` |
| 财务模型、数据仪表板 | `financial-model`、`data-dashboard` |

```bash
node scripts/officecli.mjs run -- load_skill pitch-deck
node scripts/officecli.mjs run -- load_skill academic-paper
node scripts/officecli.mjs run -- load_skill financial-model
```

不匹配任何专用场景时无需加载，直接用本技能即可。

---

## 典型工作流

### 1. 自愈式文档生成

```bash
# 创建
node scripts/officecli.mjs run -- report.pptx create
# 填充
node scripts/officecli.mjs run -- report.pptx add / --type slide --prop title="Q4 Results"
node scripts/officecli.mjs run -- report.pptx add '/slide[1]' --type shape --prop text="Revenue: $4.2M" --prop x=2cm --prop y=5cm --prop size=28
# 验证
node scripts/officecli.mjs run -- report.pptx view outline
node scripts/officecli.mjs run -- report.pptx validate
# 看效果并修正
node scripts/officecli.mjs run -- report.pptx view issues --json
node scripts/officecli.mjs run -- report.pptx view screenshot -o ae/officecli/report.png --page 1-3
```

### 2. 渲染后目视检查（推荐）

```bash
node scripts/officecli.mjs run -- report.pptx view html -o ae/officecli/report.html
node scripts/officecli.mjs run -- report.pptx view screenshot -o ae/officecli/report.png
```

用宿主的图片读取能力查看生成的 PNG，检查文字溢出、元素重叠、配色等只有渲染出来才看得见的问题。

### 3. 批量修改

```bash
node scripts/officecli.mjs run -- budget.xlsx batch --input updates.json --json
node scripts/officecli.mjs run -- budget.xlsx batch --commands '[{"op":"set","path":"/Sheet1/A1","props":{"value":"42"}}]'
```

批量默认**原子**：任一条失败则整体回滚。`--best-effort` 保留已成功的部分，`--stop-on-error` 遇错即停。

### 4. 模板批量套打

```bash
node scripts/officecli.mjs run -- invoice-template.docx merge out-001.docx --data '{"client":"Acme","total":"$5,200"}'
```

### 5. 学习已有文档并回放

```bash
node scripts/officecli.mjs run -- existing.docx dump -o blueprint.json
node scripts/officecli.mjs run -- new.docx batch --input blueprint.json
```

### 6. 驻留模式（多步操作更快）

```bash
node scripts/officecli.mjs run -- report.docx open
node scripts/officecli.mjs run -- report.docx set /body/p[1]/r[1] --prop bold=true
node scripts/officecli.mjs run -- report.docx set /body/p[2]/r[1] --prop color=FF0000
node scripts/officecli.mjs run -- report.docx close
```

> **用别的程序读文件前先落盘。** officecli 自己的读操作永远看到最新编辑，但驻留进程会延迟写盘。
> 在交给 python-docx / openpyxl / Word / 渲染器 / 上传之前，执行 `save`（落盘并保留驻留）或 `close`（落盘并释放）。
> 空闲几秒后驻留也会自动落盘；需要「每次变更立即落盘」时设置环境变量 `OFFICECLI_RESIDENT_FLUSH=each`。

---

## 输出与退出码

| 退出码 | 含义 |
|---|---|
| `0` | 操作成功落地 |
| `1` | 未落地（进程失败或业务失败，错误信息在 `error` 字段） |
| `2` | 有告警：可能被丢弃的属性，或校验器给出警告 |

> **退出码 2 时必须读 JSON 里的 `success` 字段**，不能只看退出码。`success: true` 表示已落地但有属性被丢弃，`warnings[]` 列出被丢弃项。

错误对象形如：

```json
{ "success": false, "error": { "error": "Slide 50 not found (total: 8)", "code": "not_found", "suggestion": "Valid Slide index range: 1-8" } }
```

错误码：`not_found`、`invalid_value`、`unsupported_property`、`invalid_path`、`unsupported_type`、`missing_property`、`file_not_found`、`file_locked`、`invalid_selector`。

---

## 产物与日志

| 类型 | 路径 |
|---|---|
| 本技能产物（渲染图、HTML 快照等） | `ae/officecli/` |
| 命令日志 | `ae/logs/officecli/` |

未显式指定输出路径时，渲染类结果建议写到 `ae/officecli/` 下。

## 安全边界

- 破坏性操作（`remove`、`move`、`swap`、覆盖式 `batch`）**先向用户确认**
- 不要对用户未提供的文件路径执行写操作
- 不要用 `raw-set` 改写用户未指定的文档部件
- 提交 / 推送等 Git 写操作不在本技能范围内

## 完成标准

- 文档变更已按预期落地（`view` / `get` 回读确认）
- `validate` 无阻断问题
- 需要目视确认时已生成渲染图并检查过
