import { existsSync } from 'node:fs'

import type {
  PptxInputElement,
  PptxTextRun,
  PptxShapeFill,
  PptxShapeLine,
  PptxShadow,
  PptxHyperlink,
  PptxBullet,
  PptxTableCell,
  PptxBackground,
  PptxSlideContent,
  PptxPresentationMeta,
} from './pptx-service.js'

export interface PptxInstance {
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

export interface PptxSlideInstance {
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
export function toCoord(v: number | string | undefined): number | string | undefined {
  return v
}

export function toFillProps(fill?: PptxShapeFill) {
  if (!fill) return undefined
  return {
    ...(fill.color ? { color: fill.color } : {}),
    ...(fill.transparency !== undefined ? { transparency: fill.transparency } : {}),
    ...(fill.type ? { type: fill.type } : {}),
  }
}

export function toLineProps(line?: PptxShapeLine) {
  if (!line) return undefined
  return {
    ...toFillProps(line),
    ...(line.width !== undefined ? { width: line.width } : {}),
    ...(line.dashType ? { dashType: line.dashType } : {}),
    ...(line.beginArrowType ? { beginArrowType: line.beginArrowType } : {}),
    ...(line.endArrowType ? { endArrowType: line.endArrowType } : {}),
  }
}

export function toShadowProps(shadow?: PptxShadow) {
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

export function toHyperlinkProps(hl?: PptxHyperlink) {
  if (!hl) return undefined
  return {
    ...(hl.url ? { url: hl.url } : {}),
    ...(hl.slide !== undefined ? { slide: hl.slide } : {}),
    ...(hl.tooltip ? { tooltip: hl.tooltip } : {}),
  }
}

export function toBulletProps(bullet?: boolean | PptxBullet) {
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

export function toUnderlineProps(u?: { style?: string; color?: string }) {
  if (!u) return undefined
  const r: Record<string, unknown> = {}
  if (u.style) r.style = u.style
  if (u.color) r.color = u.color
  return r
}

/**
 * 构建文本运行数组，供 pptxgenjs addText 使用。
 *
 * pptxgenjs 的 addText 当接收数组参数时，每个元素需要 { text, options } 结构：
 * 属性必须放在 options 子对象内，而非对象顶层。若属性直接放在顶层，pptxgenjs
 * 不会读取 color/bold/fontSize/fontFace 等属性，导致回退到主题默认色（#000000）。
 *
 * 颜色传播：当 run 未显式设置 color 但元素级别有 color 时，将元素级 color
 * 传播到 run 的 options.color，防止回退到主题默认黑色。
 */
export function buildTextRuns(runs?: PptxTextRun[], elementColor?: string): unknown[] | undefined {
  if (!runs) return undefined
  return runs.map((run) => {
    const options: Record<string, unknown> = {}
    if (run.bold !== undefined) options.bold = run.bold
    if (run.italic !== undefined) options.italic = run.italic
    if (run.fontSize !== undefined) options.fontSize = run.fontSize
    // 若 run 未显式设置 color 但元素级别有 color，传播到 run 防止回退到主题默认黑色
    if (run.color) {
      options.color = run.color
    } else if (elementColor) {
      options.color = elementColor
    }
    if (run.fontFace) options.fontFace = run.fontFace
    if (run.align) options.align = run.align
    if (run.valign) options.valign = run.valign
    if (run.breakLine !== undefined) options.breakLine = run.breakLine
    if (run.bullet !== undefined) options.bullet = toBulletProps(run.bullet)
    if (run.underline) options.underline = toUnderlineProps(run.underline)
    if (run.strike !== undefined) options.strike = run.strike
    if (run.subscript !== undefined) options.subscript = run.subscript
    if (run.superscript !== undefined) options.superscript = run.superscript
    if (run.highlight) options.highlight = run.highlight
    if (run.charSpacing !== undefined) options.charSpacing = run.charSpacing
    if (run.hyperlink) options.hyperlink = toHyperlinkProps(run.hyperlink)
    if (run.lang) options.lang = run.lang
    const r: Record<string, unknown> = { text: run.text }
    if (Object.keys(options).length > 0) r.options = options
    return r
  })
}

export function buildTextOptions(el: PptxInputElement): Record<string, unknown> {
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

export function buildImageOptions(el: PptxInputElement): Record<string, unknown> {
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

export function buildShapeOptions(el: PptxInputElement): Record<string, unknown> {
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

export function buildTableCell(cell: PptxTableCell): unknown {
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

export function buildTableOptions(el: PptxInputElement): Record<string, unknown> {
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

export function buildChartOptions(el: PptxInputElement): Record<string, unknown> {
  const opts: Record<string, unknown> = {}
  if (el.x !== undefined) opts.x = toCoord(el.x)
  if (el.y !== undefined) opts.y = toCoord(el.y)
  if (el.w !== undefined) opts.w = toCoord(el.w)
  if (el.h !== undefined) opts.h = toCoord(el.h)
  if (el.chartOptions) Object.assign(opts, el.chartOptions)
  return opts
}

export function buildMediaOptions(el: PptxInputElement): Record<string, unknown> {
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

export function drawElement(slide: PptxSlideInstance, el: PptxInputElement): void {
  switch (el.type) {
    case 'text': {
      const textContent = el.textRuns ? buildTextRuns(el.textRuns, el.color) : (el.text ?? '')
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
    case 'svg': {
      // SVG 矢量图形元素不在 PptxGenJS 阶段渲染，由 pptx-service.ts 的
      // AdmZip 后处理注入 ASVG 扩展完成。此处为空 case，仅用于类型完整性。
      break
    }
  }
}

export function applyPresentationMeta(pptx: PptxInstance, meta?: PptxPresentationMeta): void {
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

export function applySlideBackground(slide: PptxSlideInstance, bg?: PptxBackground): void {
  if (!bg) return
  const bgProps: Record<string, unknown> = {}
  if (bg.color) bgProps.color = bg.color
  if (bg.transparency !== undefined) bgProps.transparency = bg.transparency
  if (bg.path) bgProps.path = bg.path
  if (bg.data) bgProps.data = bg.data
  slide.background = bgProps
}

export function applySlideNumber(slide: PptxSlideInstance, show?: boolean): void {
  if (show) {
    slide.slideNumber = { x: 0.5, y: 7.0, fontSize: 10, color: '888888' }
  }
}

export function buildSlide(pptx: PptxInstance, slideContent: PptxSlideContent): PptxSlideInstance {
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
