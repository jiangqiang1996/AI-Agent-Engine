import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import AdmZip from 'adm-zip'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'

const require = createRequire(import.meta.url)

// pptxgenjs 是 CJS 函数导出，通过 createRequire 获取构造函数
// 类型定义参考 node_modules/pptxgenjs/types/index.d.ts
const PptxGenJS = require('pptxgenjs') as new () => PptxInstance

interface PptxInstance {
  defineLayout: (layout: { name: string; width: number; height: number }) => void
  defineSlideMaster: (props: unknown) => void
  addSection: (props: { title: string; order?: number }) => void
  addSlide: (props?: { masterName?: string; sectionTitle?: string }) => PptxSlideInstance
  layout: string
  title?: string
  author?: string
  company?: string
  subject?: string
  revision?: string
  rtlMode?: boolean
  presLayout?: { name: string; width: number; height: number }
  write: (options: { outputType: string }) => Promise<Buffer>
}

interface PptxSlideInstance {
  addText: (text: string | unknown[], options?: unknown) => void
  addImage: (options: unknown) => void
  addShape: (shapeName: string, options?: unknown) => void
  addTable: (rows: unknown[], options?: unknown) => void
  addChart: (type: string, data: unknown[], options?: unknown) => void
  addMedia: (options: unknown) => void
  addNotes: (notes: string) => void
  background?: unknown
  color?: string
  hidden?: boolean
  slideNumber?: unknown
}

const SLIDE_XML_PATTERN = /^ppt\/slides\/slide\d+\.xml$/
const SLIDE_TEXT_REGEX = /<a:t[^>]*>([^<]*)<\/a:t>/g

export type PptxOperation = 'create' | 'edit' | 'analyze'

// ==================== 文本运行类型 ====================

export interface PptxBullet {
  type?: 'bullet' | 'number'
  characterCode?: string
  indent?: number
  numberType?: string
  numberStartAt?: number
}

export interface PptxHyperlink {
  url?: string
  slide?: number
  tooltip?: string
}

export interface PptxTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fontFace?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  breakLine?: boolean
  bullet?: boolean | PptxBullet
  underline?: { style?: string; color?: string }
  strike?: boolean | string
  subscript?: boolean
  superscript?: boolean
  highlight?: string
  charSpacing?: number
  hyperlink?: PptxHyperlink
  lang?: string
}

// ==================== 填充与边框类型 ====================

export interface PptxShapeFill {
  color?: string
  transparency?: number
  type?: 'none' | 'solid'
}

export interface PptxBorder {
  type?: 'none' | 'dash' | 'solid'
  color?: string
  pt?: number
}

export interface PptxShapeLine extends PptxShapeFill {
  width?: number
  dashType?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
  beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
  endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
}

export interface PptxShadow {
  type?: 'outer' | 'inner' | 'none'
  opacity?: number
  blur?: number
  angle?: number
  offset?: number
  color?: string
  rotateWithShape?: boolean
}

export interface PptxBackground {
  color?: string
  transparency?: number
  path?: string
  data?: string
}

// ==================== 元素类型 ====================

export interface PptxImageSizing {
  type: 'contain' | 'cover' | 'crop'
  w: number | string
  h: number | string
  x?: number | string
  y?: number | string
}

export interface PptxTableCell {
  text?: string
  rowspan?: number
  colspan?: number
  fill?: PptxShapeFill
  border?: PptxBorder | [PptxBorder, PptxBorder, PptxBorder, PptxBorder]
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  hyperlink?: PptxHyperlink
  margin?: number | [number, number, number, number]
}

export interface PptxInputElement {
  type: 'text' | 'image' | 'shape' | 'table' | 'chart' | 'media'
  // 通用位置
  x?: number | string
  y?: number | string
  w?: number | string
  h?: number | string
  // text
  text?: string
  textRuns?: PptxTextRun[]
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  fontFace?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  bullet?: boolean | PptxBullet
  lineSpacing?: number
  lineSpacingMultiple?: number
  fill?: PptxShapeFill
  line?: PptxShapeLine
  shadow?: PptxShadow
  rotate?: number
  hyperlink?: PptxHyperlink
  margin?: number | [number, number, number, number]
  fit?: 'none' | 'shrink' | 'resize'
  isTextBox?: boolean
  indentLevel?: number
  charSpacing?: number
  paraSpaceAfter?: number
  paraSpaceBefore?: number
  wrap?: boolean
  rtlMode?: boolean
  // image
  imagePath?: string
  imageData?: string
  altText?: string
  rounding?: boolean
  transparency?: number
  flipH?: boolean
  flipV?: boolean
  sizing?: PptxImageSizing
  // shape
  shape?: string
  rectRadius?: number
  points?: unknown[]
  // table
  rows?: PptxTableCell[][]
  colW?: number | number[]
  rowH?: number | number[]
  autoPage?: boolean
  autoPageRepeatHeader?: boolean
  autoPageHeaderRows?: number
  // chart
  chartType?: string
  chartData?: unknown[]
  chartOptions?: unknown
  // media
  mediaType?: 'audio' | 'video' | 'online'
  mediaPath?: string
  mediaLink?: string
  mediaCover?: string
}

// ==================== 幻灯片类型 ====================

export interface PptxSlideContent {
  /** 元素化绘制（新模式） */
  elements?: PptxInputElement[]
  /** 兼容旧模式：标题文本 */
  title?: string
  /** 兼容旧模式：正文文本 */
  body?: string
  /** 兼容旧模式：布局类型 */
  layout?: 'title' | 'section' | 'content' | 'blank'
  /** 演讲者备注 */
  notes?: string
  /** 幻灯片背景 */
  background?: PptxBackground
  /** 是否隐藏 */
  hidden?: boolean
  /** 是否显示页码 */
  slideNumber?: boolean
  /** 使用的母版名称 */
  masterName?: string
  /** 所属章节标题 */
  sectionTitle?: string
}

// ==================== 母版、章节、布局类型 ====================

export interface PptxMasterObject {
  text?: { text: string; options?: unknown }
  image?: unknown
  rect?: unknown
  line?: unknown
  chart?: unknown
  placeholder?: { options: { name: string; type: string; x?: number | string; y?: number | string; w?: number | string; h?: number | string }; text?: string }
}

export interface PptxMasterDef {
  title: string
  background?: PptxBackground
  margin?: number | [number, number, number, number]
  slideNumber?: boolean
  objects?: PptxMasterObject[]
}

export interface PptxSectionDef {
  title: string
  order?: number
}

export interface PptxLayoutDef {
  name: string
  width: number
  height: number
}

export interface PptxPresentationMeta {
  author?: string
  company?: string
  subject?: string
  revision?: string
  title?: string
  rtlMode?: boolean
  headFontFace?: string
  bodyFontFace?: string
}

// ==================== 输入输出类型 ====================

export interface PptxInput {
  operation: PptxOperation
  worktree: string
  file?: string
  title?: string
  slides?: PptxSlideContent[]
  masters?: PptxMasterDef[]
  sections?: PptxSectionDef[]
  layouts?: PptxLayoutDef[]
  /** 使用的布局名称 */
  layout?: string
  presentationMeta?: PptxPresentationMeta
  replacements?: { find: string; replace: string }[]
  outputPath?: string
}

export interface PptxResult {
  outputPath?: string
  summary: string
  content?: string
}

// ==================== 辅助函数 ====================

function toCoord(v: number | string | undefined): number | string | undefined {
  return v
}

function toFillProps(fill?: PptxShapeFill) {
  if (!fill) return undefined
  return {
    ...(fill.color ? { color: fill.color } : {}),
    ...(fill.transparency !== undefined ? { transparency: fill.transparency } : {}),
    ...(fill.type ? { type: fill.type } : {}),
  }
}

function toLineProps(line?: PptxShapeLine) {
  if (!line) return undefined
  return {
    ...toFillProps(line),
    ...(line.width !== undefined ? { width: line.width } : {}),
    ...(line.dashType ? { dashType: line.dashType } : {}),
    ...(line.beginArrowType ? { beginArrowType: line.beginArrowType } : {}),
    ...(line.endArrowType ? { endArrowType: line.endArrowType } : {}),
  }
}

function toShadowProps(shadow?: PptxShadow) {
  if (!shadow) return undefined
  return {
    ...(shadow.type ? { type: shadow.type } : {}),
    ...(shadow.opacity !== undefined ? { opacity: shadow.opacity } : {}),
    ...(shadow.blur !== undefined ? { blur: shadow.blur } : {}),
    ...(shadow.angle !== undefined ? { angle: shadow.angle } : {}),
    ...(shadow.offset !== undefined ? { offset: shadow.offset } : {}),
    ...(shadow.color ? { color: shadow.color } : {}),
    ...(shadow.rotateWithShape !== undefined ? { rotateWithShape: shadow.rotateWithShape } : {}),
  }
}

function toHyperlinkProps(hl?: PptxHyperlink) {
  if (!hl) return undefined
  return {
    ...(hl.url ? { url: hl.url } : {}),
    ...(hl.slide !== undefined ? { slide: hl.slide } : {}),
    ...(hl.tooltip ? { tooltip: hl.tooltip } : {}),
  }
}

function toBulletProps(bullet?: boolean | PptxBullet) {
  if (bullet === undefined) return undefined
  if (bullet === true) return true
  if (bullet === false) return false
  const b: Record<string, unknown> = {}
  if (bullet.type) b.type = bullet.type
  if (bullet.characterCode) b.characterCode = bullet.characterCode
  if (bullet.indent !== undefined) b.indent = bullet.indent
  if (bullet.numberType) b.numberType = bullet.numberType
  if (bullet.numberStartAt !== undefined) b.numberStartAt = bullet.numberStartAt
  return b
}

function toUnderlineProps(u?: { style?: string; color?: string }) {
  if (!u) return undefined
  const r: Record<string, unknown> = {}
  if (u.style) r.style = u.style
  if (u.color) r.color = u.color
  return r
}

function buildTextRuns(runs?: PptxTextRun[]): unknown[] | undefined {
  if (!runs) return undefined
  return runs.map((run) => {
    const r: Record<string, unknown> = { text: run.text }
    if (run.bold !== undefined) r.bold = run.bold
    if (run.italic !== undefined) r.italic = run.italic
    if (run.fontSize !== undefined) r.fontSize = run.fontSize
    if (run.color) r.color = run.color
    if (run.fontFace) r.fontFace = run.fontFace
    if (run.align) r.align = run.align
    if (run.valign) r.valign = run.valign
    if (run.breakLine !== undefined) r.breakLine = run.breakLine
    if (run.bullet !== undefined) r.bullet = toBulletProps(run.bullet)
    if (run.underline) r.underline = toUnderlineProps(run.underline)
    if (run.strike !== undefined) r.strike = run.strike
    if (run.subscript !== undefined) r.subscript = run.subscript
    if (run.superscript !== undefined) r.superscript = run.superscript
    if (run.highlight) r.highlight = run.highlight
    if (run.charSpacing !== undefined) r.charSpacing = run.charSpacing
    if (run.hyperlink) r.hyperlink = toHyperlinkProps(run.hyperlink)
    if (run.lang) r.lang = run.lang
    return r
  })
}

function buildTextOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.fontSize !== undefined) opts.fontSize = el.fontSize
  if (el.bold !== undefined) opts.bold = el.bold
  if (el.italic !== undefined) opts.italic = el.italic
  if (el.color) opts.color = el.color
  if (el.fontFace) opts.fontFace = el.fontFace
  if (el.align) opts.align = el.align
  if (el.valign) opts.valign = el.valign
  if (el.bullet !== undefined) opts.bullet = toBulletProps(el.bullet)
  if (el.lineSpacing !== undefined) opts.lineSpacing = el.lineSpacing
  if (el.lineSpacingMultiple !== undefined) opts.lineSpacingMultiple = el.lineSpacingMultiple
  if (el.fill) opts.fill = toFillProps(el.fill)
  if (el.line) opts.line = toLineProps(el.line)
  if (el.shadow) opts.shadow = toShadowProps(el.shadow)
  if (el.rotate !== undefined) opts.rotate = el.rotate
  if (el.hyperlink) opts.hyperlink = toHyperlinkProps(el.hyperlink)
  if (el.margin !== undefined) opts.margin = el.margin
  if (el.fit) opts.fit = el.fit
  if (el.isTextBox !== undefined) opts.isTextBox = el.isTextBox
  if (el.indentLevel !== undefined) opts.indentLevel = el.indentLevel
  if (el.charSpacing !== undefined) opts.charSpacing = el.charSpacing
  if (el.paraSpaceAfter !== undefined) opts.paraSpaceAfter = el.paraSpaceAfter
  if (el.paraSpaceBefore !== undefined) opts.paraSpaceBefore = el.paraSpaceBefore
  if (el.wrap !== undefined) opts.wrap = el.wrap
  if (el.rtlMode !== undefined) opts.rtlMode = el.rtlMode
  return opts
}

function buildImageOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.imagePath) opts.path = el.imagePath
  if (el.imageData) {
    // pptxgenjs 要求 base64 数据带 MIME 前缀，如 "image/png;base64,..."
    let data = el.imageData
    if (!data.startsWith('image/')) {
      const mime = data.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
      data = `${mime};base64,${data}`
    }
    opts.data = data
  }
  if (el.altText) opts.altText = el.altText
  if (el.rounding !== undefined) opts.rounding = el.rounding
  if (el.transparency !== undefined) opts.transparency = el.transparency
  if (el.flipH !== undefined) opts.flipH = el.flipH
  if (el.flipV !== undefined) opts.flipV = el.flipV
  if (el.rotate !== undefined) opts.rotate = el.rotate
  if (el.hyperlink) opts.hyperlink = toHyperlinkProps(el.hyperlink)
  if (el.shadow) opts.shadow = toShadowProps(el.shadow)
  if (el.sizing) opts.sizing = el.sizing
  return opts
}

function buildShapeOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.align) opts.align = el.align
  if (el.fill) opts.fill = toFillProps(el.fill)
  if (el.line) opts.line = toLineProps(el.line)
  if (el.shadow) opts.shadow = toShadowProps(el.shadow)
  if (el.rotate !== undefined) opts.rotate = el.rotate
  if (el.flipH !== undefined) opts.flipH = el.flipH
  if (el.flipV !== undefined) opts.flipV = el.flipV
  if (el.rectRadius !== undefined) opts.rectRadius = el.rectRadius
  if (el.points) opts.points = el.points
  if (el.hyperlink) opts.hyperlink = toHyperlinkProps(el.hyperlink)
  return opts
}

function buildTableCell(cell: PptxTableCell): unknown {
  const r: Record<string, unknown> = {}
  if (cell.text !== undefined) r.text = cell.text
  if (cell.rowspan !== undefined) r.rowSpan = cell.rowspan
  if (cell.colspan !== undefined) r.colSpan = cell.colspan
  if (cell.fill) r.fill = toFillProps(cell.fill)
  if (cell.border) r.border = cell.border
  if (cell.bold !== undefined) r.bold = cell.bold
  if (cell.italic !== undefined) r.italic = cell.italic
  if (cell.fontSize !== undefined) r.fontSize = cell.fontSize
  if (cell.color) r.color = cell.color
  if (cell.align) r.align = cell.align
  if (cell.valign) r.valign = cell.valign
  if (cell.hyperlink) r.hyperlink = toHyperlinkProps(cell.hyperlink)
  if (cell.margin !== undefined) r.margin = cell.margin
  return { text: cell.text ?? '', options: r }
}

function buildTableOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.colW !== undefined) opts.colW = el.colW
  if (el.rowH !== undefined) opts.rowH = el.rowH
  if (el.autoPage !== undefined) opts.autoPage = el.autoPage
  if (el.autoPageRepeatHeader !== undefined) opts.autoPageRepeatHeader = el.autoPageRepeatHeader
  if (el.autoPageHeaderRows !== undefined) opts.autoPageHeaderRows = el.autoPageHeaderRows
  if (el.align) opts.align = el.align
  if (el.fontSize !== undefined) opts.fontSize = el.fontSize
  if (el.color) opts.color = el.color
  if (el.fontFace) opts.fontFace = el.fontFace
  if (el.fill) opts.fill = toFillProps(el.fill)
  if (el.margin !== undefined) opts.margin = el.margin
  return opts
}

function buildChartOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.chartOptions) Object.assign(opts, el.chartOptions)
  return opts
}

function buildMediaOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.mediaType) opts.type = el.mediaType
  if (el.mediaPath) opts.path = el.mediaPath
  if (el.mediaLink) opts.link = el.mediaLink
  if (el.mediaCover) opts.cover = el.mediaCover
  return opts
}

function drawElement(slide: PptxSlideInstance, el: PptxInputElement): void {
  switch (el.type) {
    case 'text': {
      const textContent = el.textRuns ? buildTextRuns(el.textRuns) : (el.text ?? '')
      const options = buildTextOptions(el)
      slide.addText(textContent as string, options)
      break
    }
    case 'image': {
      const options = buildImageOptions(el)
      slide.addImage(options)
      break
    }
    case 'shape': {
      const shapeName = el.shape ?? 'rect'
      const options = buildShapeOptions(el)
      slide.addShape(shapeName, options)
      break
    }
    case 'table': {
      if (el.rows) {
        const rows = el.rows.map((row) => row.map(buildTableCell))
        const options = buildTableOptions(el)
        slide.addTable(rows, options)
      }
      break
    }
    case 'chart': {
      if (el.chartType && el.chartData) {
        const options = buildChartOptions(el)
        slide.addChart(el.chartType, el.chartData, options)
      }
      break
    }
    case 'media': {
      const options = buildMediaOptions(el)
      slide.addMedia(options)
      break
    }
  }
}

function applyPresentationMeta(pptx: PptxInstance, meta?: PptxPresentationMeta): void {
  if (!meta) return
  if (meta.author) pptx.author = meta.author
  if (meta.company) pptx.company = meta.company
  if (meta.subject) pptx.subject = meta.subject
  if (meta.revision) pptx.revision = meta.revision
  if (meta.title) pptx.title = meta.title
  if (meta.rtlMode !== undefined) pptx.rtlMode = meta.rtlMode
  if (meta.headFontFace || meta.bodyFontFace) {
    const theme = pptx as unknown as { theme: { headFontFace?: string; bodyFontFace?: string } }
    if (!theme.theme) theme.theme = {}
    if (meta.headFontFace) theme.theme.headFontFace = meta.headFontFace
    if (meta.bodyFontFace) theme.theme.bodyFontFace = meta.bodyFontFace
  }
}

function applySlideBackground(slide: PptxSlideInstance, bg?: PptxBackground): void {
  if (!bg) return
  const bgProps: Record<string, unknown> = {}
  if (bg.color) bgProps.color = bg.color
  if (bg.transparency !== undefined) bgProps.transparency = bg.transparency
  if (bg.path) bgProps.path = bg.path
  if (bg.data) bgProps.data = bg.data
  slide.background = bgProps
}

function applySlideNumber(slide: PptxSlideInstance, show?: boolean): void {
  if (show) {
    slide.slideNumber = { x: 0.5, y: 7.0, fontSize: 10, color: '888888' }
  }
}

function buildSlide(pptx: PptxInstance, slideContent: PptxSlideContent): PptxSlideInstance {
  const slideProps: { masterName?: string; sectionTitle?: string } = {}
  if (slideContent.masterName) slideProps.masterName = slideContent.masterName
  if (slideContent.sectionTitle) slideProps.sectionTitle = slideContent.sectionTitle

  const slide = pptx.addSlide(slideProps)

  // 应用背景
  applySlideBackground(slide, slideContent.background)

  // 隐藏幻灯片
  if (slideContent.hidden) slide.hidden = true

  // 页码
  applySlideNumber(slide, slideContent.slideNumber)

  // 元素化模式
  if (slideContent.elements) {
    for (const el of slideContent.elements) {
      drawElement(slide, el)
    }
  } else {
    // 兼容旧模式：layout-based
    const layout = slideContent.layout ?? 'content'
    switch (layout) {
      case 'title':
        slide.addText(slideContent.title ?? '', {
          x: 0.5, y: 2, w: 12, h: 2,
          fontSize: 44, bold: true, align: 'center',
        })
        if (slideContent.body) {
          slide.addText(slideContent.body, {
            x: 1, y: 4, w: 11, h: 1,
            fontSize: 20, align: 'center',
          })
        }
        break
      case 'section':
        slide.addText(slideContent.title ?? '', {
          x: 0.5, y: 3, w: 12, h: 1.5,
          fontSize: 36, bold: true, align: 'left',
        })
        break
      case 'blank':
        break
      default: // content
        if (slideContent.title) {
          slide.addText(slideContent.title, {
            x: 0.5, y: 0.3, w: 12, h: 1,
            fontSize: 28, bold: true,
          })
        }
        if (slideContent.body) {
          slide.addText(slideContent.body, {
            x: 0.5, y: 1.5, w: 12, h: 5,
            fontSize: 18, lineSpacingMultiple: 1.5,
          })
        }
    }
  }

  if (slideContent.notes) {
    slide.addNotes(slideContent.notes)
  }

  return slide
}

// ==================== create 操作 ====================

async function handleCreate(input: PptxInput): Promise<PptxResult> {
  const slides = input.slides
  if (!slides) {
    throw new Error('create 操作需要 slides 参数')
  }
  const pptx = new PptxGenJS()

  // 自定义布局必须先定义再使用
  if (input.layouts) {
    for (const layout of input.layouts) {
      pptx.defineLayout({ name: layout.name, width: layout.width, height: layout.height })
    }
  }

  // 设置使用的布局（自定义布局需先定义）
  const layoutName = input.layout ?? 'LAYOUT_WIDE'
  pptx.layout = layoutName

  // 演示文稿元数据
  if (input.title) pptx.title = input.title
  applyPresentationMeta(pptx, input.presentationMeta)

  // 定义母版
  if (input.masters) {
    for (const master of input.masters) {
      const masterProps: Record<string, unknown> = { title: master.title }
      if (master.background) {
        const bg: Record<string, unknown> = {}
        if (master.background.color) bg.color = master.background.color
        if (master.background.transparency !== undefined) bg.transparency = master.background.transparency
        if (master.background.path) bg.path = master.background.path
        if (master.background.data) bg.data = master.background.data
        masterProps.background = bg
      }
      if (master.margin !== undefined) masterProps.margin = master.margin
      if (master.slideNumber) masterProps.slideNumber = { x: 0.5, y: 7.0, fontSize: 10, color: '888888' }
      if (master.objects) masterProps.objects = master.objects
      pptx.defineSlideMaster(masterProps)
    }
  }

  // 添加章节
  if (input.sections) {
    for (const section of input.sections) {
      pptx.addSection({ title: section.title, ...(section.order !== undefined ? { order: section.order } : {}) })
    }
  }

  // 构建幻灯片
  for (const slideContent of slides) {
    buildSlide(pptx, slideContent)
  }

  const data = await pptx.write({ outputType: 'nodebuffer' })
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'create', 'pptx', input.title)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, data)

  return {
    outputPath,
    summary: `已创建 PPTX 文件，包含 ${slides.length} 张幻灯片`,
  }
}

// ==================== edit 操作 ====================

function handleEdit(input: PptxInput): PptxResult {
  const file = input.file
  const replacements = input.replacements
  if (!file) {
    throw new Error('edit 操作需要 file 参数')
  }
  if (!replacements) {
    throw new Error('edit 操作需要 replacements 参数')
  }
  const zip = new AdmZip(file)
  let replacementCount = 0

  for (const entry of zip.getEntries()) {
    if (entry.entryName.match(SLIDE_XML_PATTERN)) {
      let xml = entry.getData().toString('utf8')
      for (const { find, replace } of replacements) {
        if (xml.includes(find)) {
          xml = xml.split(find).join(replace)
          replacementCount++
        }
      }
      zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'))
    }
  }

  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'edit', 'pptx', file)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  zip.writeZip(outputPath)

  return {
    outputPath,
    summary: `已编辑 PPTX 文件，执行 ${replacementCount} 处替换`,
  }
}

// ==================== analyze 操作 ====================

function handleAnalyze(input: PptxInput): PptxResult {
  const file = input.file
  if (!file) {
    throw new Error('analyze 操作需要 file 参数')
  }
  const zip = new AdmZip(file)
  const slideEntries = zip.getEntries().filter((e) => e.entryName.match(SLIDE_XML_PATTERN))

  const slideSummaries: string[] = []
  for (const entry of slideEntries) {
    const xml = entry.getData().toString('utf8')
    const texts = xml.match(SLIDE_TEXT_REGEX) ?? []
    const textContent = texts.map((t) => t.replace(/<[^>]+>/g, '')).join(' | ')
    slideSummaries.push(`### ${entry.entryName}\n${textContent}`)
  }

  return {
    summary: `分析完成：共 ${slideEntries.length} 张幻灯片`,
    content: slideSummaries.join('\n\n').slice(0, 8000),
  }
}

// ==================== 入口 ====================

export async function processPptx(input: PptxInput): Promise<PptxResult> {
  switch (input.operation) {
    case 'create':
      return handleCreate(input)
    case 'edit':
      return handleEdit(input)
    case 'analyze':
      return handleAnalyze(input)
  }
}
