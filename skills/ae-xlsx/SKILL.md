---
name: ae-xlsx
description: Excel 工作簿（.xlsx）创建、编辑、读取与公式计算技能，内置公式引擎可真正求值，并支持数据透视表、条件格式、数据验证、自动筛选、图表、迷你图等 OOXML 能力，配套风格设计与 HTML 计算验证流程。适用于 .xlsx 的读取、创建、编辑、分析、格式转换与排版校验。Use when creating, editing, reading, computing formulas in or validating Excel .xlsx workbooks.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+；officecli 二进制由步骤 0 的 ensure 自动安装；跨平台（Windows/macOS/Linux）
metadata:
  author: ae-skills
  version: "1.0.0"
  ae-group: 文档
---

# ae-xlsx — Excel 工作簿操作

通过本技能自带的 `scripts/officecli.mjs` 调用**官方 `officecli` 命令行**操作 `.xlsx` 文档，无需安装 Office。**内置公式引擎**，可真正计算 Excel 公式（JS 库只能存储公式，不能计算）。

> **硬性约束**：禁止使用宿主的文件读取能力直接读取 .xlsx 二进制内容，必须通过本技能的操作读取。

## 步骤 0：确保 officecli 可用（必做）

**每次会话首次操作 .xlsx 之前执行一次**，不要跳过。

```bash
node scripts/officecli.mjs ensure
```

输出 JSON：

```json
{ "installed": true, "version": "1.2.3", "channel": "existing", "path": "/usr/local/bin/officecli", "attempts": [] }
```

| 字段 | 含义 |
|---|---|
| `installed` | officecli 是否可用 |
| `version` | 已安装版本 |
| `channel` | `existing`（原本就装了）/ `npm` / `brew` / `scoop` / `install-script` / `failed` |
| `attempts` | 自动安装的尝试记录（含日志路径） |

脚本按 **npm → brew → scoop → 官方安装脚本** 的顺序尝试安装，**一次只试一种渠道**，失败才换下一种。

**若 `installed` 为 `false`**：说明所有渠道都失败了。此时**必须停止文档操作**，把下面的手动安装命令交给用户，任选一种执行，装好后重新跑一次 `ensure` 确认：

```bash
npm install -g @officecli/officecli     # 全平台
brew install officecli                  # macOS / Linux
scoop install officecli                # Windows
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
# Windows PowerShell：
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

> **一次只用一种安装渠道。** 若此前用 Homebrew 装过，要换渠道请先 `brew uninstall officecli/homebrew-officecli/officecli`。

---

## 调用方式

统一通过本技能自带的包装脚本调用，参数原样透传给官方 CLI：

```bash
node scripts/officecli.mjs run -- <officecli 参数…>
```

包装脚本负责：落日志到 `ae/logs/officecli/`、透传 stdout、透传退出码。

**官方 CLI 的参数形态是「命令 + 文件 + 位置参数 + 标志」**，不是 `key=value`：

```bash
officecli <command> <file> [path] [--flag value]
```

| 用途 | 写法 |
|---|---|
| 创建工作簿 | `node scripts/officecli.mjs run -- data.xlsx create` |
| 写单元格 | `node scripts/officecli.mjs run -- data.xlsx set /Sheet1/A1 --prop value="Name" --prop bold=true` |
| 加行/列 | `node scripts/officecli.mjs run -- data.xlsx add /Sheet1 --type row --index 1` |
| 读元素 | `node scripts/officecli.mjs run -- data.xlsx get /Sheet1/A1 --json` |
| 查询 | `node scripts/officecli.mjs run -- data.xlsx query 'Sheet1!row[Salary>5000]' --json` |
| 查看结构 | `node scripts/officecli.mjs run -- data.xlsx view outline` |
| 校验 | `node scripts/officecli.mjs run -- data.xlsx validate` |

元素路径是 1 起始的路径寻址（不是 XPath）：`/Sheet1/A1`、`/Sheet1/B2:D10`、`/sheet[1]`。
属性用 `--prop key=value` 传递，多个 `--prop` 可叠加。

**不确定属性名、值格式或命令语法时先跑 help，不要猜：**

```bash
node scripts/officecli.mjs run -- help xlsx cell
node scripts/officecli.mjs run -- help xlsx set cell
```

---

## 路由关系

- **本技能**：`.xlsx` 文件的入口，提供 Excel 专属元素、路径、属性和专用技能
- **调用入口**：本技能自带的 `scripts/officecli.mjs`，独立可用，不依赖其他技能
- **通用能力**：L1/L2/L3 分层、`watch`、`batch`、raw XML、文档级属性等详见 `ae-officecli` 技能

## 何时使用

- 创建、编辑、分析 Excel 电子表格
- 需要**公式计算**（而非仅存储公式）
- 需要数据透视表（PivotTable）
- 需要条件格式、数据验证、自动筛选
- 需要图表、迷你图（Sparkline）
- 需要将 XLSX 转为 HTML 预览或验证
- 需要排序、合并单元格、冻结窗格

## 何时不使用

- PDF 文档操作用 `ae-pdf`
- Word 文档用 `ae-docx`
- PowerPoint 用 `ae-pptx`
- 需要 raw XML 操作或 CSS 选择器查询直接用 `ae-officecli`

## ⚠️ 重要：判断是否需要加载 Excel 专用技能

仅当当前任务匹配以下专用场景时，先执行 `load_skill` 加载对应规则再操作：

| 名称 | 适用场景 |
|------|----------|
| `financial-model` | 财务模型、场景、预测。不用于通用数据分析（路由到 `excel`） |
| `data-dashboard` | CSV/表格数据 -> KPI/分析/高管仪表板，含图表和迷你图。不用于原始数据跟踪（路由到 `excel`） |

匹配时先加载：

```bash
node scripts/officecli.mjs run -- data.xlsx load_skill financial-model
```

不匹配任何专用场景时无需加载，直接使用本技能即可。

## Excel 专属元素类型

sheet, row, col, cell, chart, image, comment, table, namedrange, pivottable, sparkline, validation, CF, autofilter, shape, textbox, ole, csv

## Excel 专属路径语法

- 工作表路径：`/Sheet1/A1`、`/Sheet1/B2:D10`
- 工作表索引：`/sheet[1]`
- 命名范围：`[@name=MyRange]`
- 行查询：`Sheet1!row[Salary>5000]`
- `add --type row/col` 的 `--index N` 是 **1-based**

## Excel 专属常用属性

| 属性 | 说明 | 示例 |
|------|------|------|
| `value` | 单元格值 | `"Hello"`, `95`, `"=SUM(A1:B1)"` |
| `bold` | 粗体 | `"true"` |
| `italic` | 斜体 | `"true"` |
| `color` | 文字颜色 | `"FF0000"` |
| `fill` | 背景填充 | `"FFFF00"` |
| `font` | 字体名称 | `"Arial"` |
| `size` | 字号 | `"12"` |
| `align` | 水平对齐 | `"left"`, `"center"`, `"right"` |
| `merge` | 合并范围 | `"A1:D1"` |
| `type` | 单元格类型 | `"number"`, `"text"`, `"date"` |
| `visible` | 工作表可见性 | `"hidden"`, `"veryHidden"` |

## Excel 数据透视表

```bash
node scripts/officecli.mjs run -- data.xlsx add /Sheet1 --type pivottable \
  --prop source="Sheet1!A1:E100" \
  --prop rows="Region,Category" \
  --prop cols="Year" \
  --prop values="Sales:sum,Qty:count" \
  --prop grandTotals=rows \
  --prop sort=asc
```

关键属性：`rows`、`cols`、`values`（Field:func[:showDataAs]）、`filters`、`source`、`layout`（compact/outline/tabular）、`sort`。

聚合函数：sum, count, average, max, min, product, stdDev, stdDevp, var, varp, countNums。

## Excel 排序

```bash
node scripts/officecli.mjs run -- data.xlsx set /Sheet1 --prop sort="C desc" --prop sortHeader=true
```

格式：`COL DIR[, COL DIR ...]`。拒绝包含合并单元格或公式的范围。

## 快速示例

```bash
node scripts/officecli.mjs run -- data.xlsx create
node scripts/officecli.mjs run -- data.xlsx set /Sheet1/A1 --prop value="Name" --prop bold=true
node scripts/officecli.mjs run -- data.xlsx set /Sheet1/B1 --prop value="Score" --prop bold=true
node scripts/officecli.mjs run -- data.xlsx set /Sheet1/A2 --prop value="Alice"
node scripts/officecli.mjs run -- data.xlsx set /Sheet1/B2 --prop value="95"
node scripts/officecli.mjs run -- data.xlsx view outline
```

## 设计系统

不使用固定模板。每次生成前，AI 根据内容主题、数据特征和场景**临时设计一套风格方案**，全程统一遵循。风格设计指南见 `references/design-templates.md`。

### 风格方案设计（生成流程第一步）

分析内容后，设计以下维度并记录为本次的风格方案：

| 维度 | 说明 | 约束 |
|------|------|------|
| 表头底色 | 表头背景色 | 深色配白字或浅色配深字 |
| 表头文字色 | 表头文字颜色 | 与表头底色高对比 |
| 数据文字色 | 数据区文字颜色 | 深灰或黑色 |
| 强调色 | KPI/高亮/图表配色 | — |
| 交替行底色 | 斑马纹底色 | 浅灰或浅蓝 |
| 边框色 | 表格边框颜色 | 浅灰 |
| 表头字体/字号 | 表头字体和字号 | 加粗 |
| 数据字体/字号 | 数据区字体和字号 | — |
| 列宽策略 | 标准列宽/窄列宽/宽列宽 | 根据数据内容设置 |
| 冻结窗格 | 冻结首行/首列 | — |
| 条件格式 | 负数红、交替行等 | — |

设计约束：
- 用户指定风格或品牌色时优先采纳
- 所有颜色使用 6 位 HEX 格式（如 `2C3E50`），不带 `#`

## 视觉验证

生成或修改后必须验证。验证分两层，**HTML 计算验证为主，截图审美验证为辅**。

### 第一层：HTML 计算验证（必须）

```bash
node scripts/officecli.mjs run -- data.xlsx view html -o ae/xlsx/data.html
node scripts/officecli.mjs run -- data.xlsx view outline
```

HTML 输出包含每个单元格的精确位置和尺寸。用以下方法做**精确计算验证**：

- 派发子代理解析 HTML（若宿主支持子代理派发能力），或写一个 Node.js 脚本解析 HTML
- 检测列宽不足：单元格内容是否被 `####` 截断或溢出
- 检测数据对齐：数字列是否右对齐，文本列是否左对齐
- 检测表头与数据一致性：表头列数与数据列数是否匹配
- outline 验证结构：工作表名、单元格值、公式是否正确

### 第二层：截图审美验证（可选）

```bash
node scripts/officecli.mjs run -- data.xlsx view screenshot -o ae/xlsx/preview.png
```

调用 `ae-image` 技能识别截图内容，检查配色、可读性和整体观感。截图验证不用于检测精确布局问题。

### 修复循环

HTML 验证发现问题时修复，每节最多 3 轮。

## 更新已有文档

**禁止全量重建**。更新已有文档时：

1. 先 `view outline` 读取当前结构
2. 只对需要变更的单元格/行/列执行 `set` / `add` / `remove`
3. 未变更的数据保持不动
4. 修改后执行视觉验证

## Excel 专属最佳实践

1. **风格方案全程遵循** — 设计风格方案后，所有工作表的配色、字体、边框从方案取值，不得混用
2. **匹配专用场景时先 `load_skill`**：财务模型任务先 `financial-model`，仪表板先 `data-dashboard`
3. **先读再改**：编辑前先 `view outline` 了解结构
4. **增量更新** — 只修改需要变更的单元格，不重建整个文件
5. **批量操作**：多个修改用 `batch` 一次完成
6. **公式计算**：officecli 内置公式引擎，`get` 时可获取计算结果
7. **生成后必须 HTML 计算验证** — `view html` 解析单元格坐标，检测列宽不足和数据截断
8. **不确定时用 help**：`node scripts/officecli.mjs run -- help xlsx cell` 查看完整属性
9. **排序注意**：排序会拒绝包含合并单元格或公式的范围
10. **行/列插入**：`add --type row/col` 的 `--index N` 是 **1-based**，匹配 Excel UI

## 产物与日志

| 类型 | 路径 |
|---|---|
| 本技能产物（渲染图、HTML 快照等） | `ae/xlsx/` |
| 命令日志 | `ae/logs/officecli/` |

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae-officecli` 技能。
