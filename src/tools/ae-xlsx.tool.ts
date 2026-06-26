import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { processXlsx } from '../services/xlsx-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

// ==================== 样式 Schema ====================

const fontSchema = z.object({
  name: z.string().optional().describe('字体名称，如微软雅黑、Arial'),
  size: z.number().optional().describe('字号'),
  bold: z.boolean().optional().describe('是否粗体'),
  italic: z.boolean().optional().describe('是否斜体'),
  underline: z.union([z.boolean(), z.enum(['single', 'double'])]).optional().describe('下划线：true=单下划线，或指定类型'),
  strike: z.boolean().optional().describe('是否删除线'),
  color: z.object({ argb: z.string().describe('ARGB 颜色值，如 FFFF0000 表示红色') }).optional().describe('字体颜色'),
}).describe('字体样式')

const fillSchema = z.object({
  type: z.literal('pattern').describe('填充类型，目前仅支持 pattern'),
  pattern: z.enum(['solid', 'darkVertical', 'darkHorizontal', 'lightGrid', 'lightTrellis', 'gray0625', 'gray125']).describe('填充图案类型'),
  bgColor: z.object({ argb: z.string().describe('ARGB 颜色值') }).optional().describe('背景色'),
  fgColor: z.object({ argb: z.string().describe('ARGB 颜色值') }).optional().describe('前景色'),
}).describe('填充样式')

const borderSchema = z.object({
  style: z.enum(['thin', 'medium', 'thick', 'double', 'dotted', 'dashed', 'hair']).optional().describe('边框样式'),
  color: z.object({ argb: z.string().describe('ARGB 颜色值') }).optional().describe('边框颜色'),
}).describe('单边边框样式')

const bordersSchema = z.object({
  top: borderSchema.optional().describe('上边框'),
  bottom: borderSchema.optional().describe('下边框'),
  left: borderSchema.optional().describe('左边框'),
  right: borderSchema.optional().describe('右边框'),
  diagonal: borderSchema.optional().describe('对角线边框'),
}).describe('完整边框样式')

const alignmentSchema = z.object({
  horizontal: z.enum(['left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed']).optional().describe('水平对齐'),
  vertical: z.enum(['top', 'middle', 'bottom', 'distributed', 'justify']).optional().describe('垂直对齐'),
  wrapText: z.boolean().optional().describe('是否自动换行'),
  textRotation: z.number().optional().describe('文字旋转角度（0-180）'),
  indent: z.number().optional().describe('缩进级别'),
  shrinkToFit: z.boolean().optional().describe('是否缩小字体以填充'),
}).describe('对齐样式')

const cellStyleSchema = z.object({
  font: fontSchema.optional().describe('字体样式'),
  fill: fillSchema.optional().describe('填充样式'),
  border: bordersSchema.optional().describe('边框样式'),
  alignment: alignmentSchema.optional().describe('对齐样式'),
  numFmt: z.string().optional().describe('数字格式，如 #,##0.00'),
}).describe('完整单元格样式')

// ==================== 单元格值 Schema ====================

const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.object({ formula: z.string().describe('Excel 公式，如 SUM(B2:B9)') }),
  z.object({ sharedFormula: z.string().describe('共享公式引用的主单元格地址，如 A1') }),
  z.object({
    hyperlink: z.string().describe('超链接 URL'),
    text: z.string().optional().describe('超链接显示文本'),
  }),
]).describe('单元格值：字符串、数字、公式对象、共享公式或超链接对象')

// ==================== 单元格 Schema ====================

const cellSchema = z.object({
  address: z.string().describe('单元格地址，如 A1、B2'),
  value: cellValueSchema.optional().describe('单元格值'),
  style: cellStyleSchema.optional().describe('完整单元格样式（font/fill/border/alignment/numFmt）'),
  bold: z.boolean().optional().describe('是否粗体（兼容字段，等价于 style.font.bold）'),
  numFmt: z.string().optional().describe('数字格式（兼容字段，等价于 style.numFmt）'),
}).describe('单元格级数据（地址、值、完整样式）')

// ==================== 条件格式 Schema ====================

const conditionalFormattingSchema = z.object({
  ref: z.string().describe('条件格式应用范围，如 B2:B10'),
  rule: z.object({
    type: z.enum(['cellIs', 'expression', 'colorScale', 'dataBar', 'iconSet', 'top10']).describe('规则类型'),
    operator: z.enum(['greaterThan', 'lessThan', 'between', 'equal', 'notEqual', 'greaterThanOrEqual', 'lessThanOrEqual']).optional().describe('比较操作符（cellIs 类型使用）'),
    formula: z.array(z.string()).optional().describe('公式数组，如 ["10"] 或 ["A1>0"]'),
    priority: z.number().optional().describe('规则优先级，数字越小优先级越高'),
  }).describe('条件格式规则'),
  style: cellStyleSchema.optional().describe('满足条件时应用的样式'),
}).describe('条件格式定义')

// ==================== 数据验证 Schema ====================

const dataValidationSchema = z.object({
  type: z.enum(['list', 'whole', 'decimal', 'date', 'textLength', 'custom']).describe('验证类型'),
  formula: z.string().optional().describe('验证公式，如列表值 "A,B,C" 或自定义公式 "=A1>0"'),
  allowBlank: z.boolean().optional().describe('是否允许空值'),
  showErrorMessage: z.boolean().optional().describe('是否显示错误提示'),
  error: z.string().optional().describe('错误提示内容'),
  errorTitle: z.string().optional().describe('错误提示标题'),
  showInputMessage: z.boolean().optional().describe('是否显示输入提示'),
  prompt: z.string().optional().describe('输入提示内容'),
  promptTitle: z.string().optional().describe('输入提示标题'),
  ranges: z.array(z.string()).optional().describe('应用范围数组，如 ["A1:A10"]'),
}).describe('数据验证定义')

// ==================== 工作表 Schema ====================

const sheetSchema = z.object({
  name: z.string().describe('工作表名称'),
  columns: z
    .array(z.object({
      header: z.string().describe('列标题'),
      key: z.string().describe('列键名，对应 rows 中的属性名'),
      width: z.number().optional().describe('列宽'),
      style: cellStyleSchema.optional().describe('列级别样式'),
    }))
    .optional()
    .describe('列定义（含表头、键名、列宽、列样式）'),
  rows: z
    .array(z.record(z.string(), cellValueSchema))
    .max(500, '单次行数据上限 500，超过时请分批追加：先用 create 创建初始数据，再用 add-rows 分批追加')
    .optional()
    .describe('行数据数组，键为列 key。单次上限 500 行，超过时请分批追加'),
  cells: z.array(cellSchema).optional().describe('单元格级数据（地址、值、完整样式）'),
  merges: z.array(z.string()).optional().describe('合并单元格范围数组，如 ["A1:B2", "C1:D1"]'),
  freeze: z.object({
    xSplit: z.number().optional().describe('冻结的列数'),
    ySplit: z.number().optional().describe('冻结的行数'),
    topLeftCell: z.string().optional().describe('冻结后右下区域左上角单元格地址'),
  }).optional().describe('冻结窗格配置'),
  autoFilter: z.string().optional().describe('自动筛选范围，如 A1:D10'),
  properties: z.object({
    tabColor: z.object({ argb: z.string().describe('ARGB 颜色值') }).optional().describe('标签页颜色'),
    hidden: z.boolean().optional().describe('是否隐藏工作表'),
    showGridLines: z.boolean().optional().describe('是否显示网格线'),
  }).optional().describe('工作表属性'),
  rowHeights: z.array(z.object({
    row: z.number().describe('行号'),
    height: z.number().describe('行高'),
  })).optional().describe('自定义行高配置'),
  conditionalFormatting: z.array(conditionalFormattingSchema).optional().describe('条件格式规则数组'),
  dataValidation: z.array(dataValidationSchema).optional().describe('数据验证规则数组'),
}).describe('工作表数据')

// ==================== 工作簿属性 Schema ====================

const workbookPropsSchema = z.object({
  creator: z.string().optional().describe('创建者'),
  lastModifiedBy: z.string().optional().describe('最后修改者'),
  created: z.string().optional().describe('创建时间（ISO 8601 格式）'),
  modified: z.string().optional().describe('修改时间（ISO 8601 格式）'),
  title: z.string().optional().describe('标题'),
  subject: z.string().optional().describe('主题'),
  description: z.string().optional().describe('描述'),
  keywords: z.string().optional().describe('关键词'),
  category: z.string().optional().describe('类别'),
  company: z.string().optional().describe('公司'),
}).describe('工作簿元数据属性')

export const aeXlsxTool = tool({
  description: [
    '创建、编辑或分析 XLSX 电子表格，全面覆盖 exceljs 能力。',
    '',
    '功能说明：',
    '- create：根据工作表数据创建 XLSX 文件，支持完整单元格样式、合并、冻结、筛选、条件格式、数据验证、工作簿属性',
    '- edit：编辑现有 XLSX 中指定工作表，支持完整样式、合并单元格、冻结窗格、自动筛选',
    '- analyze：提取工作表信息（名称、行列数、前 5 行预览、合并单元格、冻结窗格、条件格式、数据验证）',
    '- add-rows：向已有工作表追加或插入行数据，支持指定起始行号',
    '- add-sheet：向已有工作簿添加新工作表，支持完整列定义、行数据、合并、冻结等',
    '',
    '增量操作引导：',
    '- 大量数据（>100行）：先 create 创建初始数据，再 add-rows 分批追加，避免单次调用参数过大',
    '- 需要添加新工作表：使用 add-sheet 而非重新 create，保留已有工作表数据',
    '- add-rows 可多次调用，每次追加一批行数据',
    '- edit/add-rows/add-sheet 默认覆盖源文件（原地更新），保持单文件输出；如需保留原文件，请指定 outputPath',
    '',
    '单元格样式能力：',
    '- font：字体名称、字号、粗体、斜体、下划线、删除线、颜色',
    '- fill：纯色/图案填充（solid、lightGrid、gray125 等）',
    '- border：上下左右对角线边框（thin、medium、thick、dashed 等）',
    '- alignment：水平/垂直对齐、自动换行、文字旋转、缩进',
    '- numFmt：数字格式（货币、百分比、日期等）',
    '',
    '工作表能力：',
    '- merges：合并单元格（如 A1:B2）',
    '- freeze：冻结窗格（xSplit/ySplit/topLeftCell）',
    '- autoFilter：自动筛选范围',
    '- properties：标签页颜色、隐藏工作表、网格线控制',
    '- rowHeights：自定义行高',
    '- conditionalFormatting：条件格式（cellIs/expression/top10/colorScale/dataBar/iconSet）',
    '- dataValidation：数据验证（list/whole/decimal/date/textLength/custom）',
    '',
    '工作簿属性：',
    '- creator、title、subject、description、keywords、category、company 等',
    '',
    '输出：',
    '- create 操作生成文件自动写入 ae/documents/xlsx/ 子目录',
    '- edit/add-rows/add-sheet 操作默认覆盖源文件（原地更新）',
    '- 文件名规则：<名称>-<操作>-<时间戳>-<随机串>.xlsx（仅 create 操作）',
    '',
    '预览确认工作流：',
    '- create 操作前，必须先向用户展示表格结构（工作表名、列定义、前几行示例）',
    '- edit 操作前，必须先向用户展示单元格修改对照表（地址、原值 → 新值）',
    '- add-rows 操作前，必须先向用户展示追加的行数和起始位置',
    '- add-sheet 操作前，必须先向用户展示新工作表的结构（名称、列定义、行数据）',
    '- 用户确认后再调用本工具',
    '',
    '适用场景：',
    '- 用户明确要求创建、编辑或分析 XLSX 文件',
    '- 需要公式、样式、合并、冻结、筛选、条件格式、数据验证等高级功能',
    '',
    '不适用场景：',
    '- 只需读取 XLSX 内容转为 Markdown 时，使用 ae:markitdown',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
  ].join('\n'),
  args: {
    operation: z
      .enum(['create', 'edit', 'analyze', 'add-rows', 'add-sheet'])
      .describe('操作类型'),
    file: z
      .string()
      .optional()
      .describe('现有 XLSX 文件路径（edit/analyze/add-rows/add-sheet 操作必填）'),
    sheets: z
      .array(sheetSchema)
      .optional()
      .describe('工作表数组（create 操作必填）'),
    sheetName: z
      .string()
      .optional()
      .describe('要编辑或追加行的工作表名称（edit/add-rows 操作必填）'),
    cells: z
      .array(cellSchema)
      .optional()
      .describe('单元格修改列表（edit 操作必填，支持完整样式）'),
    merges: z
      .array(z.string())
      .optional()
      .describe('合并单元格范围数组（edit 操作可选，如 ["A1:B2"]）'),
    freeze: z
      .object({
        xSplit: z.number().optional().describe('冻结的列数'),
        ySplit: z.number().optional().describe('冻结的行数'),
        topLeftCell: z.string().optional().describe('冻结后右下区域左上角单元格地址'),
      })
      .optional()
      .describe('冻结窗格配置（edit 操作可选）'),
    autoFilter: z
      .string()
      .optional()
      .describe('自动筛选范围（edit 操作可选，如 A1:D10；传空字符串清除筛选）'),
    rows: z
      .array(z.record(z.string(), cellValueSchema))
      .max(500, '单次追加行数上限 500，超过时请分多次追加')
      .optional()
      .describe('行数据数组（add-rows 操作必填，格式与 create 的 rows 相同）。单次上限 500 行'),
    startRow: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('起始行号（1-based，add-rows 操作可选，默认追加到末尾；指定时在目标位置插入行，1 表示第一行）'),
    sheet: sheetSchema
      .optional()
      .describe('单个工作表数据（add-sheet 操作必填，结构与 create 的单个 sheet 相同）'),
    workbookProps: workbookPropsSchema.optional().describe('工作簿元数据属性（create 操作可选）'),
    outputPath: z
      .string()
      .optional()
      .describe('自定义输出路径；create 操作省略时自动生成到 ae/documents/xlsx/；edit/add-rows/add-sheet 操作省略时默认覆盖源文件（原地更新）'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `XLSX ${args.operation}`, metadata: { operation: args.operation } })

    try {
      const result = await processXlsx({
        operation: args.operation,
        worktree: ctx.worktree,
        file: args.file,
        sheets: args.sheets,
        sheetName: args.sheetName,
        cells: args.cells,
        merges: args.merges,
        freeze: args.freeze,
        autoFilter: args.autoFilter,
        workbookProps: args.workbookProps,
        outputPath: args.outputPath,
        rows: args.rows,
        startRow: args.startRow,
        sheet: args.sheet,
      })

      return {
        output: result.summary + (result.content ? `\n\n${result.content}` : ''),
        metadata: {
          tool: TOOL.AE_XLSX,
          operation: args.operation,
          outputPath: result.outputPath,
          summary: result.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('XLSX', error)
    }
  },
})
