import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path, { join } from 'node:path'

import { withBackup } from '../utils/file-backup.js'

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import { PDFParse as PdfParseClass } from 'pdf-parse'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'
import { isInsideRoot } from '../utils/path-utils.js'
import { convertPdfToMarkdown } from './pdf-markdown-converter.js'
import { loadDocumentFile } from './document-file-loader.js'
import { writeMarkdownOutput } from './markdown-output-writer.js'
import { pdfToImages } from './pdf-to-image-service.js'

/** PDF extract-text 返回给 LLM 的最大字符数，超出截断 */
const PDF_EXTRACT_TEXT_MAX_CHARS = 8000

/**
 * pdf-parse 模块类型
 */
type PdfParseModule = {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text: string; total: number }>
  }
}

/**
 * 首次使用 pdf-parse 时保存/还原 global.Path2D 等全局变量。
 *
 * pdf-parse 内部通过 fake worker 加载 @napi-rs/canvas 时会设置
 * global.Path2D / global.DOMMatrix / global.ImageData（@napi-rs/canvas 原生版）。
 * 这会导致后续 pdfjs-dist 渲染 PDF 时误用 canvas 的 Path2D
 * 替代浏览器 Path2D，触发 "Value is none of these types `String`, `Path`" 错误。
 *
 * 策略：在首次使用 pdf-parse 前保存受影响的全局变量，加载后立即还原。
 */
let pdfParseModule: PdfParseModule | null = null

const PDF_PARSE_GLOBAL_KEYS = ['Path2D', 'DOMMatrix', 'ImageData'] as const

function getPdfParseModule(): PdfParseModule {
  if (!pdfParseModule) {
    const savedGlobals: Record<string, unknown> = {}
    for (const key of PDF_PARSE_GLOBAL_KEYS) {
      savedGlobals[key] = (globalThis as Record<string, unknown>)[key]
    }
    try {
      pdfParseModule = { PDFParse: PdfParseClass } as PdfParseModule
    } finally {
      for (const key of PDF_PARSE_GLOBAL_KEYS) {
        const saved = savedGlobals[key]
        if (saved === undefined) {
          delete (globalThis as Record<string, unknown>)[key]
        } else {
          ;(globalThis as Record<string, unknown>)[key] = saved
        }
      }
    }
  }
  return pdfParseModule
}

/** RGB 颜色，分量范围 0-1 */
export interface PdfColor {
  r: number
  g: number
  b: number
}

/** 标准字体名称，均为 WinAnsi 编码 */
export type StandardFontName =
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

/** CJK 字体名称，通过嵌入自定义 TTF/OTF 实现 */
export type CjkFontName =
  | 'NotoSansSC'
  | 'NotoSansSCBold'
  | 'SimHei'
  | 'MSYH'
  | 'MSYHBD'

/** 字体名称：标准字体或 CJK 字体 */
export type FontName = StandardFontName | CjkFontName

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
  | 'add-pages'
  | 'update-page'
  | 'to-markdown'
  | 'to-image'

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
  /** update-page 目标页面索引（0-based） */
  pageIndex?: number
  /** update-page 在目标页面上绘制的新元素列表 */
  elements?: PdfPageElement[]
  /** add-watermark 水印配置 */
  watermark?: PdfWatermark
  outputPath?: string
  /** 自定义 CJK 字体文件路径，用于覆盖默认系统字体搜索 */
  cjkFontPath?: string
  outputMode?: 'file' | 'inline'
  /** to-image 操作：指定页码列表（1-based），省略则转换所有页 */
  imagePages?: number[]
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

const STANDARD_FONT_MAP: Record<StandardFontName, StandardFonts> = {
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

const CJK_FONT_FILES: Record<CjkFontName, string[]> = {
  NotoSansSC: ['NotoSansSC-VF.ttf', 'NotoSansCJKsc-Regular.ttf', 'NotoSansSC-Regular.otf', 'NotoSansSC-Regular.ttf'],
  NotoSansSCBold: ['NotoSansSC-Bold.ttf', 'NotoSansSC-Bold.otf', 'NotoSansCJKsc-Bold.ttf'],
  SimHei: ['simhei.ttf', 'SimHei.ttf'],
  MSYH: ['msyh.ttc', 'MSYH.TTC', 'msyh.ttf'],
  MSYHBD: ['msyhbd.ttc', 'MSYHBD.TTC', 'msyhbd.ttf'],
}

const SYSTEM_FONT_DIRS: string[] = (() => {
  const dirs: string[] = []
  const platform = process.platform
  if (platform === 'win32') {
    dirs.push('C:\\Windows\\Fonts')
    dirs.push(path.join(homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'))
  } else if (platform === 'darwin') {
    dirs.push('/System/Library/Fonts')
    dirs.push('/Library/Fonts')
    dirs.push(path.join(homedir(), 'Library', 'Fonts'))
  } else {
    dirs.push('/usr/share/fonts')
    dirs.push('/usr/local/share/fonts')
    dirs.push(path.join(homedir(), '.local', 'share', 'fonts'))
    dirs.push(path.join(homedir(), '.fonts'))
  }
  return dirs
})()

const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/

function hasCjkChar(text: string): boolean {
  return CJK_CHAR_REGEX.test(text)
}

function isCjkFont(name: FontName): name is CjkFontName {
  return name in CJK_FONT_FILES
}

function findSystemCjkFont(cjkName: CjkFontName): string | null {
  for (const dir of SYSTEM_FONT_DIRS) {
    for (const filename of CJK_FONT_FILES[cjkName]) {
      const fullPath = path.join(dir, filename)
      if (existsSync(fullPath)) return fullPath
    }
  }
  return null
}

const DEFAULT_CJK_REGULAR: CjkFontName = 'NotoSansSC'
const DEFAULT_CJK_BOLD: CjkFontName = 'NotoSansSCBold'

function resolveCjkFontForStandardBold(name: StandardFontName): CjkFontName {
  if (name.includes('Bold')) return DEFAULT_CJK_BOLD
  return DEFAULT_CJK_REGULAR
}

function toColor(c?: PdfColor) {
  if (!c) return undefined
  // 防御性处理：值 > 1 时可能是 0-255 范围误传，自动归一化到 0-1；值 < 0 时钳制为 0
  const clamp = (v: number) => v > 1 ? v / 255 : v < 0 ? 0 : v
  return rgb(clamp(c.r), clamp(c.g), clamp(c.b))
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
  customCjkFontPath?: string,
  worktree?: string,
): Promise<PDFFont> {
  if (cache[name]) return cache[name]

  if (isCjkFont(name)) {
    doc.registerFontkit(fontkit)
    const fontPath = customCjkFontPath ?? findSystemCjkFont(name)
    if (!fontPath) {
      const candidates = CJK_FONT_FILES[name].join('、')
      const systemDirs = SYSTEM_FONT_DIRS.join('、')
      throw new Error(
        `找不到 CJK 字体 "${name}" 的文件（候选文件名：${candidates}，搜索目录：${systemDirs}）。请安装对应字体，或通过 cjkFontPath 参数指定字体文件路径。`,
      )
    }
    if (customCjkFontPath && worktree && !isInsideRoot(worktree, customCjkFontPath)) {
      throw new Error(`CJK 字体文件路径超出工作区边界：${customCjkFontPath}。请使用工作区内的字体文件路径。`)
    }
    const fontBytes = readFileSync(fontPath)
    cache[name] = await doc.embedFont(fontBytes)
    return cache[name]
  }

  cache[name] = await doc.embedFont(STANDARD_FONT_MAP[name])
  return cache[name]
}

interface AutoLayoutState {
  nextY: number
  pageHeight: number
}

async function drawElement(
  doc: PDFDocument,
  page: PDFPage,
  el: PdfPageElement,
  fontCache: Record<string, PDFFont>,
  customCjkFontPath?: string,
  worktree?: string,
  autoLayout?: AutoLayoutState,
): Promise<AutoLayoutState | undefined> {
  switch (el.type) {
    case 'text': {
      const rawFontName: FontName | undefined = el.font
      const textContent = el.text ?? ''
      const fontName = rawFontName ?? (hasCjkChar(textContent) ? DEFAULT_CJK_REGULAR : 'Helvetica')
      const font = await getFont(doc, fontName, fontCache, customCjkFontPath, worktree)
      const size = el.fontSize ?? 12
      // toColor 已内置防御性归一化（值>1时自动从0-255范围归一化到0-1）
      // 默认黑色适用于白底 PDF（常见场景）；暗背景 PDF 必须显式设置 color
      const color = toColor(el.color) ?? rgb(0, 0, 0)
      const lines = textContent.split('\n')
      const lineHeight = el.lineHeight ?? size + 6
      const pageHeight = page.getHeight()
      const startX = el.x ?? 50

      // 未指定 y 时使用自动布局：从上一个元素的 y 位置继续向下排列，防止重叠
      let y: number
      if (el.y !== undefined) {
        y = el.y
      } else if (autoLayout) {
        y = autoLayout.nextY
      } else {
        y = pageHeight - 50
      }

      for (const line of lines) {
        if (line.length > 0) {
          page.drawText(line, { x: startX, y, size, font, color })
        }
        y -= lineHeight
      }

      // 返回更新后的自动布局状态，供下一个元素使用
      return { nextY: y, pageHeight }
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
        color: toColor(el.color) ?? rgb(0, 0, 0),
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
      const legacyFontName: FontName = hasCjkChar(pageSpec.text) ? DEFAULT_CJK_REGULAR : 'Helvetica'
      const font = await getFont(doc, legacyFontName, fontCache, input.cjkFontPath, input.worktree)
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

    // 新模式：元素化绘制（带自动布局：未指定坐标的文本元素自动向下排列防重叠）
    if (pageSpec.elements) {
      let autoLayout: AutoLayoutState | undefined = undefined
      for (const el of pageSpec.elements) {
        const result = await drawElement(doc, page, el, fontCache, input.cjkFontPath, input.worktree, autoLayout)
        if (result) autoLayout = result
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

  for (const filePath of files) {
    const src = await PDFDocument.load(readFileSync(filePath), { ignoreEncryption: true })
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
  const src = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
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
      `page${i + 1}`,
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
  const parser = new (getPdfParseModule().PDFParse)({ data: dataBuffer })
  const data = await parser.getText()

  const fullText = data.text ?? ''
  const truncated = fullText.length > PDF_EXTRACT_TEXT_MAX_CHARS
  const content = truncated ? fullText.slice(0, PDF_EXTRACT_TEXT_MAX_CHARS) : fullText

  return {
    summary: `已提取文本，共 ${data.total} 页${truncated ? `（文本已截断至前 ${PDF_EXTRACT_TEXT_MAX_CHARS} 字符，完整文本长度 ${fullText.length} 字符）` : ''}`,
    content,
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
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
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
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

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
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
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
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

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
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const total = doc.getPageCount()
  const keepIndices = doc.getPageIndices().filter((i) => !indices.includes(i))

  const newDoc = await PDFDocument.create()
  const keptPages = await newDoc.copyPages(doc, keepIndices)
  keptPages.forEach((p) => newDoc.addPage(p))

  const bytes = await newDoc.save()
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

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
  const doc = await PDFDocument.load(readFileSync(file), { ignoreEncryption: true })
  const isCjk = hasCjkChar(wm.text)
  const fontName: FontName = isCjk ? DEFAULT_CJK_BOLD : 'HelveticaBold'
  const fontCache: Record<string, PDFFont> = {}
  const font = await getFont(doc, fontName, fontCache, input.cjkFontPath, input.worktree)
  const fontSize = wm.fontSize ?? 50
  const opacity = wm.opacity ?? 0.3
  const rotation = wm.rotation ?? 45
  const color = toColor(wm.color) ?? rgb(0.5, 0.5, 0.5)

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
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

  return {
    outputPath,
    summary: `已为 ${pages.length} 个页面添加水印`,
  }
}

async function handleAddPages(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('add-pages 操作需要 file 参数')
  }
  const pages = input.pages
  if (!pages) {
    throw new Error('add-pages 操作需要 pages 参数')
  }
  if (pages.length === 0) {
    throw new Error('add-pages 操作的 pages 数组不能为空')
  }

  const existingBytes = readFileSync(file)
  const doc = await PDFDocument.load(existingBytes, { ignoreEncryption: true })
  const existingCount = doc.getPageCount()

  const fontCache: Record<string, PDFFont> = {}

  for (const pageSpec of pages) {
    const [w, h] = resolvePageSize(pageSpec.size)
    const page = doc.addPage([w, h])

    // 兼容旧模式
    if (pageSpec.text && !pageSpec.elements) {
      const legacyFontName: FontName = hasCjkChar(pageSpec.text) ? DEFAULT_CJK_REGULAR : 'Helvetica'
      const font = await getFont(doc, legacyFontName, fontCache, input.cjkFontPath, input.worktree)
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

    // 元素化绘制（带自动布局防重叠）
    if (pageSpec.elements) {
      let autoLayout: AutoLayoutState | undefined = undefined
      for (const el of pageSpec.elements) {
        const result = await drawElement(doc, page, el, fontCache, input.cjkFontPath, input.worktree, autoLayout)
        if (result) autoLayout = result
      }
    }
  }

  const bytes = await doc.save()
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

  const totalCount = existingCount + pages.length
  return {
    outputPath,
    summary: `已追加 ${pages.length} 页，文件总页数从 ${existingCount} 变为 ${totalCount}`,
  }
}

async function handleUpdatePage(input: PdfInput): Promise<PdfResult> {
  const file = input.file
  if (!file) {
    throw new Error('update-page 操作需要 file 参数')
  }
  const pageIndex = input.pageIndex
  if (pageIndex === undefined || pageIndex === null) {
    throw new Error('update-page 操作需要 pageIndex 参数')
  }
  const elements = input.elements
  if (!elements) {
    throw new Error('update-page 操作需要 elements 参数')
  }

  const existingBytes = readFileSync(file)
  const doc = await PDFDocument.load(existingBytes, { ignoreEncryption: true })

  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
    throw new Error(
      `pageIndex ${pageIndex} 超出范围，文件共 ${doc.getPageCount()} 页（有效索引 0-${doc.getPageCount() - 1}）`,
    )
  }

  const page = doc.getPage(pageIndex)
  const fontCache: Record<string, PDFFont> = {}

  // update-page 的元素叠加在已有内容上，自动布局从页面顶部开始
  let autoLayout: AutoLayoutState | undefined = { nextY: page.getHeight() - 50, pageHeight: page.getHeight() }
  for (const el of elements) {
    const result = await drawElement(doc, page, el, fontCache, input.cjkFontPath, input.worktree, autoLayout)
    if (result) autoLayout = result
  }

  const bytes = await doc.save()
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, bytes)
  } else {
    withBackup(file, () => writeFileSync(outputPath, bytes))
  }

  return {
    outputPath,
    summary: `已在第 ${pageIndex + 1} 页（索引 ${pageIndex}）上绘制 ${elements.length} 个新元素`,
  }
}

export async function processPdf(input: PdfInput): Promise<PdfResult> {
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
    case 'merge':
      return handleMerge(resolvedInput)
    case 'split':
      return handleSplit(resolvedInput)
    case 'extract-text':
      return handleExtractText(resolvedInput)
    case 'fill-form':
      return handleFillForm(resolvedInput)
    case 'rotate-pages':
      return handleRotatePages(resolvedInput)
    case 'delete-pages':
      return handleDeletePages(resolvedInput)
    case 'add-watermark':
      return handleAddWatermark(resolvedInput)
    case 'add-pages':
      return handleAddPages(resolvedInput)
    case 'update-page':
      return handleUpdatePage(resolvedInput)
    case 'to-markdown':
      return handleToMarkdown(resolvedInput)
    case 'to-image':
      return handleToImage(resolvedInput)
  }
}

async function handleToMarkdown(input: PdfInput): Promise<PdfResult> {
  if (!input.file) throw new Error('to-markdown 操作需要 file 参数')
  const { buffer } = await loadDocumentFile(input.file, input.worktree, 'PDF')
  const result = await convertPdfToMarkdown(buffer)
  return writeMarkdownOutput(result.markdown, input.worktree, 'pdf', input.outputPath, input.outputMode)
}

async function handleToImage(input: PdfInput): Promise<PdfResult> {
  if (!input.file) throw new Error('to-image 操作需要 file 参数')
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const filePath = await resolveDocumentPath(input.file, input.worktree)
  const outputDir = join(input.worktree, 'ae', 'documents', 'to-image')
  const images = await pdfToImages({
    filePath,
    outputDir,
    pageIndices: input.imagePages,
    scale: 2.0,
  })
  if (images.length === 0) {
    return { summary: 'PDF 转图片失败：未生成任何图片文件', content: '' }
  }
  const imageList = images.map(p => {
    const match = p.match(/page_(\d+)\.png$/)
    const pageNum = match ? parseInt(match[1]) : 0
    return `第 ${pageNum} 页: ${p}`
  }).join('\n')
  return {
    summary: `PDF 转图片完成，生成 ${images.length} 张页面图片`,
    content: imageList,
    outputPath: outputDir,
  }
}
