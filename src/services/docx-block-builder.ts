import { readFileSync } from 'node:fs'

import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  NumberFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ThematicBreak,
  UnderlineType,
  VerticalAlign,
  VerticalMerge,
  VerticalMergeType,
  WidthType,
} from 'docx'

export type DocxOperation = 'create' | 'edit' | 'analyze' | 'track-changes' | 'append-blocks' | 'update-block' | 'to-markdown' | 'to-image' | 'merge' | 'split'

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ==================== 鏂囨湰杩愯鏍峰紡 ====================

export interface DocxRunStyle {
  text: string
  bold?: boolean
  italics?: boolean
  underline?: 'single' | 'double' | 'dash' | 'dot' | 'wave' | 'none'
  strike?: boolean
  doubleStrike?: boolean
  subscript?: boolean
  superscript?: boolean
  color?: string
  fontSize?: number
  fontFace?: string
  highlight?: string
  breakAfter?: boolean
}

// ==================== 超链接?====================

export interface DocxHyperlinkRun {
  text: string
  url: string
  bold?: boolean
  italics?: boolean
  color?: string
  underline?: 'single' | 'double' | 'none'
}

// ==================== 表格单元格样式?====================

export interface DocxTableCellStyle {
  width?: { size: number; type?: 'pct' | 'dxa' }
  shading?: { fill: string; type?: 'clear' | 'solid' }
  verticalAlign?: 'top' | 'center' | 'bottom'
  borders?: {
    top?: { style?: string; size?: number; color?: string }
    bottom?: { style?: string; size?: number; color?: string }
    left?: { style?: string; size?: number; color?: string }
    right?: { style?: string; size?: number; color?: string }
  }
  margin?: { top?: number; bottom?: number; left?: number; right?: number }
  colspan?: number
  rowspan?: number
  bold?: boolean
  italics?: boolean
  fontSize?: number
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
}

// ==================== 鍐呭鍧楃被鍨?====================

export interface DocxContentBlock {
  type:
    | 'heading'
    | 'paragraph'
    | 'bullet'
    | 'numbered'
    | 'table'
    | 'image'
    | 'page-break'
    | 'code'
    | 'quote'
    | 'hr'
    | 'hyperlink'
  // heading
  level?: number
  // text-based
  text?: string
  bold?: boolean
  italics?: boolean
  underline?: 'single' | 'double' | 'dash' | 'dot' | 'wave' | 'none'
  strike?: boolean
  color?: string
  fontSize?: number
  fontFace?: string
  highlight?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  spacing?: { before?: number; after?: number; line?: number }
  indent?: { left?: number; right?: number; firstLine?: number }
  // runs
  runs?: DocxRunStyle[]
  // hyperlink
  hyperlink?: DocxHyperlinkRun
  // table
  rows?: DocxTableCell[][]
  tableWidth?: number
  tableLayout?: 'fixed' | 'autofit'
  // image
  imagePath?: string
  imageData?: string
  imageWidth?: number
  imageHeight?: number
  imageAlt?: string
  // quote
  quoteStyle?: 'indent' | 'block'
  // code
  codeLanguage?: string
}

export interface DocxTableCell {
  text?: string
  style?: DocxTableCellStyle
}

// ==================== 鑺傚睘鎬?====================

export interface DocxSectionProps {
  pageSize?: { width?: number; height?: number; orientation?: 'portrait' | 'landscape' }
  margins?: { top?: number; bottom?: number; left?: number; right?: number; header?: number; footer?: number }
  headers?: { default?: string; first?: string; even?: string }
  footers?: { default?: string; first?: string; even?: string }
  columnCount?: number
  columnSpacing?: number
}

// ==================== 文档元数据?====================

export interface DocxDocumentMeta {
  title?: string
  creator?: string
  subject?: string
  description?: string
  keywords?: string
  category?: string
  lastModifiedBy?: string
  revision?: number
}

// ==================== 输入输出 ====================

export interface DocxInput {
  operation: DocxOperation
  worktree: string
  file?: string
  /** merge 鎿嶄綔锛氳鍚堝苟鐨?DOCX 鏂囦欢璺緞鍒楄〃 */
  files?: string[]
  title?: string
  blocks?: DocxContentBlock[]
  sections?: DocxSectionProps[]
  documentMeta?: DocxDocumentMeta
  replacements?: { find: string; replace: string }[]
  changes?: { find: string; replace: string }[]
  blockIndex?: number
  block?: DocxContentBlock
  outputPath?: string
  outputMode?: 'file' | 'inline'
  /** to-image 鎿嶄綔锛氭寚瀹氶〉鐮佸垪琛紙1-based锛夛紝鐪佺暐鍒欒浆鎹㈡墍鏈夐〉 */
  pages?: number[]
}

export interface DocxResult {
  outputPath?: string
  outputPaths?: string[]
  summary: string
  content?: string
  blockCount?: number
}

// ==================== 辅助函数 ====================

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
}

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
}

const UNDERLINE_MAP: Record<string, (typeof UnderlineType)[keyof typeof UnderlineType]> = {
  single: UnderlineType.SINGLE,
  double: UnderlineType.DOUBLE,
  dash: UnderlineType.DASH,
  dot: UnderlineType.DOTTED,
  wave: UnderlineType.WAVE,
  none: UnderlineType.NONE,
}

export const VALIGN_MAP: Record<string, (typeof VerticalAlign)[keyof typeof VerticalAlign]> = {
  top: VerticalAlign.TOP,
  center: VerticalAlign.CENTER,
  bottom: VerticalAlign.BOTTOM,
}

export const BORDER_STYLE_MAP: Record<string, (typeof BorderStyle)[keyof typeof BorderStyle]> = {
  single: BorderStyle.SINGLE,
  dashed: BorderStyle.DASHED,
  dotted: BorderStyle.DOTTED,
  double: BorderStyle.DOUBLE,
  none: BorderStyle.NONE,
  thick: BorderStyle.THICK,
}

export function buildTextRun(run: DocxRunStyle): TextRun {
  const props: Record<string, unknown> = { text: run.text }
  if (run.bold !== undefined) props.bold = run.bold
  if (run.italics !== undefined) props.italics = run.italics
  if (run.underline) props.underline = { type: UNDERLINE_MAP[run.underline] ?? UnderlineType.SINGLE }
  if (run.strike !== undefined) props.strike = run.strike
  if (run.doubleStrike !== undefined) props.doubleStrike = run.doubleStrike
  if (run.subscript !== undefined) props.subScript = run.subscript
  if (run.superscript !== undefined) props.superScript = run.superscript
  if (run.color) props.color = run.color
  if (run.fontSize !== undefined) props.size = run.fontSize * 2 // docx 浣跨敤鍗婄
  if (run.fontFace) props.font = run.fontFace
  if (run.highlight) props.highlight = run.highlight
  if (run.breakAfter) props.break = 1
  return new TextRun(props as ConstructorParameters<typeof TextRun>[0])
}

export function buildHyperlinkRun(hl: DocxHyperlinkRun): ExternalHyperlink {
  const runProps: Record<string, unknown> = { text: hl.text, style: 'Hyperlink' }
  if (hl.bold !== undefined) runProps.bold = hl.bold
  if (hl.italics !== undefined) runProps.italics = hl.italics
  if (hl.color) runProps.color = hl.color
  if (hl.underline) runProps.underline = { type: UNDERLINE_MAP[hl.underline] ?? UnderlineType.SINGLE }
  return new ExternalHyperlink({
    children: [new TextRun(runProps as ConstructorParameters<typeof TextRun>[0])],
    link: hl.url,
  })
}

export function buildParagraphProps(block: DocxContentBlock): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  if (block.align) props.alignment = ALIGN_MAP[block.align]
  if (block.spacing) {
    const sp: Record<string, unknown> = {}
    if (block.spacing.before !== undefined) sp.before = block.spacing.before
    if (block.spacing.after !== undefined) sp.after = block.spacing.after
    if (block.spacing.line !== undefined) sp.line = block.spacing.line
    props.spacing = sp
  }
  if (block.indent) {
    const ind: Record<string, unknown> = {}
    if (block.indent.left !== undefined) ind.left = convertInchesToTwip(block.indent.left)
    if (block.indent.right !== undefined) ind.right = convertInchesToTwip(block.indent.right)
    if (block.indent.firstLine !== undefined) ind.firstLine = convertInchesToTwip(block.indent.firstLine)
    props.indent = ind
  }
  return props
}

export function buildTableCell(cell: DocxTableCell): TableCell {
  const cellStyle = cell.style ?? {}
  const tcProps: Record<string, unknown> = {
    children: [
      new Paragraph({
        children: [new TextRun({
          text: cell.text ?? '',
          ...(cellStyle.bold !== undefined ? { bold: cellStyle.bold } : {}),
          ...(cellStyle.italics !== undefined ? { italics: cellStyle.italics } : {}),
          ...(cellStyle.fontSize !== undefined ? { size: cellStyle.fontSize * 2 } : {}),
          ...(cellStyle.color ? { color: cellStyle.color } : {}),
        })],
        ...(cellStyle.align ? { alignment: ALIGN_MAP[cellStyle.align] } : {}),
      }),
    ],
  }

  if (cellStyle.width) {
    tcProps.width = {
      size: cellStyle.width.size,
      type: cellStyle.width.type === 'pct' ? WidthType.PERCENTAGE : WidthType.DXA,
    }
  }

  if (cellStyle.shading) {
    tcProps.shading = {
      fill: cellStyle.shading.fill,
      type: ShadingType.CLEAR,
      color: 'auto',
    }
  }

  if (cellStyle.verticalAlign) {
    tcProps.verticalAlign = VALIGN_MAP[cellStyle.verticalAlign]
  }

  if (cellStyle.borders) {
    const borders: Record<string, unknown> = {}
    for (const [side, border] of Object.entries(cellStyle.borders)) {
      if (border) {
        borders[side] = {
          style: border.style ? (BORDER_STYLE_MAP[border.style] ?? BorderStyle.SINGLE) : BorderStyle.SINGLE,
          ...(border.size !== undefined ? { size: border.size } : {}),
          ...(border.color ? { color: border.color } : {}),
        }
      }
    }
    tcProps.borders = borders
  }

  if (cellStyle.margin) {
    tcProps.margins = {
      top: cellStyle.margin.top !== undefined ? convertInchesToTwip(cellStyle.margin.top) : undefined,
      bottom: cellStyle.margin.bottom !== undefined ? convertInchesToTwip(cellStyle.margin.bottom) : undefined,
      left: cellStyle.margin.left !== undefined ? convertInchesToTwip(cellStyle.margin.left) : undefined,
      right: cellStyle.margin.right !== undefined ? convertInchesToTwip(cellStyle.margin.right) : undefined,
    }
  }

  if (cellStyle.colspan !== undefined) {
    tcProps.columnSpan = cellStyle.colspan
  }

  if (cellStyle.rowspan !== undefined) {
    tcProps.verticalMerge = cellStyle.rowspan > 1 ? VerticalMergeType.RESTART : VerticalMergeType.CONTINUE
  }

  return new TableCell(tcProps as ConstructorParameters<typeof TableCell>[0])
}

export function buildBlockTextRun(block: DocxContentBlock): TextRun {
  const props: Record<string, unknown> = { text: block.text ?? '' }
  if (block.bold !== undefined) props.bold = block.bold
  if (block.italics !== undefined) props.italics = block.italics
  if (block.underline) props.underline = { type: UNDERLINE_MAP[block.underline] ?? UnderlineType.SINGLE }
  if (block.strike !== undefined) props.strike = block.strike
  if (block.color) props.color = block.color
  if (block.fontSize !== undefined) props.size = block.fontSize * 2
  if (block.fontFace) props.font = block.fontFace
  if (block.highlight) props.highlight = block.highlight
  return new TextRun(props as ConstructorParameters<typeof TextRun>[0])
}

export function buildImageRun(block: DocxContentBlock): ImageRun {
  const data = block.imagePath
    ? readFileSync(block.imagePath)
    : Buffer.from(block.imageData ?? '', 'base64')

  return new ImageRun({
    data,
    transformation: {
      width: block.imageWidth ?? 200,
      height: block.imageHeight ?? 200,
    },
    ...(block.imageAlt ? { altText: { title: block.imageAlt, description: block.imageAlt, name: block.imageAlt } } : {}),
  } as ConstructorParameters<typeof ImageRun>[0])
}

export function buildBlock(block: DocxContentBlock): Paragraph | Table {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 1
      const heading = HEADING_MAP[level] ?? HeadingLevel.HEADING_1
      const props = buildParagraphProps(block)
      props.heading = heading
      props.children = [new TextRun({
        text: block.text ?? '',
        ...(block.bold !== undefined ? { bold: block.bold } : {}),
        ...(block.color ? { color: block.color } : {}),
        ...(block.fontSize !== undefined ? { size: block.fontSize * 2 } : {}),
        ...(block.fontFace ? { font: block.fontFace } : {}),
      })]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }

    case 'bullet': {
      const props = buildParagraphProps(block)
      props.bullet = { level: 0 }
      props.children = block.runs
        ? block.runs.map(buildTextRun)
        : [buildBlockTextRun(block)]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }

    case 'numbered': {
      const props = buildParagraphProps(block)
      props.numbering = { reference: 'ae-numbered-list', level: 0 }
      props.children = block.runs
        ? block.runs.map(buildTextRun)
        : [buildBlockTextRun(block)]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }

    case 'quote': {
      const props = buildParagraphProps(block)
      props.indent = { left: convertInchesToTwip(0.5) }
      props.spacing = { before: 200, after: 200 }
      if (block.quoteStyle === 'block') {
        props.border = {
          left: { style: BorderStyle.SINGLE, size: 24, color: 'CCCCCC', space: 10 },
        }
      }
      props.children = [new TextRun({
        text: block.text ?? '',
        italics: true,
        ...(block.color ? { color: block.color } : {}),
        ...(block.fontSize !== undefined ? { size: block.fontSize * 2 } : {}),
      })]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }

    case 'code': {
      const props = buildParagraphProps(block)
      props.shading = { fill: 'F5F5F5', type: ShadingType.CLEAR, color: 'auto' }
      props.spacing = { before: 100, after: 100 }
      props.indent = { left: convertInchesToTwip(0.2) }
      props.children = [new TextRun({
        text: block.text ?? '',
        font: 'Consolas',
        size: 20, // 10pt
        ...(block.color ? { color: block.color } : {}),
      })]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }

    case 'page-break': {
      return new Paragraph({ children: [new PageBreak()] })
    }

    case 'hr': {
      return new Paragraph({ children: [new ThematicBreak()] })
    }

    case 'hyperlink': {
      if (block.hyperlink) {
        return new Paragraph({ children: [buildHyperlinkRun(block.hyperlink)] })
      }
      return new Paragraph({ children: [new TextRun('')] })
    }

    case 'image': {
      return new Paragraph({ children: [buildImageRun(block)] })
    }

    case 'table': {
      if (!block.rows) return new Paragraph({ children: [new TextRun('')] })
      const rows = block.rows.map(
        (rowData) =>
          new TableRow({
            children: rowData.map(buildTableCell),
          }),
      )
      const tableProps: Record<string, unknown> = { rows }
      if (block.tableWidth !== undefined) {
        tableProps.width = { size: block.tableWidth, type: WidthType.PERCENTAGE }
      }
      if (block.tableLayout) {
        tableProps.layout = block.tableLayout === 'fixed' ? 'fixed' : 'autofit'
      }
      return new Table(tableProps as ConstructorParameters<typeof Table>[0])
    }

    default: { // paragraph
      const props = buildParagraphProps(block)
      props.children = block.runs
        ? block.runs.map(buildTextRun)
        : [buildBlockTextRun(block)]
      return new Paragraph(props as ConstructorParameters<typeof Paragraph>[0])
    }
  }
}

export function buildSection(sectionProps: DocxSectionProps | undefined, children: (Paragraph | Table)[]): Record<string, unknown> {
  const section: Record<string, unknown> = { children }
  if (sectionProps) {
    if (sectionProps.pageSize) {
      const ps: Record<string, unknown> = {}
      if (sectionProps.pageSize.width !== undefined) ps.width = convertInchesToTwip(sectionProps.pageSize.width)
      if (sectionProps.pageSize.height !== undefined) ps.height = convertInchesToTwip(sectionProps.pageSize.height)
      if (sectionProps.pageSize.orientation) {
        ps.orientation = sectionProps.pageSize.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
      }
      section.properties = { ...(section.properties as object ?? {}), page: ps }
    }
    if (sectionProps.margins) {
      const m: Record<string, unknown> = {}
      if (sectionProps.margins.top !== undefined) m.top = convertInchesToTwip(sectionProps.margins.top)
      if (sectionProps.margins.bottom !== undefined) m.bottom = convertInchesToTwip(sectionProps.margins.bottom)
      if (sectionProps.margins.left !== undefined) m.left = convertInchesToTwip(sectionProps.margins.left)
      if (sectionProps.margins.right !== undefined) m.right = convertInchesToTwip(sectionProps.margins.right)
      if (sectionProps.margins.header !== undefined) m.header = convertInchesToTwip(sectionProps.margins.header)
      if (sectionProps.margins.footer !== undefined) m.footer = convertInchesToTwip(sectionProps.margins.footer)
      const existing = (section.properties as Record<string, unknown> | undefined) ?? {}
      section.properties = { ...existing, page: { ...(existing.page as object ?? {}), margin: m } }
    }
    if (sectionProps.headers) {
      const headers: Record<string, unknown> = {}
      if (sectionProps.headers.default) {
        headers.default = new Header({ children: [new Paragraph({ children: [new TextRun(sectionProps.headers.default)] })] })
      }
      if (sectionProps.headers.first) {
        headers.first = new Header({ children: [new Paragraph({ children: [new TextRun(sectionProps.headers.first)] })] })
      }
      if (sectionProps.headers.even) {
        headers.even = new Header({ children: [new Paragraph({ children: [new TextRun(sectionProps.headers.even)] })] })
      }
      section.headers = headers
    }
    if (sectionProps.footers) {
      const footers: Record<string, unknown> = {}
      if (sectionProps.footers.default) {
        footers.default = new Footer({ children: [new Paragraph({ children: [new TextRun(sectionProps.footers.default)] })] })
      }
      if (sectionProps.footers.first) {
        footers.first = new Footer({ children: [new Paragraph({ children: [new TextRun(sectionProps.footers.first)] })] })
      }
      if (sectionProps.footers.even) {
        footers.even = new Footer({ children: [new Paragraph({ children: [new TextRun(sectionProps.footers.even)] })] })
      }
      section.footers = footers
    }
    if (sectionProps.columnCount !== undefined) {
      const existing = (section.properties as Record<string, unknown> | undefined) ?? {}
      section.properties = { ...existing, column: { count: sectionProps.columnCount, space: sectionProps.columnSpacing !== undefined ? convertInchesToTwip(sectionProps.columnSpacing) : undefined } }
    }
  }
  return section
}

