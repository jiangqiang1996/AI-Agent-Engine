---
name: ae:xlsx
description: "所有涉及 .xlsx 文件的读取、创建、编辑、分析和格式转换操作都必须使用本技能。包括：创建电子表格、编辑单元格和样式、分析工作表结构、追加行数据、添加工作表、合并多个工作簿、将 XLSX 转为 Markdown 阅读、将 XLSX 转为图片进行视觉验证。支持完整单元格样式、合并、冻结、筛选、条件格式和数据验证。禁止使用 Read 或 Bash 直接读取 .xlsx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。创建或修改 XLSX 后必须通过 to-image 操作进行视觉验证。"
argument-hint: "[创建|编辑|分析|追加行|添加工作表] [文件路径] [任务描述]"
---

# ae:xlsx — Excel 电子表格处理

创建、编辑、分析 `.xlsx` 文件，全面覆盖 exceljs 能力，支持完整单元格样式、公式、合并单元格、冻结窗格、自动筛选、条件格式、数据验证、工作表属性和工作簿属性。支持增量操作 `add-rows`（追加行数据）和 `add-sheet`（添加新工作表）。通过内置 `ae-xlsx` 工具实现，无需安装额外依赖。

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

## 核心工作流：两阶段预览确认

所有创建和编辑操作必须遵循两阶段流程：

### 阶段一：内容大纲确认（必须）

在调用 `ae-xlsx` 工具前，先向用户展示即将生成的内容大纲，等待用户确认后再执行。

**大纲只包含内容，不包含布局或设计描述。** 布局、配色、字体等设计决策由 `@doc-architect` 负责，大纲确认阶段不应出现这些信息。

- **create**：展示表格内容大纲
  - 工作表名 | 列定义（表头、键名）| 前 3 行示例数据
  - 不包含：列宽、颜色、字体、边框等设计信息
- **edit**：展示单元格修改对照表
  - 地址 | 原值 | 新值

### 阶段二：执行生成

用户确认内容大纲后，先调度 `@doc-architect` 制定风格规格书（如尚未制定），再按规格书调用 `ae-xlsx` 工具执行操作。

## 调用纪律（硬约束）

预览确认后只调用一次工具，禁止无理由反复生成。

| 场景 | 允许操作 |
|------|----------|
| 预览确认后首次生成 | 调用一次 create |
| 生成后发现小差异 | 调用 edit 更新现有文件 |
| 生成后发现大差异（结构变化） | 重新调用 create 生成 |
| 工具返回错误 | 分析原因，修正参数后重试一次 |
| 无理由反复调用 | 禁止 |

**文件已生成后优先编辑而非重新生成**：发现差异时首选 `edit` 操作更新现有文件；仅当内容结构性变化无法通过编辑完成时才重新 `create`。

### 增量调用策略

| 场景 | 推荐操作 |
|------|----------|
| 大量数据（>100行） | 先 `create` 创建初始数据（前 100 行），再 `add-rows` 分批追加剩余行 |
| 需要添加新工作表 | 使用 `add-sheet` 而非重新 `create`，保留已有工作表数据 |
| 多次追加行数据 | `add-rows` 可多次调用，每次追加一批行数据 |
| 在指定位置插入行 | `add-rows` 指定 `startRow` 参数，在目标位置插入行 |
| 修改现有文件 | `edit`/`add-rows`/`add-sheet` 默认覆盖源文件（原地更新）；如需保留原文件，显式指定 `outputPath` |

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

预览确认：操作前向用户展示追加的行数和起始位置。

### add-sheet — 向已有工作簿添加新工作表

参数：`file`（已有 XLSX 文件路径）、`sheet`（单个工作表数据对象，结构与 create 的单个 sheet 相同）

sheet 参数包含所有 create 中单个工作表支持的字段：name、columns、rows、cells、merges、freeze、autoFilter、properties、rowHeights、conditionalFormatting、dataValidation

- 添加前检查同名工作表是否已存在，存在时返回错误提示
- 返回：新工作表名称、新文件路径、当前总工作表数

适用场景：
- 在已有 XLSX 中添加新工作表，而非重新 create 整个工作簿
- 多工作表分步构建

预览确认：操作前向用户展示新工作表的结构（名称、列定义、行数据）。

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

## 文档架构师协作（硬约束）

**创建新电子表格、大规模修改已有电子表格、追加行或添加工作表时，必须先调度 `@doc-architect` 代理制定风格规格书，再按规格书执行。** 跳过此步骤直接生成是违规行为。

### 硬约束规则

1. **create 前**：必须先调度 `@doc-architect` 制定全局风格规格书
2. **add-rows 前**：如涉及样式变更，必须先调度 `@doc-architect` 确认风格（纯数据追加可跳过）
3. **add-sheet 前**：必须先调度 `@doc-architect` 确认新工作表的风格规格书（可引用已有规格书）
4. **用户设计约束优先**：如果用户在提示词中声明了设计约束（配色、字体、布局、风格等），`@doc-architect` 必须在用户的设计约束下进行设计，禁止违背用户的设计
5. **风格统一**：`@doc-architect` 必须确保全文档风格统一，多工作表时不得破坏已有风格

### 何时可跳过 @doc-architect

| 场景 | 原因 |
|------|------|
| 小范围单元格编辑 | 不涉及风格变更，直接用 edit |
| 追加纯数据行（无样式） | 不涉及风格变更，直接用 add-rows |

### 协作流程

1. 调度 `@doc-architect`，传入文档类型（XLSX）、目标受众、用户设计约束（如有）和风格偏好
2. `@doc-architect` 在用户设计约束下输出风格规格书
3. 按规格书的风格参数执行 create/edit/add-sheet
4. 生成后用 to-markdown 或 analyze 验证内容一致性

### 颜色安全规范（硬约束）

`exceljs` 的单元格字体颜色需要通过 `style.font.color` 显式设置。未设置时使用 Excel 默认黑色，适用于白底工作表（常见场景）。但使用底纹填充的单元格中，未设置颜色的文字可能不可见。创建时必须遵守以下规范：

1. **有底纹的单元格必须显式设置字体颜色**：当单元格 `fill` 为深色底纹时，`font.color` 必须设置为浅色以确保对比度
2. **表头专项检查**：表头行通常有底纹，文字颜色必须与底纹色形成足够对比度
3. **条件格式颜色检查**：`conditionalFormatting` 中 `style.fill.fgColor` 和 `style.font.color` 必须形成对比度
4. **对比度预检**：创建前对照风格规格书中的底纹色和文字色，预估对比度是否满足 WCAG AA（4.5:1）
5. **常见陷阱**：
   - 表头设置了深色底纹但文字未设 `font.color` → 黑色文字在深色底纹上可能不可见
   - 条件格式设置了填充色但文字色未设 → 同上
   - 使用 `bgColor` 但 `fgColor` 未设 → 图案填充可能渲染为透明

## 视觉验证（硬约束）

**创建或修改 XLSX 后必须进行验证。** 这是不可跳过的交付步骤。

XLSX 无 to-image 操作，视觉验证以数据完整性、样式一致性和跨工作表统一性为主，通过 `to-markdown` 和 `analyze` 操作完成。

### 标准验证流程

1. 调用 `ae-xlsx` 工具 `operation=to-markdown`，将所有工作表转为 Markdown 表格
2. 调用 `ae-xlsx` 工具 `operation=analyze`，提取工作表结构信息（行列数、合并单元格、冻结窗格、条件格式、数据验证）
3. **三维交叉验证**（不可跳过，详见下方三个验证维度）
4. 发现问题时使用 edit/add-rows/add-sheet 修正，修正后再次 to-markdown + analyze 验证
5. 所有工作表验证通过后才算交付完成

### 三维交叉验证

#### 维度一：内容一致性验证（对照大纲）

将 `to-markdown` 输出的表格数据与确认时的内容大纲逐工作表对比：

- 每个工作表的名称是否与大纲一致
- 表头（列标题）是否与大纲匹配
- 每行数据是否与大纲一致（允许合理的格式化，但值不能偏离）
- 是否有遗漏的行、多余的行、错误的数据
- 公式是否与大纲中记录的预期一致

**判定标准**：识别到的数据内容与大纲一致。出现遗漏、错误或多余数据时判定为不一致。

#### 维度二：设计一致性验证（对照风格规格书）

将 `analyze` 输出的结构信息与 `@doc-architect` 给出的风格规格书逐工作表对比：

- 列宽是否与规格书一致
- 行高是否与规格书一致
- 合并单元格范围是否与规格书一致
- 冻结窗格配置是否与规格书一致
- 自动筛选范围是否与规格书一致
- 条件格式规则是否与规格书一致
- 数据验证规则是否与规格书一致
- 工作表标签页颜色是否与规格书一致

**判定标准**：工作表结构与规格书一致。出现配置偏差时判定为不一致。

#### 维度三：跨工作表统一性验证

检查跨工作表的样式和结构是否一致：

- 相同类型列的列宽在不同工作表间是否保持一致
- 表头样式（字体、底纹、对齐）在不同工作表间是否保持一致
- 数据单元格样式在不同工作表间是否保持一致
- 边框样式在不同工作表间是否保持一致
- 数字格式在不同工作表间是否保持一致
- 合并单元格的使用模式是否统一
- 冻结窗格策略是否统一

**判定标准**：跨工作表样式和结构保持一致。出现不统一的工作表时判定为验证失败。

### 验证失败时的修复循环

1. 记录不一致的具体工作表、维度和问题描述
2. 使用 edit/add-rows/add-sheet 修正对应工作表
3. 修正后再次 to-markdown + analyze 重新验证
4. 如果是全局性问题，需要修正所有受影响工作表后全量重新验证
5. 修复循环最多 3 轮；3 轮后仍有问题则停止并向用户报告

### 何时必须验证

- create 创建新电子表格后
- edit 编辑现有电子表格后
- add-rows 追加行数据后
- add-sheet 添加新工作表后

### 何时可不验证

- analyze（只读分析）
- to-markdown（只读读取）

## 输出路径

- **create 操作**：生成文件自动写入 `ae/documents/xlsx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.xlsx`。文件名中的非 ASCII 字符（如中文标题）会自动替换为连字符，确保跨平台安全
- **edit/add-rows/add-sheet 操作**：默认覆盖源文件（原地更新），保持单文件输出。如需输出到不同路径，传入 `outputPath` 参数

## 边界

- 支持任意本地绝对路径（工作区内和工作区外均可），工作区外写入操作会请求用户确认
- 所有操作通过内置 `ae-xlsx` 工具完成，无需额外安装依赖
- 工具内置库不自动重算公式值，需用户在 Excel 中打开时自动计算
