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

## ⚠️ 重要：判断是否需要加载 Excel 专用技能

仅当当前任务匹配以下专用场景时，先执行 `load_skill` 加载对应规则再操作：

| 名称 | 适用场景 |
|------|----------|
| `financial-model` | 财务模型、场景、预测。不用于通用数据分析（路由到 `excel`） |
| `data-dashboard` | CSV/表格数据 -> KPI/分析/高管仪表板，含图表和迷你图。不用于原始数据跟踪（路由到 `excel`） |

匹配时先加载：
```
ae-officecli file=data.xlsx command=load_skill path=financial-model
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

## 快速示例

```
ae-officecli file=data.xlsx command=create
ae-officecli file=data.xlsx command=set path=/Sheet1/A1 props='{"value":"Name","bold":"true"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/B1 props='{"value":"Score","bold":"true"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/A2 props='{"value":"Alice"}'
ae-officecli file=data.xlsx command=set path=/Sheet1/B2 props='{"value":"95"}'
ae-officecli file=data.xlsx command=view mode=outline
```

## 设计系统

内置 3 套设计模板，选定后全程遵循。完整规格见 `references/design-templates.md`。

| 模板 | 适用场景 | 表头底色 | 特征 |
|------|---------|---------|------|
| `data-table` | 通用数据表 | `2C3E50` | 交替行底色 + 冻结首行 |
| `dashboard` | KPI 仪表板 | `4472C4` | KPI 卡片 + 图表 + 多色系 |
| `financial` | 财务报表 | `1A1A2E` | 小计/合计行 + 负数红 + 货币格式 |

选择规则：
- 用户指定风格时使用对应模板
- 未指定时根据内容推断：数据分析→`data-table`，KPI 展示→`dashboard`，财务→`financial`

### 风格规格

每套模板定义以下维度（具体数值见 references）：
- 配色：表头底色、数据行交替底色、强调色
- 字体：表头字体/字号/粗体、数据字体/字号
- 边框：表头边框、数据区边框
- 对齐：表头对齐、数据对齐、数字列对齐
- 列宽：标准列宽、窄列宽、宽列宽
- 条件格式：负数红色、交替行底色等

## 视觉验证

生成或修改后必须验证视觉效果：

```
ae-officecli file=data.xlsx command=view mode=html
ae-officecli file=data.xlsx command=view mode=outline
```

HTML 验证排版和配色，outline 验证结构（工作表名、单元格值、公式）。发现问题后修复，每节最多 3 轮。

## 更新已有文档

**禁止全量重建**。更新已有文档时：

1. 先 `command=view mode=outline` 读取当前结构
2. 只对需要变更的单元格/行/列执行 `command=set`/`add`/`remove`
3. 未变更的数据保持不动
4. 修改后执行视觉验证

## Excel 专属最佳实践

1. **选定模板后全程遵循** — 配色、字体、边框从模板取值，不得混用
2. **匹配专用场景时先 `load_skill`**：财务模型任务先 `financial-model`，仪表板先 `data-dashboard`
3. **先读再改**：编辑前先 `view outline` 了解结构
4. **增量更新** — 只修改需要变更的单元格，不重建整个文件
5. **批量操作**：多个修改用 `batch` 一次完成
6. **公式计算**：OfficeCLI 内置公式引擎，`get` 时可获取计算结果
7. **转 HTML 验证**：用 `view html` 做视觉验证
8. **不确定时用 help**：`command=help path="xlsx cell"` 查看完整属性
9. **排序注意**：排序会拒绝包含合并单元格或公式的范围
10. **行/列插入**：`add --type row/col` 的 `--index N` 是 **1-based**，匹配 Excel UI

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
