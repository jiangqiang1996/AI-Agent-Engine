import { mkdirSync } from 'node:fs'
import path from 'node:path'

import ExcelJS from 'exceljs'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'
import { convertXlsxToMarkdown } from './xlsx-markdown-converter.js'
import { loadDocumentFile } from './document-file-loader.js'
import { writeMarkdownOutput } from './markdown-output-writer.js'
import { detectLibreOffice, convertToImagesViaPdf, resolveLibreofficeConfigPath } from './libreoffice-service.js'
import { join } from 'node:path'

export type XlsxOperation = 'create' | 'edit' | 'analyze' | 'add-rows' | 'add-sheet' | 'merge' | 'to-markdown' | 'to-image'

// ==================== 样式类型 ====================

export interface XlsxFont {
  name?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean | 'single' | 'double'
  strike?: boolean
  color?: { argb: string }
}

export interface XlsxFill {
  type: 'pattern'
  pattern: 'solid' | 'darkVertical' | 'darkHorizontal' | 'lightGrid' | 'lightTrellis' | 'gray0625' | 'gray125'
  bgColor?: { argb: string }
  fgColor?: { argb: string }
}

export interface XlsxBorder {
  style?: 'thin' | 'medium' | 'thick' | 'double' | 'dotted' | 'dashed' | 'hair'
  color?: { argb: string }
}

export interface XlsxBorders {
  top?: XlsxBorder
  bottom?: XlsxBorder
  left?: XlsxBorder
  right?: XlsxBorder
  diagonal?: XlsxBorder
}

export interface XlsxAlignment {
  horizontal?: 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed'
  vertical?: 'top' | 'middle' | 'bottom' | 'distributed' | 'justify'
  wrapText?: boolean
  textRotation?: number
  indent?: number
  shrinkToFit?: boolean
}

export interface XlsxCellStyle {
  font?: XlsxFont
  fill?: XlsxFill
  border?: XlsxBorders
  alignment?: XlsxAlignment
  numFmt?: string
}

// ==================== 单元格类型 ====================

export interface XlsxCellData {
  address?: string
  value?: string | number | { formula: string } | { sharedFormula: string } | { hyperlink: string; text?: string }
  style?: XlsxCellStyle
  /** 兼容字段，映射到 style.font.bold */
  bold?: boolean
  /** 兼容字段，映射到 style.numFmt */
  numFmt?: string
}

// ==================== 条件格式类型 ====================

export interface XlsxConditionalFormatting {
  ref: string
  rule: {
    type: 'cellIs' | 'expression' | 'colorScale' | 'dataBar' | 'iconSet' | 'top10'
    operator?: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'notEqual' | 'greaterThanOrEqual' | 'lessThanOrEqual'
    formula?: string[]
    priority?: number
  }
  style?: XlsxCellStyle
}

// ==================== 数据验证类型 ====================

export interface XlsxDataValidation {
  type: 'list' | 'whole' | 'decimal' | 'date' | 'textLength' | 'custom'
  formula?: string
  allowBlank?: boolean
  showErrorMessage?: boolean
  error?: string
  errorTitle?: string
  showInputMessage?: boolean
  prompt?: string
  promptTitle?: string
  ranges?: string[]
}

// ==================== 工作表类型 ====================

/** 行数据中单元格值的类型，与 cellValueSchema 对齐 */
export type XlsxRowValue = string | number | { formula: string } | { sharedFormula: string } | { hyperlink: string; text?: string }

export interface XlsxSheetData {
  name: string
  columns?: { header: string; key: string; width?: number; style?: XlsxCellStyle }[]
  rows?: Record<string, XlsxRowValue>[]
  cells?: XlsxCellData[]
  merges?: string[]
  freeze?: { xSplit?: number; ySplit?: number; topLeftCell?: string }
  autoFilter?: string
  properties?: { tabColor?: { argb: string }; hidden?: boolean; showGridLines?: boolean }
  rowHeights?: { row: number; height: number }[]
  conditionalFormatting?: XlsxConditionalFormatting[]
  dataValidation?: XlsxDataValidation[]
}

// ==================== 工作簿属性类型 ====================

export interface XlsxWorkbookProps {
  creator?: string
  lastModifiedBy?: string
  created?: string
  modified?: string
  title?: string
  subject?: string
  description?: string
  keywords?: string
  category?: string
  company?: string
}

// ==================== 输入输出类型 ====================

export interface XlsxInput {
  operation: XlsxOperation
  worktree: string
  file?: string
  /** merge 操作：要合并的 XLSX 文件路径列表 */
  files?: string[]
  sheets?: XlsxSheetData[]
  sheetName?: string
  cells?: XlsxCellData[]
  merges?: string[]
  freeze?: { xSplit?: number; ySplit?: number; topLeftCell?: string }
  autoFilter?: string
  workbookProps?: XlsxWorkbookProps
  outputPath?: string
  /** add-rows 操作：行数据数组，格式与 create 的 rows 相同 */
  rows?: Record<string, XlsxRowValue>[]
  /** add-rows 操作：起始行号（1-based，默认追加到末尾；1 表示第一行） */
  startRow?: number
  /** add-sheet 操作：单个工作表数据 */
  sheet?: XlsxSheetData
  outputMode?: 'file' | 'inline'
  /** to-image 操作：指定页码列表（1-based），省略则转换所有页 */
  imagePages?: number[]
}

export interface XlsxResult {
  outputPath?: string
  summary: string
  content?: string
}

// ==================== 辅助函数 ====================

/**
 * 将 XlsxCellStyle 转换为 exceljs 的 Partial<Style>，
 * 用于 column 级别样式和条件格式样式。
 */
function toExcelStyle(style: XlsxCellStyle): Partial<ExcelJS.Style> {
  const result: Record<string, unknown> = {}
  if (style.numFmt) result.numFmt = style.numFmt
  if (style.font) result.font = style.font
  if (style.alignment) result.alignment = style.alignment
  if (style.border) result.border = style.border
  if (style.fill) {
    result.fill = {
      type: 'pattern' as const,
      pattern: style.fill.pattern,
      ...(style.fill.fgColor ? { fgColor: style.fill.fgColor } : {}),
      ...(style.fill.bgColor ? { bgColor: style.fill.bgColor } : {}),
    }
  }
  return result as Partial<ExcelJS.Style>
}

/**
 * 将完整单元格样式（font/fill/border/alignment/numFmt）应用到 exceljs Cell。
 * 兼容旧的 bold/numFmt 字段。
 */
function applyCellStyle(cell: ExcelJS.Cell, cellData: XlsxCellData): void {
  const style = cellData.style
  const bold = cellData.bold
  const numFmt = cellData.numFmt

  // 兼容字段映射
  if (bold || numFmt) {
    const mergedStyle: XlsxCellStyle = { ...(style || {}) }
    if (bold) {
      mergedStyle.font = { ...(mergedStyle.font || {}), bold: true }
    }
    if (numFmt) {
      mergedStyle.numFmt = numFmt
    }
    applyFullCellStyle(cell, mergedStyle)
    return
  }

  if (style) {
    applyFullCellStyle(cell, style)
  }
}

/**
 * 将 XlsxCellStyle 完整应用到 exceljs Cell（不含兼容字段）。
 */
function applyFullCellStyle(cell: ExcelJS.Cell, style: XlsxCellStyle): void {
  if (style.font) {
    cell.font = { ...cell.font, ...style.font }
  }
  if (style.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: style.fill.pattern,
      ...(style.fill.fgColor ? { fgColor: style.fill.fgColor } : {}),
      ...(style.fill.bgColor ? { bgColor: style.fill.bgColor } : {}),
    }
  }
  if (style.border) {
    cell.border = { ...cell.border, ...style.border }
  }
  if (style.alignment) {
    cell.alignment = { ...cell.alignment, ...style.alignment }
  }
  if (style.numFmt) {
    cell.numFmt = style.numFmt
  }
}

/**
 * 构建工作表创建选项（properties、state、views/freeze）。
 */
function buildWorksheetOptions(sheetData: XlsxSheetData): Partial<ExcelJS.AddWorksheetOptions> {
  const options: Partial<ExcelJS.AddWorksheetOptions> = {}

  if (sheetData.properties) {
    const props = sheetData.properties
    const wsProps: Partial<ExcelJS.WorksheetProperties> = {}
    if (props.tabColor) wsProps.tabColor = props.tabColor
    if (props.showGridLines !== undefined) wsProps.showGridLines = props.showGridLines
    options.properties = wsProps
    if (props.hidden) options.state = 'hidden'
  }

  if (sheetData.freeze) {
    const freeze = sheetData.freeze
    const view: Partial<ExcelJS.WorksheetView> = {
      state: 'frozen',
      ...(freeze.xSplit !== undefined ? { xSplit: freeze.xSplit } : {}),
      ...(freeze.ySplit !== undefined ? { ySplit: freeze.ySplit } : {}),
      ...(freeze.topLeftCell ? { topLeftCell: freeze.topLeftCell } : {}),
    }
    options.views = [view]
  }

  return options
}

/**
 * 将 XlsxConditionalFormatting 转换为 exceljs 的 ConditionalFormattingOptions。
 */
function buildConditionalFormattingOptions(
  cf: XlsxConditionalFormatting,
): ExcelJS.ConditionalFormattingOptions {
  const rule = cf.rule
  const style = cf.style ? toExcelStyle(cf.style) : undefined
  const priority = rule.priority ?? 1
  const formulae = rule.formula || []
  const stylePart = style ? { style } : {}

  switch (rule.type) {
    case 'cellIs':
      return {
        ref: cf.ref,
        rules: [{
          type: 'cellIs',
          ...(rule.operator ? { operator: rule.operator } : {}),
          formulae,
          priority,
          ...stylePart,
        } as ExcelJS.ConditionalFormattingRule],
      }
    case 'expression':
      return {
        ref: cf.ref,
        rules: [{
          type: 'expression',
          formulae,
          priority,
          ...stylePart,
        }],
      }
    case 'top10':
      return {
        ref: cf.ref,
        rules: [{
          type: 'top10',
          rank: Number(formulae[0] || 10),
          percent: false,
          bottom: false,
          priority,
          ...stylePart,
        }],
      }
    default:
      // colorScale / dataBar / iconSet — 传递基本参数
      return {
        ref: cf.ref,
        rules: [{
          type: rule.type,
          priority,
          ...stylePart,
          ...(formulae.length > 0 ? { formulae } : {}),
        } as ExcelJS.ConditionalFormattingRule],
      }
  }
}

/**
 * 对工作表应用数据验证。
 * exceljs 的 dataValidations 支持范围地址作为 key。
 */
function applyDataValidation(ws: ExcelJS.Worksheet, dv: XlsxDataValidation): void {
  const validation: Record<string, unknown> = {
    type: dv.type,
    formulae: dv.formula ? [dv.formula] : [],
  }
  if (dv.allowBlank !== undefined) validation.allowBlank = dv.allowBlank
  if (dv.showErrorMessage !== undefined) validation.showErrorMessage = dv.showErrorMessage
  if (dv.error !== undefined) validation.error = dv.error
  if (dv.errorTitle !== undefined) validation.errorTitle = dv.errorTitle
  if (dv.showInputMessage !== undefined) validation.showInputMessage = dv.showInputMessage
  if (dv.prompt !== undefined) validation.prompt = dv.prompt
  if (dv.promptTitle !== undefined) validation.promptTitle = dv.promptTitle

  // exceljs Worksheet 类型未暴露 dataValidations，但运行时存在
  const wsWithDv = ws as unknown as {
    dataValidations: { add: (address: string, validation: unknown) => void }
  }
  const ranges = dv.ranges || []
  for (const range of ranges) {
    wsWithDv.dataValidations.add(range, validation)
  }
}

// ==================== create 操作 ====================

async function handleCreate(input: XlsxInput): Promise<XlsxResult> {
  const sheets = input.sheets
  if (!sheets) {
    throw new Error('create 操作需要 sheets 参数')
  }

  const wb = new ExcelJS.Workbook()

  // 设置工作簿属性
  if (input.workbookProps) {
    const props = input.workbookProps
    if (props.creator) wb.creator = props.creator
    if (props.lastModifiedBy) wb.lastModifiedBy = props.lastModifiedBy
    if (props.created) wb.created = new Date(props.created)
    if (props.modified) wb.modified = new Date(props.modified)
    if (props.title) wb.title = props.title
    if (props.subject) wb.subject = props.subject
    if (props.description) wb.description = props.description
    if (props.keywords) wb.keywords = props.keywords
    if (props.category) wb.category = props.category
    if (props.company) wb.company = props.company
  }

  for (const sheetData of sheets) {
    const ws = wb.addWorksheet(sheetData.name, buildWorksheetOptions(sheetData))

    // 设置列定义（含样式）
    if (sheetData.columns) {
      ws.columns = sheetData.columns.map((col) => {
        const result: Partial<ExcelJS.Column> = {
          header: col.header,
          key: col.key,
        }
        if (col.width !== undefined) result.width = col.width
        if (col.style) result.style = toExcelStyle(col.style)
        return result
      })
    }

    // 添加行数据
    if (sheetData.rows) {
      ws.addRows(sheetData.rows)
    }

    // 设置单元格值和完整样式
    if (sheetData.cells) {
      for (const cellData of sheetData.cells) {
        if (cellData.address) {
          const cell = ws.getCell(cellData.address)
          if (cellData.value !== undefined) {
            cell.value = cellData.value as ExcelJS.CellValue
          }
          applyCellStyle(cell, cellData)
        }
      }
    }

    // 合并单元格
    if (sheetData.merges) {
      for (const range of sheetData.merges) {
        ws.mergeCells(range)
      }
    }

    // 自动筛选
    if (sheetData.autoFilter) {
      ws.autoFilter = sheetData.autoFilter
    }

    // 行高
    if (sheetData.rowHeights) {
      for (const rh of sheetData.rowHeights) {
        ws.getRow(rh.row).height = rh.height
      }
    }

    // 条件格式
    if (sheetData.conditionalFormatting) {
      for (const cf of sheetData.conditionalFormatting) {
        ws.addConditionalFormatting(buildConditionalFormattingOptions(cf))
      }
    }

    // 数据验证
    if (sheetData.dataValidation) {
      for (const dv of sheetData.dataValidation) {
        applyDataValidation(ws, dv)
      }
    }
  }

  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'create', 'xlsx')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  await wb.xlsx.writeFile(outputPath)

  return {
    outputPath,
    summary: `已创建 XLSX 文件，包含 ${sheets.length} 个工作表`,
  }
}

// ==================== edit 操作 ====================

async function handleEdit(input: XlsxInput): Promise<XlsxResult> {
  const file = input.file
  const sheetName = input.sheetName
  if (!file) {
    throw new Error('edit 操作需要 file 参数')
  }
  if (!sheetName) {
    throw new Error('edit 操作需要 sheetName 参数')
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  const ws = wb.getWorksheet(sheetName)
  if (!ws) {
    throw new Error(`工作表 "${sheetName}" 不存在`)
  }

  let cellCount = 0

  // 修改单元格值和完整样式
  if (input.cells) {
    for (const cellData of input.cells) {
      if (cellData.address) {
        const cell = ws.getCell(cellData.address)
        if (cellData.value !== undefined) {
          cell.value = cellData.value as ExcelJS.CellValue
        }
        applyCellStyle(cell, cellData)
        cellCount++
      }
    }
  }

  // 合并单元格
  if (input.merges) {
    for (const range of input.merges) {
      ws.mergeCells(range)
    }
  }

  // 冻结窗格
  if (input.freeze) {
    const freeze = input.freeze
    ws.views = [{
      state: 'frozen',
      ...(freeze.xSplit !== undefined ? { xSplit: freeze.xSplit } : {}),
      ...(freeze.ySplit !== undefined ? { ySplit: freeze.ySplit } : {}),
      ...(freeze.topLeftCell ? { topLeftCell: freeze.topLeftCell } : {}),
    }]
  }

  // 自动筛选
  if (input.autoFilter !== undefined) {
    ws.autoFilter = input.autoFilter
  }

  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await wb.xlsx.writeFile(outputPath)

  return {
    outputPath,
    summary: `已编辑 XLSX 文件，修改 ${cellCount} 个单元格`,
  }
}

// ==================== analyze 操作 ====================

async function handleAnalyze(input: XlsxInput): Promise<XlsxResult> {
  const file = input.file
  if (!file) {
    throw new Error('analyze 操作需要 file 参数')
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  const sheetInfos: string[] = []
  wb.eachSheet((ws) => {
    const rowCount = ws.rowCount
    const colCount = ws.columnCount
    const parts: string[] = [`### ${ws.name}\n行数: ${rowCount}，列数: ${colCount}`]

    // 前 5 行预览
    const preview: string[] = []
    ws.eachRow((row, rowNum) => {
      if (rowNum <= 5) {
        const values = (row.values as unknown[]).slice(1).map((v) => String(v ?? ''))
        preview.push(`| ${values.join(' | ')} |`)
      }
    })
    if (preview.length > 0) {
      parts.push(preview.join('\n'))
    }

    // 合并单元格信息
    const wsModel = ws.model as { merges?: string[] }
    if (wsModel.merges && wsModel.merges.length > 0) {
      parts.push(`**合并单元格**: ${wsModel.merges.join(', ')}`)
    }

    // 冻结窗格信息
    const views = ws.views || []
    for (const view of views) {
      if (view.state === 'frozen') {
        const frozenView = view as ExcelJS.WorksheetViewFrozen
        const details: string[] = []
        if (frozenView.xSplit) details.push(`冻结列: ${frozenView.xSplit}`)
        if (frozenView.ySplit) details.push(`冻结行: ${frozenView.ySplit}`)
        if (frozenView.topLeftCell) details.push(`左上单元格: ${frozenView.topLeftCell}`)
        if (details.length > 0) {
          parts.push(`**冻结窗格**: ${details.join('，')}`)
        }
      }
    }

    // 条件格式信息
    const cfList = (ws.model as { conditionalFormattings?: Array<{ ref: string; rules: unknown[] }> }).conditionalFormattings
    if (cfList && cfList.length > 0) {
      const cfSummary = cfList.map((cf) => {
        const ruleCount = cf.rules ? cf.rules.length : 0
        return `${cf.ref}(${ruleCount} 条规则)`
      })
      parts.push(`**条件格式**: ${cfSummary.join(', ')}`)
    }

    // 数据验证信息
    const dvModel = (ws.model as { dataValidations?: Record<string, unknown> }).dataValidations
    if (dvModel) {
      const dvKeys = Object.keys(dvModel).filter((k) => dvModel[k] !== undefined)
      if (dvKeys.length > 0) {
        parts.push(`**数据验证**: ${dvKeys.length} 个范围 (${dvKeys.join(', ')})`)
      }
    }

    sheetInfos.push(parts.join('\n'))
  })

  return {
    summary: `分析完成：共 ${wb.worksheets.length} 个工作表`,
    content: sheetInfos.join('\n\n').slice(0, 8000),
  }
}

// ==================== 列 key 恢复 ====================

/**
 * exceljs 读取文件后会丢失列 key 映射。
 * 从首行标题值恢复 key：用标题文本（去掉空格）作为列 key，
 * 使 addRows/insertRow 的键值对象能通过 header 名映射到列。
 */
function restoreColumnKeys(ws: ExcelJS.Worksheet): void {
  if (ws.columnCount === 0) return
  const headerRow = ws.getRow(1)
  const usedKeys = new Map<string, number>()
  for (let colIdx = 1; colIdx <= ws.columnCount; colIdx++) {
    const col = ws.getColumn(colIdx)
    if (!col.key) {
      const headerVal = headerRow.getCell(colIdx).value
      const keyStr = headerVal == null ? '' : String(headerVal).trim()
      if (keyStr) {
        const suffix = usedKeys.get(keyStr) ?? 0
        usedKeys.set(keyStr, suffix + 1)
        col.key = suffix > 0 ? `${keyStr}_${suffix}` : keyStr
      }
    }
  }
}

// ==================== add-rows 操作 ====================

async function handleAddRows(input: XlsxInput): Promise<XlsxResult> {
  const file = input.file
  const sheetName = input.sheetName
  const rows = input.rows
  if (!file) {
    throw new Error('add-rows 操作需要 file 参数')
  }
  if (!sheetName) {
    throw new Error('add-rows 操作需要 sheetName 参数')
  }
  if (!rows) {
    throw new Error('add-rows 操作需要 rows 参数')
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  const ws = wb.getWorksheet(sheetName)
  if (!ws) {
    throw new Error(`工作表 "${sheetName}" 不存在`)
  }

  // exceljs 读取文件后会丢失列 key 映射，需从首行标题恢复
  restoreColumnKeys(ws)

  if (input.startRow !== undefined && input.startRow !== null) {
    for (let i = 0; i < rows.length; i++) {
      ws.insertRow(input.startRow + i, rows[i])
    }
  } else {
    ws.addRows(rows)
  }

  const totalRows = ws.rowCount
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await wb.xlsx.writeFile(outputPath)

  return {
    outputPath,
    summary: `已添加 ${rows.length} 行到工作表 "${sheetName}"，当前总行数: ${totalRows}`,
  }
}

// ==================== add-sheet 操作 ====================

async function handleAddSheet(input: XlsxInput): Promise<XlsxResult> {
  const file = input.file
  const sheetData = input.sheet
  if (!file) {
    throw new Error('add-sheet 操作需要 file 参数')
  }
  if (!sheetData) {
    throw new Error('add-sheet 操作需要 sheet 参数')
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)

  // 检查同名工作表是否已存在
  const existingWs = wb.getWorksheet(sheetData.name)
  if (existingWs) {
    throw new Error(`工作表 "${sheetData.name}" 已存在，无法添加同名工作表`)
  }

  const ws = wb.addWorksheet(sheetData.name, buildWorksheetOptions(sheetData))

  // 设置列定义（含样式）
  if (sheetData.columns) {
    ws.columns = sheetData.columns.map((col) => {
      const result: Partial<ExcelJS.Column> = {
        header: col.header,
        key: col.key,
      }
      if (col.width !== undefined) result.width = col.width
      if (col.style) result.style = toExcelStyle(col.style)
      return result
    })
  }

  // 添加行数据
  if (sheetData.rows) {
    ws.addRows(sheetData.rows)
  }

  // 设置单元格值和完整样式
  if (sheetData.cells) {
    for (const cellData of sheetData.cells) {
      if (cellData.address) {
        const cell = ws.getCell(cellData.address)
        if (cellData.value !== undefined) {
          cell.value = cellData.value as ExcelJS.CellValue
        }
        applyCellStyle(cell, cellData)
      }
    }
  }

  // 合并单元格
  if (sheetData.merges) {
    for (const range of sheetData.merges) {
      ws.mergeCells(range)
    }
  }

  // 自动筛选
  if (sheetData.autoFilter) {
    ws.autoFilter = sheetData.autoFilter
  }

  // 行高
  if (sheetData.rowHeights) {
    for (const rh of sheetData.rowHeights) {
      ws.getRow(rh.row).height = rh.height
    }
  }

  // 条件格式
  if (sheetData.conditionalFormatting) {
    for (const cf of sheetData.conditionalFormatting) {
      ws.addConditionalFormatting(buildConditionalFormattingOptions(cf))
    }
  }

  // 数据验证
  if (sheetData.dataValidation) {
    for (const dv of sheetData.dataValidation) {
      applyDataValidation(ws, dv)
    }
  }

  const totalSheets = wb.worksheets.length
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await wb.xlsx.writeFile(outputPath)

  return {
    outputPath,
    summary: `已添加工作表 "${sheetData.name}"，当前总工作表数: ${totalSheets}`,
  }
}

// ==================== merge 操作 ====================

async function handleMerge(input: XlsxInput): Promise<XlsxResult> {
  const files = input.files
  if (!files || files.length < 2) {
    throw new Error('merge 操作需要至少 2 个文件路径')
  }

  // 读取第一个文件作为基础工作簿
  const baseWb = new ExcelJS.Workbook()
  await baseWb.xlsx.readFile(files[0])

  // 记录已有工作表名，用于冲突处理
  const existingNames = new Set<string>()
  baseWb.eachSheet((ws) => existingNames.add(ws.name))

  let copiedSheetCount = 0

  // 逐个读取后续文件，复制每个工作表到基础工作簿
  for (let fileIdx = 1; fileIdx < files.length; fileIdx++) {
    const srcWb = new ExcelJS.Workbook()
    await srcWb.xlsx.readFile(files[fileIdx])

    srcWb.eachSheet((srcWs) => {
      // 确定不冲突的工作表名
      let targetName = srcWs.name
      let suffix = 1
      while (existingNames.has(targetName)) {
        targetName = `${srcWs.name}_${suffix}`
        suffix++
      }
      existingNames.add(targetName)

      // 在基础工作簿中创建目标工作表
      const destWs = baseWb.addWorksheet(targetName)

      // 复制列定义（含样式）
      const columns: Partial<ExcelJS.Column>[] = []
      for (let colIdx = 1; colIdx <= srcWs.columnCount; colIdx++) {
        const srcCol = srcWs.getColumn(colIdx)
        const colDef: Partial<ExcelJS.Column> = {}
        if (srcCol.key) colDef.key = srcCol.key
        if (srcCol.width !== undefined) colDef.width = srcCol.width
        if (srcCol.header) colDef.header = srcCol.header
        if (srcCol.style) colDef.style = srcCol.style
        if (srcCol.numFmt) colDef.numFmt = srcCol.numFmt
        columns.push(colDef)
      }
      if (columns.length > 0) {
        destWs.columns = columns
      }

      // 复制单元格值和完整样式
      srcWs.eachRow({ includeEmpty: true }, (row, rowNum) => {
        const destRow = destWs.getRow(rowNum)
        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
          const destCell = destRow.getCell(colNum)
          if (cell.value !== null && cell.value !== undefined) {
            destCell.value = cell.value as ExcelJS.CellValue
          }
          if (cell.font) destCell.font = cell.font
          if (cell.fill) destCell.fill = cell.fill
          if (cell.border) destCell.border = cell.border
          if (cell.alignment) destCell.alignment = cell.alignment
          if (cell.numFmt) destCell.numFmt = cell.numFmt
        })
        // 复制行高
        if (row.height) destRow.height = row.height
      })

      // 复制合并单元格
      const srcModel = srcWs.model as { merges?: string[] }
      if (srcModel.merges && srcModel.merges.length > 0) {
        for (const merge of srcModel.merges) {
          destWs.mergeCells(merge)
        }
      }

      // 复制自动筛选
      if (srcWs.autoFilter) {
        destWs.autoFilter = srcWs.autoFilter
      }

      // 复制工作表属性
      if (srcWs.properties) {
        destWs.properties = srcWs.properties
      }

      // 复制冻结窗格（views）
      if (srcWs.views && srcWs.views.length > 0) {
        destWs.views = srcWs.views
      }

      copiedSheetCount++
    })
  }

  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'merge', 'xlsx')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  await baseWb.xlsx.writeFile(outputPath)

  const totalSheets = baseWb.worksheets.length
  return {
    outputPath,
    summary: `已合并 ${files.length} 个 XLSX 文件，共 ${totalSheets} 个工作表（从后续文件新增 ${copiedSheetCount} 个）`,
  }
}

// ==================== 入口 ====================

export async function processXlsx(input: XlsxInput): Promise<XlsxResult> {
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const resolvedInput = { ...input }
  if (input.file) {
    try {
      resolvedInput.file = await resolveDocumentPath(input.file, input.worktree)
    } catch {
      // 路径不存在时保留原始值，让 handler 的参数校验先执行
    }
  }
  if (input.files) {
    try {
      resolvedInput.files = await Promise.all(
        input.files.map((f) => resolveDocumentPath(f, input.worktree)),
      )
    } catch {
      // 路径不存在时保留原始值
    }
  }

  switch (resolvedInput.operation) {
    case 'create':
      return handleCreate(resolvedInput)
    case 'edit':
      return handleEdit(resolvedInput)
    case 'analyze':
      return handleAnalyze(resolvedInput)
    case 'add-rows':
      return handleAddRows(resolvedInput)
    case 'add-sheet':
      return handleAddSheet(resolvedInput)
    case 'merge':
      return handleMerge(resolvedInput)
    case 'to-markdown':
      return handleToMarkdown(resolvedInput)
    case 'to-image':
      return handleToImage(resolvedInput)
  }
}

async function handleToMarkdown(input: XlsxInput): Promise<XlsxResult> {
  if (!input.file) throw new Error('to-markdown 操作需要 file 参数')
  const { buffer } = await loadDocumentFile(input.file, input.worktree, 'XLSX')
  const result = await convertXlsxToMarkdown(buffer)
  return writeMarkdownOutput(result.markdown, input.worktree, 'xlsx', input.outputPath, input.outputMode)
}

async function handleToImage(input: XlsxInput): Promise<XlsxResult> {
  if (!input.file) throw new Error('to-image 操作需要 file 参数')
  const configResult = resolveLibreofficeConfigPath(input.worktree)
  const detection = detectLibreOffice(configResult.libreofficePath ?? undefined)
  if (!detection.available || !detection.sofficePath) {
    throw new Error('LibreOffice 不可用。请先通过 ae:libreoffice 技能安装或下载 LibreOffice，再进行视觉验证。')
  }
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const filePath = await resolveDocumentPath(input.file, input.worktree)
  const outputDir = join(input.worktree, 'ae', 'documents', 'to-image')
  const { images } = await convertToImagesViaPdf({
    filePath,
    outputDir,
    sofficePath: detection.sofficePath,
    pageNumbers: input.imagePages,
    scale: 2.0,
    intermediateDir: join(input.worktree, 'ae', 'documents', 'to-image', '_intermediate'),
  })
  if (images.length === 0) {
    return { summary: 'XLSX 转图片失败：未生成任何图片文件', content: '' }
  }
  const imageList = images.map(p => {
    const match = p.match(/page_(\d+)\.png$/)
    const pageNum = match ? parseInt(match[1]) : 0
    return `第 ${pageNum} 页: ${p}`
  }).join('\n')
  return {
    summary: `XLSX 转图片完成，生成 ${images.length} 张页面图片`,
    content: imageList,
    outputPath: outputDir,
  }
}
