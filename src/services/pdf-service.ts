import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'

const require = createRequire(import.meta.url)
const PdfParseModule = require('pdf-parse') as {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text: string; total: number }>
  }
}

/** RGB 颜色，分量范围 0-1 */
export interface PdfColor {
  r: number
  g: number
  b: number
}

/** 标准字体名称，均为 WinAnsi 编码，不支持 CJK 字符 */
export type FontName =
  | 'Helvetica'
  | 'HelveticaBold'
  | 'HelveticaOblique'
  | 'HelveticaBoldOblique'
  | 'TimesRoman'
  | 'TimesRomanBold'
  | 'TimesRomanItalic'
  | 'TimesRomanBoldItalic'
  | 'Courier'
  | 'CourierBold'
  | 'CourierOblique'
  | 'CourierBoldOblique'

/** 页面元素，支持文本、矩形、椭圆、直线、图片 */
export interface PdfPageElement {
  type: 'text' | 'rect' | 'ellipse' | 'line' | 'image'
  // text
  text?: string
  x?: number
  y?: number
  fontSize?: number
  font?: FontName
  color?: PdfColor
  lineHeight?: number
  // rect / ellipse
  width?: number
  height?: number
  borderColor?: PdfColor
  borderWidth?: number
  fillColor?: PdfColor
  opacity?: number
  // line
  x2?: number
  y2?: number
  thickness?: number
  // image
  imagePath?: string
  imageData?: string
  imageWidth?: number
  imageHeight?: number
}

/** 页面尺寸预设或自定义 [宽, 高]（pt） */
export type PageSize = 'A4' | 'Letter' | 'Legal' | [number, number]

/** 页面规格，兼容旧的 text/fontSize，并支持元素化绘制 */
export interface PdfPageSpec {
  /** 元素化绘制（新模式） */
  elements?: PdfPageElement[]
  /** 兼容旧模式：整页文本，支持换行 */
  text?: string
  /** 兼容旧模式：字号，默认 12 */
  fontSize?: number
  /** 页面尺寸，默认 A4 */
  size?: PageSize
}

/** PDF 文档元数据 */
export interface PdfMeta {
  title?: string
  author?: string
  subject?: string
  keywords?: string[]
  creator?: string
  producer?: string
  creationDate?: string
  modificationDate?: string
}

/** 水印配置 */
export interface PdfWatermark {
  text: string
  fontSize?: number
  color?: PdfColor
  opacity?: number
  /** 旋转角度，默认 45 */
  rotation?: number
}

export type PdfOperation =
  | 'create'
  | 'merge'
  | 'split'
  | 'extract-text'
  | 'fill-form'
  | 'rotate-pages'
  | 'delete-pages'
  | 'add-watermark'

export interface PdfInput {
  operation: PdfOperation
  worktree: string
  file?: string
  files?: string[]
  title?: string
  pages?: PdfPageSpec[]
  fields?: { name: string; value: string }[]
  metadata?: PdfMeta
  /** rotate-pages 旋转角度 */
  rotation?: 90 | 180 | 270
  /** 要操作的页码（0-based），rotate-pages/delete-pages 使用 */
  pageIndices?: number[]
  /** add-watermark 水印配置 */
  watermark?: PdfWatermark
  outputPath?: string
}

export interface PdfResult {
  outputPath?: string
  outputPaths?: string[]
  summary: string
  content?: string
}

const PAGE_SIZES: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612, 792],
  Legal: [612, 1008],
}

const FONT_MAP: Record<FontName, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  HelveticaBold: StandardFonts.HelveticaBold,
  HelveticaOblique: StandardFonts.HelveticaOblique,
  HelveticaBoldOblique: StandardFonts.HelveticaBoldOblique,
  TimesRoman: StandardFonts.TimesRoman,
  TimesRomanBold: StandardFonts.TimesRomanBold,
  TimesRomanItalic: StandardFonts.TimesRomanItalic,
  TimesRomanBoldItalic: StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  CourierBold: StandardFonts.CourierBold,
  CourierOblique: StandardFonts.CourierOblique,
  CourierBoldOblique: StandardFonts.CourierBoldOblique,
}

function toColor(c?: PdfColor) {
  return c ? rgb(c.r, c.g, c.b) : undefined
}

function isJpg(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
}

function resolvePageSize(size: PageSize | undefined): [number, number] {
  if (Array.isArray(size)) return size
  const key = size ?? 'A4'
  return PAGE_SIZES[key] ?? PAGE_SIZES.A4
}

async function getFont(
  doc: PDFDocument,
  name: FontName,
  cache: Record<string, PDFFont>,
): Promise<PDFFont> {
  if (!cache[name]) {
    cache[name] = await doc.embedFont(FONT_MAP[name])
  }
  return cache[name]
}

async function drawElement(
  doc: PDFDocument,
  page: PDFPage,
  el: PdfPageElement,
  fontCache: Record<string, PDFFont>,
): Promise<void> {
  switch (el.type) {
    case 'text': {
      const fontName: FontName = el.font ?? 'Helvetica'
      const font = await getFont(doc, fontName, fontCache)
      const size = el.fontSize ?? 12
      const color = el.color ? rgb(el.color.r, el.color.g, el.color.b) : rgb(0, 0, 0)
      const lines = (el.text ?? '').split('\n')
      const startX = el.x ?? 50
      let y = el.y ?? page.getHeight() - 50
      const lineHeight = el.lineHeight ?? size + 6
      for (const line of lines) {
        if (line.length > 0) {
          page.drawText(line, { x: startX, y, size, font, color })
        }
        y -= lineHeight
      }
      break
    }
    case 'rect': {
      page.drawRectangle({
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 100,
        height: el.height ?? 50,
        borderColor: toColor(el.borderColor),
        borderWidth: el.borderWidth,
        color: toColor(el.fillColor),
        opacity: el.opacity,
      })
      break
    }
    case 'ellipse': {
      // pdf-lib 的 drawEllipse 用 xScale/yScale 表示半轴，x/y 为中心点
      page.drawEllipse({
        x: el.x ?? 0,
        y: el.y ?? 0,
        xScale: (el.width ?? 100) / 2,
        yScale: (el.height ?? 50) / 2,
        borderColor: toColor(el.borderColor),
        borderWidth: el.borderWidth,
        color: toColor(el.fillColor),
        opacity: el.opacity,
      })
      break
    }
    case 'line': {
      page.drawLine({
        start: { x: el.x ?? 0, y: el.y ?? 0 },
        end: { x: el.x2 ?? 0, y: el.y2 ?? 0 },
        thickness: el.thickness ?? 1,
        color: el.color ? rgb(el.color.r, el.color.g, el.color.b) : rgb(0, 0, 0),
      })
      break
    }
    case 'image': {
      let img: PDFImage | undefined
      if (el.imagePath) {
        const imgBytes = readFileSync(el.imagePath)
        img = isJpg(imgBytes) ? await doc.embedJpg(imgBytes) : await doc.embedPng(imgBytes)
      } else if (el.imageData) {
        const raw = el.imageData.split(',')[1] ?? el.imageData
        const imgBytes = Buffer.from(raw, 'base64')
        img = isJpg(imgBytes) ? await doc.embedJpg(imgBytes) : await doc.embedPng(imgBytes)
      }
      if (img) {
        page.drawImage(img, {
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.imageWidth ?? img.width,
          height: el.imageHeight ?? img.height,
        })
      }
      break
    }
  }
}

function applyMetadata(doc: PDFDocument, input: PdfInput): void {
  if (input.metadata) {
    const m = input.metadata
    if (m.title) doc.setTitle(m.title)
    if (m.author) doc.setAuthor(m.author)
    if (m.subject) doc.setSubject(m.subject)
    if (m.keywords) doc.setKeywords(m.keywords)
    if (m.creator) doc.setCreator(m.creator)
    if (m.producer) doc.setProducer(m.producer)
    if (m.creationDate) doc.setCreationDate(new Date(m.creationDate))
    if (m.modificationDate) doc.setModificationDate(new Date(m.modificationDate))
  }
  // title 参数作为元数据 title 的快捷方式
  if (input.title) doc.setTitle(input.title)
}

async function handleCreate(input: PdfInput): Promise<PdfResult> {
  const pages = input.pages
  if (!pages) {
    throw new Error('create 操作需要 pages 参数')
  }
  const doc = await PDFDocument.create()
  applyMetadata(doc, input)

  const fontCache: Record<string, PDFFont> = {}

  for (const pageSpec of pages) {
    const [w, h] = resolvePageSize(pageSpec.size)
    const page = doc.addPage([w, h])

    // 兼容旧模式：仅有 text/fontSize
    if (pageSpec.text && !pageSpec.elements) {
      const font = await getFont(doc, 'Helvetica', fontCache)
      const fontSize = pageSpec.fontSize ?? 12
      const lines = pageSpec.text.split('\n')
      let y = h - 50
      for (const line of lines) {
        if (line.length > 0) {
          page.drawText(line, { x: 50, y, size: fontSize, font, color: rgb(0, 0, 0) })
        }
        y -= fontSize + 6
        if (y < 50) break
      }
    }

    // 新模式：元素化绘制
    if (pageSpec.elements) {
      for (const el of pageSpec.elements) {
        await drawElement(doc, page, el, fontCache)
      }
    }
  }

  const bytes = await doc.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'create', 'pdf', input.title)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已创建 PDF 文件，包含 ${pages.length} 页`,
  }
}

async function handleMerge(input: PdfInput): Promise<PdfResult> {
  const files = input.files
  if (!files) {
    throw new Error('merge 操作需要 files 参数')
  }
  const merged = await PDFDocument.create()

  for (const file of files) {
    const src = await PDFDocument.load(readFileSync(file))
    const pages = await merged.copyPages(src, src.getPageIndices())
    pages.forEach((p) => merged.addPage(p))
  }

  const bytes = await merged.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'merge', 'pdf')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已合并 ${files.length} 个 PDF 文件`,
  }
}

async function handleSplit(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('split 操作需要 file 参数')
  }
  const src = await PDFDocument.load(readFileSync(file))
  const total = src.getPageCount()
  const outputPaths: string[] = []

  for (let i = 0; i < total; i++) {
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(src, [i])
    out.addPage(page)
    const bytes = await out.save()
    const pagePath = generateDocumentOutputPath(
      input.worktree,
      'split',
      'pdf',
      `${file}-page${i + 1}`,
    )
    mkdirSync(path.dirname(pagePath), { recursive: true })
    writeFileSync(pagePath, bytes)
    outputPaths.push(pagePath)
  }

  return {
    outputPaths,
    summary: `已将 PDF 拆分为 ${total} 个单页文件`,
  }
}

async function handleExtractText(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('extract-text 操作需要 file 参数')
  }
  const dataBuffer = readFileSync(file)
  const parser = new PdfParseModule.PDFParse({ data: dataBuffer })
  const data = await parser.getText()

  return {
    summary: `已提取文本，共 ${data.total} 页`,
    content: data.text.slice(0, 8000),
  }
}

async function handleFillForm(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  const fields = input.fields
  if (!file) {
    throw new Error('fill-form 操作需要 file 参数')
  }
  if (!fields) {
    throw new Error('fill-form 操作需要 fields 参数')
  }
  const doc = await PDFDocument.load(readFileSync(file))
  const form = doc.getForm()

  let filledCount = 0
  for (const { name, value } of fields) {
    try {
      const field = form.getField(name)
      if ('setText' in field) {
        ;(field as { setText: (v: string) => void }).setText(value)
        filledCount++
      } else if ('check' in field) {
        const shouldCheck = ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
        const checkBox = field as unknown as { check: () => void; uncheck: () => void }
        if (shouldCheck) {
          checkBox.check()
        } else {
          checkBox.uncheck()
        }
        filledCount++
      }
    } catch {
      // 跳过不存在的字段
    }
  }

  const bytes = await doc.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'fill-form', 'pdf', file)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已填写 ${filledCount}/${fields.length} 个表单字段`,
  }
}

async function handleRotatePages(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('rotate-pages 操作需要 file 参数')
  }
  const doc = await PDFDocument.load(readFileSync(file))
  const rotation = input.rotation ?? 90
  const targetIndices = input.pageIndices
  const pages = targetIndices
    ? targetIndices.map((i) => doc.getPage(i))
    : doc.getPages()

  for (const page of pages) {
    const current = page.getRotation().angle
    page.setRotation(degrees((current + rotation) % 360))
  }

  const bytes = await doc.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'rotate-pages', 'pdf', file)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已旋转 ${pages.length} 个页面 ${rotation} 度`,
  }
}

async function handleDeletePages(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('delete-pages 操作需要 file 参数')
  }
  const indices = input.pageIndices ?? []
  if (indices.length === 0) {
    throw new Error('delete-pages 操作需要 pageIndices 参数')
  }
  const doc = await PDFDocument.load(readFileSync(file))
  const total = doc.getPageCount()
  const keepIndices = doc.getPageIndices().filter((i) => !indices.includes(i))

  const newDoc = await PDFDocument.create()
  const keptPages = await newDoc.copyPages(doc, keepIndices)
  keptPages.forEach((p) => newDoc.addPage(p))

  const bytes = await newDoc.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'delete-pages', 'pdf', file)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已删除 ${indices.length} 个页面，剩余 ${keepIndices.length}/${total} 页`,
  }
}

async function handleAddWatermark(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('add-watermark 操作需要 file 参数')
  }
  const wm = input.watermark
  if (!wm) {
    throw new Error('add-watermark 操作需要 watermark 参数')
  }
  const doc = await PDFDocument.load(readFileSync(file))
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontSize = wm.fontSize ?? 50
  const opacity = wm.opacity ?? 0.3
  const rotation = wm.rotation ?? 45
  const color = wm.color ? rgb(wm.color.r, wm.color.g, wm.color.b) : rgb(0.5, 0.5, 0.5)

  const pages = doc.getPages()
  for (const page of pages) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(wm.text, fontSize)
    page.drawText(wm.text, {
      x: (width - textWidth * Math.cos((rotation * Math.PI) / 180)) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(rotation),
    })
  }

  const bytes = await doc.save()
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'add-watermark', 'pdf', file)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, bytes)

  return {
    outputPath,
    summary: `已为 ${pages.length} 个页面添加水印`,
  }
}

export async function processPdf(input: PdfInput): Promise<PdfResult> {
  switch (input.operation) {
    case 'create':
      return handleCreate(input)
    case 'merge':
      return handleMerge(input)
    case 'split':
      return handleSplit(input)
    case 'extract-text':
      return handleExtractText(input)
    case 'fill-form':
      return handleFillForm(input)
    case 'rotate-pages':
      return handleRotatePages(input)
    case 'delete-pages':
      return handleDeletePages(input)
    case 'add-watermark':
      return handleAddWatermark(input)
  }
}
