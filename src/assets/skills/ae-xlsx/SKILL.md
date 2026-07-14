---
name: ae:xlsx
description: "ae:officecli 的 .xlsx 专属包装技能。所有涉及 .xlsx 文件的读取、创建、编辑、分析和格式转换操作都应使用本技能。底层通过 ae-officecli 工具操作 Excel 文档，支持公式计算、数据透视表、条件格式、图表、数据验证等全部 OOXML 能力。禁止使用 Read 或 Bash 直接读取 .xlsx 文件内容。"
argument-hint: "[创建|编辑|分析|读取|追加|公式|透视表] [文件路径] [任务描述]"
---

# ae:xlsx - Excel 专属包装技能

`ae:officecli` 的 `.xlsx` 专属包装技能。通过 `ae-officecli` 工具操作 Excel 文档，无需安装 Office。**内置公式引擎**，可真正计算 Excel 公式（JS 库只能存储公式，不能计算）。

## 路由关系

- **本技能**：`.xlsx` 文件的入口，提供 Excel 专属元素、路径、属性和专用技能
- **ae:officecli**：完整 CLI 参考（L1/L2/L3、watch、batch、raw XML、文档级属性等），本技能不重复
- 操作实际通过 `ae-officecli` 工具执行

## 何时使用

- 创建、编辑、分析 Excel 电子表格
- 需要**公式计算**（而非仅存储公式）
- 需要数据透视表（PivotTable）
- 需要条件格式、数据验证、自动筛选
- 需要图表、迷你图（Sparkline）
- 需要将 XLSX 转为 HTML 预览或验证
- 需要排序、合并单元格、冻结窗格

## 何时不使用

- PDF 文档操作用 `ae:pdf`
- Word 文档用 `ae:docx`
- PowerPoint 用 `ae:pptx`
- 需要 raw XML 操作或 CSS 选择器查询直接用 `ae:officecli`

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

```
ae-officecli file=data.xlsx command=add path=/Sheet1 type=pivottable props='{
  "source":"Sheet1!A1:E100",
  "rows":"Region,Category",
  "cols":"Year",
  "values":"Sales:sum,Qty:count",
  "grandTotals":"rows",
  "sort":"asc"
}'
```

关键属性：`rows`、`cols`、`values`（Field:func[:showDataAs]）、`filters`、`source`、`layout`（compact/outline/tabular）、`sort`。

聚合函数：sum, count, average, max, min, product, stdDev, stdDevp, var, varp, countNums。

## Excel 排序

```
ae-officecli file=data.xlsx command=set path=/Sheet1 props='{"sort":"C desc","sortHeader":"true"}'
```

格式：`COL DIR[, COL DIR ...]`。拒绝包含合并单元格或公式的范围。

## Excel 专用技能

通过 `load_skill` 加载 Excel 专用规则：

| 名称 | 适用场景 |
|------|----------|
| `excel` | 通用工作簿、公式、数据透视表、跟踪器 |
| `financial-model` | 财务模型、场景、预测。不用于通用数据分析（路由到 `excel`） |
| `data-dashboard` | CSV/表格数据 -> KPI/分析/高管仪表板，含图表和迷你图。不用于原始数据跟踪（路由到 `excel`） |

加载示例：
```
ae-officecli file=data.xlsx command=load_skill path=excel
```

## 快速示例

```
ae-officecli file=data.xlsx command=create
ae-officecli file=data.xlsx command=set path=/Sheet1/A1 props='{"value":"Name","bold":"true"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/B1 props='{"value":"Score","bold":"true"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/A2 props='{"value":"Alice"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/B2 props='{"value":"95"}'
ae-officecli file=data.xlsx command=view mode=outline
```

## Excel 专属最佳实践

1. **先读再改**：编辑前先 `view outline` 了解结构
2. **批量操作**：多个修改用 `batch` 一次完成
3. **公式计算**：OfficeCLI 内置公式引擎，`get` 时可获取计算结果
4. **转 HTML 验证**：用 `view html` 而非 `view screenshot`--更快
5. **不确定时用 help**：`command=help path="xlsx cell"` 查看完整属性
6. **排序注意**：排序会拒绝包含合并单元格或公式的范围
7. **行/列插入**：`add --type row/col` 的 `--index N` 是 **1-based**，匹配 Excel UI

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
