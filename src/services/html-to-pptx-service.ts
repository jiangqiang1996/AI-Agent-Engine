import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { processPptx, type PptxInputElement, type PptxSlideContent, type PptxTableCell } from './pptx-service.js'
import {
  buildExtractionScript,
  buildViewportProbeScript,
  mapBrowserSlideToPptxSlide,
  type BrowserExtractionResult,
  type McpExecutor,
  type SlideSeparator,
} from './browser-pptx-renderer.js'

export interface HtmlToPptxOptions {
  /** HTML 文件路径，支持绝对路径或相对于 worktree 的相对路径 */
  file: string
  /** 当前工作区根目录 */
  worktree: string
  /** 输出 PPTX 路径，省略时自动生成到 ae/documents/pptx/ */
  outputPath?: string
  /** 演示文稿标题 */
  title?: string
  /** 幻灯片分页策略，默认 auto */
  slideSeparator?: SlideSeparator
  /** MCP 执行器回调，传入 JS 脚本字符串，返回浏览器执行结果 JSON。提供时走浏览器渲染路径。 */
  mcpExecutor?: McpExecutor
}

export interface HtmlToPptxResult {
  outputPath: string
  slideCount: number
  warnings: string[]
}

export class HtmlToPptxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HtmlToPptxError'
  }
}

export function formatHtmlToPptxError(error: unknown): string {
  if (error instanceof HtmlToPptxError) return error.message
  if (error instanceof Error) return `HTML 转 PPTX 失败：${error.message}`
  if (typeof error === 'string') return `HTML 转 PPTX 失败：${error}`
  return 'HTML 转 PPTX 失败：未知错误'
}

const INCHES_PER_POINT = 1 / 72
const DEFAULT_FONT_SIZE_HEADING = 28
const DEFAULT_FONT_SIZE_BODY = 18
const DEFAULT_FONT_SIZE_SMALL = 14

function resolveFilePath(worktree: string, filePath: string): string {
  const resolved = isAbsolute(filePath) ? filePath : resolve(worktree, filePath)
  if (!existsSync(resolved)) {
    throw new HtmlToPptxError(`HTML 文件不存在：${filePath}`)
  }
  return resolved
}

function resolveImagePath(worktree: string, baseDir: string, src: string): string | undefined {
  if (!src || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return undefined
  }
  const clean = src.split('?')[0]?.split('#')[0] ?? ''
  if (!clean) return undefined
  const resolved = isAbsolute(clean) ? resolve(worktree, clean.replace(/^[/\\]+/, '')) : resolve(baseDir, clean)
  return existsSync(resolved) ? resolved : undefined
}

function stripNonContent(html: string): string {
  let result = html
  result = result.replace(/<!--[\s\S]*?-->/g, '')
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  result = result.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  result = result.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
  result = result.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
  result = result.replace(/<\/?html\b[^>]*>/gi, '')
  result = result.replace(/<\/?body\b[^>]*>/gi, '')
  return result
}

interface RawSlide {
  title?: string
  body: string
}

function splitIntoSlides(html: string, strategy: 'section' | 'hr' | 'h1' | 'auto'): RawSlide[] {
  const slides: RawSlide[] = []

  if (strategy === 'section' || strategy === 'auto') {
    const sectionMatches = html.match(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)
    if (sectionMatches && sectionMatches.length > 0) {
      for (const section of sectionMatches) {
        slides.push({ body: section.replace(/<\/?section\b[^>]*>/gi, '') })
      }
      return slides
    }
  }

  if (strategy === 'hr' || strategy === 'auto') {
    const hrParts = html.split(/<hr\s*\/?>/i)
    if (hrParts.length > 1) {
      for (const part of hrParts) {
        slides.push({ body: part })
      }
      return slides
    }
  }

  if (strategy === 'h1' || strategy === 'auto') {
    const h1Parts = html.split(/(?=<h1\b)/i)
    if (h1Parts.length > 1) {
      for (const part of h1Parts) {
        const trimmed = part.trim()
        if (trimmed) slides.push({ body: trimmed })
      }
      return slides
    }
  }

  slides.push({ body: html })
  return slides
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i)
  if (match) {
    return stripTags(match[2]).trim()
  }
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    return stripTags(titleMatch[1]).trim()
  }
  return undefined
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
}

/**
 * 匹配块级元素和自闭合元素。
 * - 容器标签（h1-h6, p, table, ul, ol, blockquote）：匹配 <tag attrs>content</tag>，inner 为标签间内容
 * - 自闭合标签（img, br）：匹配 <tag attrs> 或 <tag attrs/>，inner 为 undefined
 * 不匹配内联标签（strong/em/b/i/li），它们由 stripTags 保留文本。
 */
const TAG_PATTERN = /<(h[1-6]|p|table|ul|ol|blockquote|img|br)\b([^>]*)\/?>(?:([\s\S]*?)<\/\1>)?/gi

/**
 * 估算文本在指定字号和宽度下需要的高度（英寸）。
 * 考虑换行符和字符宽度，确保多行文本不会被后续元素覆盖。
 */
function estimateTextHeight(text: string, fontSizePt: number, widthInches: number): number {
  if (!text) return 0.3
  const charWidthInches = (fontSizePt * 0.55) / 72
  const charsPerLine = Math.max(1, Math.floor(widthInches / charWidthInches))
  const lines = text.split('\n')
  let totalLines = 0
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine))
  }
  const lineHeightInches = (fontSizePt * 1.3) / 72
  return Math.max(0.3, totalLines * lineHeightInches + 0.1)
}

function parseSlideContent(rawSlide: RawSlide, worktree: string, baseDir: string, warnings: string[]): PptxSlideContent {
  const elements: PptxInputElement[] = []
  let currentY = 0.5
  const margin = 0.5
  const slideWidth = 13.33
  const contentWidth = slideWidth - margin * 2
  const elementGap = 0.15

  const titleMatch = rawSlide.body.match(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/i)
  const title = titleMatch ? stripTags(titleMatch[2]) : rawSlide.title

  if (title) {
    const titleHeight = estimateTextHeight(title, DEFAULT_FONT_SIZE_HEADING, contentWidth)
    elements.push({
      type: 'text',
      text: title,
      x: margin,
      y: currentY,
      w: contentWidth,
      h: titleHeight,
      fontSize: DEFAULT_FONT_SIZE_HEADING,
      bold: true,
      align: 'left',
    })
    currentY += titleHeight + elementGap
  }

  const bodyHtml = titleMatch?.index !== undefined
    ? rawSlide.body.slice(titleMatch.index + titleMatch[0].length)
    : rawSlide.body

  const tagMatches = bodyHtml.matchAll(TAG_PATTERN)
  for (const match of tagMatches) {
    const tag = match[1].toLowerCase()
    const attrs = match[2] || ''
    const inner = match[3] || ''

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Number(tag[1])
        const fontSize = Math.max(DEFAULT_FONT_SIZE_HEADING - (level - 1) * 4, DEFAULT_FONT_SIZE_BODY)
        const text = stripTags(inner)
        if (text) {
          const height = estimateTextHeight(text, fontSize, contentWidth)
          elements.push({
            type: 'text',
            text,
            x: margin,
            y: currentY,
            w: contentWidth,
            h: height,
            fontSize,
            bold: true,
            align: 'left',
            color: '333333',
          })
          currentY += height + elementGap
        }
        break
      }
      case 'p': {
        const text = stripTags(inner)
        if (text) {
          const height = estimateTextHeight(text, DEFAULT_FONT_SIZE_BODY, contentWidth)
          elements.push({
            type: 'text',
            text,
            x: margin,
            y: currentY,
            w: contentWidth,
            h: height,
            fontSize: DEFAULT_FONT_SIZE_BODY,
            align: 'left',
          })
          currentY += height + elementGap
        }
        break
      }
      case 'img': {
        const srcMatch = attrs.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i)
        const src = srcMatch?.[1] ?? srcMatch?.[2] ?? srcMatch?.[3]
        const altMatch = attrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i)
        const altText = altMatch?.[1] ?? altMatch?.[2] ?? ''
        const widthMatch = attrs.match(/\bwidth\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))/i)
        const heightMatch = attrs.match(/\bheight\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))/i)
        const widthPx = widthMatch ? Number(widthMatch[1] ?? widthMatch[2] ?? widthMatch[3]) : undefined
        const heightPx = heightMatch ? Number(heightMatch[1] ?? heightMatch[2] ?? heightMatch[3]) : undefined

        if (src) {
          if (src.startsWith('data:image/svg')) {
            warnings.push('PPTX 不支持 SVG 格式的 data URI，已跳过该图片。')
            break
          }
          const imgWidth = widthPx ? widthPx * INCHES_PER_POINT : 6
          const imgHeight = heightPx ? heightPx * INCHES_PER_POINT : 4
          if (src.startsWith('data:')) {
            const imageData = src.replace(/^data:image\/[a-z+]+;base64,/, '')
            elements.push({
              type: 'image',
              imageData,
              x: margin,
              y: currentY,
              w: imgWidth,
              h: imgHeight,
              altText,
            })
            currentY += imgHeight + elementGap
          } else {
            const imgPath = resolveImagePath(worktree, baseDir, src)
            if (imgPath) {
              elements.push({
                type: 'image',
                imagePath: imgPath,
                x: margin,
                y: currentY,
                w: imgWidth,
                h: imgHeight,
                altText,
              })
              currentY += imgHeight + elementGap
            } else {
              warnings.push(`图片无法解析或不存在，已跳过：${src}`)
            }
          }
        }
        break
      }
      case 'ul':
      case 'ol': {
        const items = inner.match(/<li\b[^>]*>([\s\S]*?)<\/li>/gi) ?? []
        const listText = items
          .map((item, index) => {
            const itemText = stripTags(item.replace(/<li\b[^>]*>/i, '').replace(/<\/li>/i, ''))
            return `${tag === 'ol' ? `${index + 1}. ` : '• '}${itemText}`
          })
          .join('\n')
        if (listText) {
          const height = estimateTextHeight(listText, DEFAULT_FONT_SIZE_BODY, contentWidth)
          elements.push({
            type: 'text',
            text: listText,
            x: margin,
            y: currentY,
            w: contentWidth,
            h: height,
            fontSize: DEFAULT_FONT_SIZE_BODY,
            align: 'left',
          })
          currentY += height + elementGap
        }
        break
      }
      case 'table': {
        const rows = parseHtmlTable(inner)
        if (rows.length > 0) {
          const tableHeight = 0.4 * rows.length
          elements.push({
            type: 'table',
            rows,
            x: margin,
            y: currentY,
            w: contentWidth,
          })
          currentY += tableHeight + elementGap
        }
        break
      }
      case 'blockquote': {
        const text = stripTags(inner)
        if (text) {
          const height = estimateTextHeight(text, DEFAULT_FONT_SIZE_SMALL, contentWidth - 0.3)
          elements.push({
            type: 'text',
            text,
            x: margin + 0.3,
            y: currentY,
            w: contentWidth - 0.3,
            h: height,
            fontSize: DEFAULT_FONT_SIZE_SMALL,
            italic: true,
            color: '666666',
            align: 'left',
          })
          currentY += height + elementGap
        }
        break
      }
      case 'br':
        currentY += 0.2
        break
    }

    if (currentY > 7) {
      break
    }
  }

  return {
    elements,
    title,
  }
}

function parseHtmlTable(tableHtml: string): PptxTableCell[][] {
  const rows: PptxTableCell[][] = []
  const trMatches = tableHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
  for (const tr of trMatches) {
    const cells: PptxTableCell[] = []
    const cellMatches = tr.match(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi) ?? []
    for (const cell of cellMatches) {
      const isHeader = /<th\b/i.test(cell)
      const text = stripTags(cell.replace(/<t[hd]\b[^>]*>/i, '').replace(/<\/t[hd]>/i, ''))
      cells.push({
        text,
        bold: isHeader,
        fill: isHeader ? { color: 'EEEEEE' } : undefined,
      })
    }
    if (cells.length > 0) {
      rows.push(cells)
    }
  }
  return rows
}

export function buildBrowserExtractionScript(slideSeparator: SlideSeparator): string {
  return buildExtractionScript(slideSeparator)
}

export function buildBrowserViewportProbeScript(): string {
  return buildViewportProbeScript()
}

async function convertHtmlToPptxBrowser(options: HtmlToPptxOptions, filePath: string): Promise<HtmlToPptxResult> {
  if (!options.mcpExecutor) {
    throw new HtmlToPptxError('浏览器渲染路径需要提供 mcpExecutor 回调，但未收到。')
  }

  const separator = options.slideSeparator ?? 'auto'
  const script = buildExtractionScript(separator)
  const rawJson = await options.mcpExecutor(script)

  let extractionResult: BrowserExtractionResult
  try {
    extractionResult = JSON.parse(rawJson) as BrowserExtractionResult
  } catch {
    throw new HtmlToPptxError(`浏览器脚本返回的 JSON 无法解析。原始输出前 200 字符：${rawJson.slice(0, 200)}`)
  }

  if (!extractionResult.slides || extractionResult.slides.length === 0) {
    throw new HtmlToPptxError('浏览器渲染提取结果为空，未识别到任何幻灯片内容。')
  }

  const baseDir = dirname(filePath)
  const warnings: string[] = [...(extractionResult.errors ?? [])]

  const slides: PptxSlideContent[] = extractionResult.slides.map((browserSlide) =>
    mapBrowserSlideToPptxSlide(browserSlide, options.worktree, baseDir, warnings)
  )

  const html = readFileSync(filePath, 'utf8')
  const title = options.title ?? extractTitle(stripNonContent(html)) ?? 'HTML 转换'

  const result = await processPptx({
    operation: 'create',
    worktree: options.worktree,
    title,
    slides,
    outputPath: options.outputPath,
  })

  return {
    outputPath: result.outputPath!,
    slideCount: slides.length,
    warnings,
  }
}

async function convertHtmlToPptxRegex(options: HtmlToPptxOptions, filePath: string): Promise<HtmlToPptxResult> {
  const html = readFileSync(filePath, 'utf8')
  const baseDir = dirname(filePath)

  const cleaned = stripNonContent(html)
  const strategy = options.slideSeparator ?? 'auto'
  const rawSlides = splitIntoSlides(cleaned, strategy)
  const warnings: string[] = []

  const hasContent = rawSlides.some((s) => stripTags(s.body).length > 0)
  if (rawSlides.length === 0 || !hasContent) {
    throw new HtmlToPptxError('HTML 内容为空或无法识别任何幻灯片内容。')
  }

  const slides: PptxSlideContent[] = rawSlides.map((raw) => parseSlideContent(raw, options.worktree, baseDir, warnings))

  const title = options.title ?? extractTitle(cleaned) ?? 'HTML 转换'

  const result = await processPptx({
    operation: 'create',
    worktree: options.worktree,
    title,
    slides,
    outputPath: options.outputPath,
  })

  return {
    outputPath: result.outputPath!,
    slideCount: slides.length,
    warnings,
  }
}

export async function convertHtmlToPptx(options: HtmlToPptxOptions): Promise<HtmlToPptxResult> {
  const filePath = resolveFilePath(options.worktree, options.file)

  if (options.mcpExecutor) {
    return convertHtmlToPptxBrowser(options, filePath)
  }

  return convertHtmlToPptxRegex(options, filePath)
}
