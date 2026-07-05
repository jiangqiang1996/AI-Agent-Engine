---
name: ae:xlsx
description: "所有涉及 .xlsx 文件的读取、创建、编辑、分析和格式转换操作都必须使用本技能。包括：创建电子表格、编辑单元格和样式、分析工作表结构、追加行数据、添加工作表、合并多个工作簿、将 XLSX 转为 Markdown 阅读、将 XLSX 转为图片辅助理解视觉内容。支持完整单元格样式、合并、冻结、筛选、条件格式和数据验证。禁止使用 Read 或 Bash 直接读取 .xlsx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。"
argument-hint: "[创建|编辑|分析|追加行|添加工作表] [文件路径] [任务描述]"
---

# ae:xlsx — Excel 电子表格处理

创建、编辑、分析 `.xlsx` 文件，全面覆盖 exceljs 能力，支持完整单元格样式、公式、合并单元格、冻结窗格、自动筛选、条件格式、数据验证、工作表属性和工作簿属性。支持增量操作 `add-rows`（追加行数据）和 `add-sheet`（添加新工作表）。通过内置 `ae-xlsx` 工具实现，无需额外安装依赖。

## to-markdown 操作

本技能的 `to-markdown` 操作可将 XLSX 转为 Markdown 供 LLM 阅读。支持 `outputMode` 参数控制输出方式：
- `file`（默认）：写入 `ae/markdown/` 目录
- `inline`：直接返回 Markdown 内容，不写文件

| 场景 | 用本技能 to-markdown | 用本技能其他操作 |
|------|---------------------|-----------------|
| 只读提取表格数据供 LLM 阅读 | ✅ 优先用 to-markdown | ❌ |
| 创建新 Excel | ❌ | ✅ 输出 .xlsx |
| 编辑现有 Excel（保留公式格式） | ❌ | ✅ 输出 .xlsx |
| 数据分析和结构信息 | ❌ | ✅ 返回行列数和预览 |
| 需要完整样式、合并、冻结等高级功能 | ❌ | ✅ 全面支持 |

**原则：只需读取数据时用 `to-markdown` 操作；需要创建或修改 .xlsx 文件时用其他操作。**

## 核心原则：用公式，不要硬编码

**始终使用 Excel 公式而非在代码中计算后硬编码值。** 这确保表格保持动态可更新。

在 `ae-xlsx` 工具中，单元格值支持以下公式形式：
- 独立公式：`{ formula: 'SUM(B2:B9)' }`
- 共享公式：`{ sharedFormula: 'A1' }`（引用主单元格地址，复用同一公式）
- 超链接：`{ hyperlink: 'https://example.com', text: '链接文字' }`

## 参数体大小控制（硬约束）

opencode 工具调用的参数通过 JSON 传输，当参数体过大时可能导致 JSON 解析失败。为避免此问题，必须控制单次工具调用的参数体大小：

1. **单次 create 工作表行数 ≤ 100 行**：即使 Zod 上限是 500 行，实际调用时应将每次 create 的行数控制在 100 行以内，大幅降低参数体体积
2. **单次 add-rows 行数 ≤ 200 行**：大量数据应分多次追加，每次不超过 200 行
3. **含大量样式单元格的工作表单独操作**：通过 `cells` 字段逐单元格设置完整样式时，参数体体积会显著增加；含大量自定义样式的行数据不应与普通行数据混合在同一次调用中
4. **含条件格式/数据验证的工作表分步构建**：先创建基础数据，再通过 edit 操作补充条件格式和数据验证
5. **多工作表分步创建**：先 create 创建第一个工作表，再 add-sheet 逐个添加后续工作表

**分步写入示例**（3 个工作表、每个 300 行的大型工作簿）：

```
第 1 次 create：      创建工作表 1（前 100 行，含列定义和基础样式）
第 2 次 add-rows：    追加工作表 1 剩余 200 行
第 3 次 add-sheet：   创建工作表 2（前 100 行）
第 4 次 add-rows：    追加工作表 2 剩余 200 行
第 5 次 add-sheet：   创建工作表 3（前 100 行）
第 6 次 add-rows：    追加工作表 3 剩余 200 行
```

## 可用操作

### create — 创建电子表格

参数：`sheets`（工作表数组）、`workbookProps`（工作簿属性，可选）

#### 工作簿属性（workbookProps）

| 字段 | 说明 |
|------|------|
| creator | 创建者 |
| lastModifiedBy | 最后修改者 |
| created / modified | 创建/修改时间 |
| title | 标题 |
| subject | 主题 |
| description | 描述 |
| keywords | 关键词 |
| category | 类别 |
| company | 公司 |

#### 工作表数据字段

| 字段 | 说明 |
|------|------|
| name | 工作表名称 |
| columns | 列定义数组，每项含 header、key、width、style |
| rows | 行数据数组，每项为 { key: value } 对象 |
| cells | 单元格级数据，含地址、值、完整样式 |
| merges | 合并单元格范围数组，如 `["A1:B2", "C1:D1"]` |
| freeze | 冻结窗格配置：xSplit（冻结列数）、ySplit（冻结行数）、topLeftCell |
| autoFilter | 自动筛选范围，如 `"A1:D10"` |
| properties | 工作表属性：tabColor、hidden、showGridLines |
| rowHeights | 自定义行高配置数组 |
| conditionalFormatting | 条件格式规则数组 |
| dataValidation | 数据验证规则数组 |

### edit — 编辑电子表格

参数：`file`（文件路径）、`sheetName`（工作表名）、`cells`（单元格修改列表）、`merges`（可选）、`freeze`（可选）、`autoFilter`（可选）

修改指定工作表中的单元格，支持：
- 完整单元格样式编辑（font/fill/border/alignment/numFmt）
- 合并单元格操作（merges）
- 冻结窗格操作（freeze）
- 自动筛选操作（autoFilter）

### analyze — 分析电子表格

参数：`file`（文件路径）

返回以下信息（截取前 8000 字符）：
- 工作表数量、每个工作表的行列数
- 前 5 行预览
- 合并单元格信息
- 冻结窗格信息
- 条件格式信息
- 数据验证信息

### add-rows — 向已有工作表追加行数据

参数：`file`（已有 XLSX 文件路径）、`sheetName`（目标工作表名称）、`rows`（行数据数组，格式与 create 的 rows 相同）、`startRow`（起始行号，可选，默认追加到末尾）

- 未指定 `startRow` 时，行数据追加到工作表末尾（使用 worksheet.addRows）
- 指定 `startRow` 时，行数据在目标位置插入（使用 worksheet.insertRow）
- 行数据格式与 create 操作完全一致：每行为 `{ key: value }` 对象，key 对应列定义的 key
- 返回：添加的行数、新文件路径、当前总行数

适用场景：
- 大量数据分批追加（先 create 创建前 100 行，再 add-rows 追加剩余行）
- 在已有工作表中插入新行数据

### add-sheet — 向已有工作簿添加新工作表

参数：`file`（已有 XLSX 文件路径）、`sheet`（单个工作表数据对象，结构与 create 的单个 sheet 相同）

sheet 参数包含所有 create 中单个工作表支持的字段：name、columns、rows、cells、merges、freeze、autoFilter、properties、rowHeights、conditionalFormatting、dataValidation

- 添加前检查同名工作表是否已存在，存在时返回错误提示
- 返回：新工作表名称、新文件路径、当前总工作表数

适用场景：
- 在已有 XLSX 中添加新工作表，而非重新 create 整个工作簿
- 多工作表分步构建

### merge — 合并多个 XLSX 文件

参数：`files`（要合并的 XLSX 文件路径列表，至少 2 个）

将多个 XLSX 文件的工作表合并为一个文件。合并时：
- 以第一个文件为基础工作簿
- 逐个读取后续文件，将每个工作表复制到基础工作簿
- 自动处理工作表名冲突（重名时自动添加 `_1`、`_2` 后缀）
- 完整复制单元格值、样式（字体/填充/边框/对齐/数字格式）、列宽、行高、合并单元格、自动筛选、工作表属性、冻结窗格

**适用场景**：
- 将多个独立数据表合并为一个工作簿
- 团队协作后合并各成员负责的工作表

**输出**：生成文件自动写入 `ae/documents/xlsx/` 子目录，可通过 `outputPath` 参数自定义路径。

## 完整单元格样式

通过 `style` 字段设置单元格的完整样式：

### font — 字体

| 字段 | 说明 | 示例 |
|------|------|------|
| name | 字体名称 | 微软雅黑、Arial |
| size | 字号 | 12 |
| bold | 粗体 | true |
| italic | 斜体 | true |
| underline | 下划线 | true、'single'、'double' |
| strike | 删除线 | true |
| color | 字体颜色 | { argb: 'FFFF0000' }（红色） |

### fill — 填充

| 字段 | 说明 |
|------|------|
| type | 固定为 'pattern' |
| pattern | 图案类型：solid、darkVertical、darkHorizontal、lightGrid、lightTrellis、gray0625、gray125 |
| fgColor | 前景色 { argb: 'FF00FF00' } |
| bgColor | 背景色 { argb: 'FF000000' } |

### border — 边框

支持 top、bottom、left、right、diagonal 五个方向，每边可设置：

| 字段 | 说明 |
|------|------|
| style | 边框样式：thin、medium、thick、double、dotted、dashed、hair |
| color | 边框颜色 { argb: 'FF000000' } |

### alignment — 对齐

| 字段 | 说明 |
|------|------|
| horizontal | 水平对齐：left、center、right、fill、justify、centerContinuous、distributed |
| vertical | 垂直对齐：top、middle、bottom、distributed、justify |
| wrapText | 自动换行 |
| textRotation | 文字旋转角度（0-180） |
| indent | 缩进级别 |
| shrinkToFit | 缩小字体填充 |

### numFmt — 数字格式

常用值：
- 货币：`$#,##0;($#,##0);-`
- 百分比：`0.0%`
- 千分位：`#,##0.00`
- 文本：`@`
- 日期：`yyyy-mm-dd`

## 合并单元格

通过 `merges` 字段设置合并范围：

```json
{
  "merges": ["A1:B2", "C1:D1"]
}
```

## 冻结窗格

通过 `freeze` 字段设置冻结配置：

```json
{
  "freeze": {
    "xSplit": 1,
    "ySplit": 1,
    "topLeftCell": "B2"
  }
}
```

- xSplit：冻结左侧的列数
- ySplit：冻结上方的行数
- topLeftCell：冻结后可滚动区域的左上角单元格

## 自动筛选

通过 `autoFilter` 字段设置筛选范围：

```json
{
  "autoFilter": "A1:D10"
}
```

## 条件格式

通过 `conditionalFormatting` 字段设置条件格式规则：

```json
{
  "conditionalFormatting": [
    {
      "ref": "B2:B10",
      "rule": {
        "type": "cellIs",
        "operator": "greaterThan",
        "formula": ["100"],
        "priority": 1
      },
      "style": {
        "font": { "bold": true, "color": { "argb": "FFFF0000" } },
        "fill": { "type": "pattern", "pattern": "solid", "fgColor": { "argb": "FFFFCCCC" } }
      }
    }
  ]
}
```

支持的规则类型：
- **cellIs**：单元格值比较（operator + formula）
- **expression**：表达式公式
- **top10**：前 N 项（formula[0] 为 rank）
- **colorScale**：色阶
- **dataBar**：数据条
- **iconSet**：图标集

## 数据验证

通过 `dataValidation` 字段设置数据验证规则：

```json
{
  "dataValidation": [
    {
      "type": "list",
      "formula": "\"高,中,低\"",
      "ranges": ["C2:C10"],
      "allowBlank": true,
      "showErrorMessage": true,
      "error": "请选择有效值",
      "errorTitle": "输入错误"
    }
  ]
}
```

支持的验证类型：
- **list**：下拉列表（formula 为逗号分隔的值）
- **whole**：整数
- **decimal**：小数
- **date**：日期
- **textLength**：文本长度
- **custom**：自定义公式

## 工作表属性

通过 `properties` 字段设置工作表属性：

```json
{
  "properties": {
    "tabColor": { "argb": "FF0066CC" },
    "hidden": false,
    "showGridLines": true
  }
}
```

## 输出路径

- **create 操作**：生成文件自动写入 `ae/documents/xlsx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.xlsx`。文件名中的非 ASCII 字符（如中文标题）会自动替换为连字符，确保跨平台安全
- **edit/add-rows/add-sheet 操作**：默认覆盖源文件（原地更新），保持单文件输出。如需输出到不同路径，传入 `outputPath` 参数

## to-image 操作

参数：
- `operation`：`to-image`
- `file`：XLSX 文件路径（必填）
- `imagePages`：指定页码列表（1-based），如 `[1, 3]` 只验证第1、3页；省略则转换所有页

输出：每页对应一张 PNG 图片，写入 `ae/documents/xlsx/` 目录。

XLSX 的 to-image 路径为：XLSX → PDF（LibreOffice soffice --convert-to pdf）→ PNG（pdfjs-dist + @napi-rs/canvas），需要 LibreOffice。使用前先通过 `ae:libreoffice` 技能确认 LibreOffice 就绪。

## 边界

- 支持任意本地绝对路径（工作区内和工作区外均可），工作区外写入操作会请求用户确认
- 所有操作通过内置 `ae-xlsx` 工具完成，无需额外安装依赖
- 工具内置库不自动重算公式值，需用户在 Excel 中打开时自动计算
