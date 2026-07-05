import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'

import type {
  PptxDesignFile,
  PageDesign,
  TemplateDef,
  SlotElement,
  Override,
  GlobalStyle,
} from '../schemas/pptx-design-schema.js'
import { TemplateSchema, PptxDesignFileSchema } from '../schemas/pptx-design-schema.js'

// ==================== 模板缓存 ====================

let templateCache: Map<string, TemplateDef> | null = null

function getTemplatesDir(): string {
  // 运行时路径：dist/src/assets/skills/ae-pptx-from-outline/templates/
  // 或源码路径：src/assets/skills/ae-pptx-from-outline/templates/
  const possiblePaths = [
    join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'skills', 'ae-pptx-from-outline', 'templates'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'skills', 'ae-pptx-from-outline', 'templates'),
    join(dirname(fileURLToPath(import.meta.url)), 'assets', 'skills', 'ae-pptx-from-outline', 'templates'),
  ]
  for (const p of possiblePaths) {
    try {
      readdirSync(p)
      return p
    } catch {
      continue
    }
  }
  throw new Error('无法找到模板目录 templates/')
}

export function loadTemplate(templateName: string): TemplateDef {
  if (!templateCache) {
    templateCache = new Map()
  }
  const cached = templateCache.get(templateName)
  if (cached) return cached

  const dir = getTemplatesDir()
  const filePath = join(dir, `${templateName}.yaml`)
  const raw = readFileSync(filePath, 'utf-8')
  const parsed = parseYaml(raw)
  const result = TemplateSchema.parse(parsed)
  templateCache.set(templateName, result)
  return result
}

export function loadAllTemplates(): Map<string, TemplateDef> {
  if (!templateCache) {
    templateCache = new Map()
  }
  if (templateCache.size > 0) return templateCache

  const dir = getTemplatesDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.yaml'))
  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8')
    const parsed = parseYaml(raw)
    const result = TemplateSchema.parse(parsed)
    templateCache.set(result.name, result)
  }
  return templateCache
}

export function clearTemplateCache(): void {
  templateCache = null
}

// ==================== 设计文件加载 ====================

export function loadDesignFile(filePath: string): PptxDesignFile {
  const raw = readFileSync(filePath, 'utf-8')
  const parsed = parseYaml(raw)
  return PptxDesignFileSchema.parse(parsed)
}

// ==================== 翻译器：设计文件 → ae-pptx 元素数组 ====================

export interface PptxPageElement {
  type: 'text' | 'image' | 'shape' | 'table' | 'chart'
  [key: string]: unknown
}

export interface TranslatedPage {
  pageId: string
  template: string
  elements: PptxPageElement[]
  background?: { color?: string }
  slideNumber?: boolean
}

export interface TranslationResult {
  pages: TranslatedPage[]
  globalStyle: GlobalStyle
  title: string
  errors: string[]
}

// ==================== 核心翻译逻辑 ====================

function mergeOverride(slot: SlotElement, override: Override | undefined, globalStyle: GlobalStyle): SlotElement {
  if (!override) return slot
  return {
    ...slot,
    ...(override.x !== undefined ? { x: override.x } : {}),
    ...(override.y !== undefined ? { y: override.y } : {}),
    ...(override.w !== undefined ? { w: override.w } : {}),
    ...(override.h !== undefined ? { h: override.h } : {}),
    ...(override.fontSize !== undefined ? { fontSize: override.fontSize } : {}),
    ...(override.bold !== undefined ? { bold: override.bold } : {}),
    ...(override.italic !== undefined ? { italic: override.italic } : {}),
    ...(override.color !== undefined ? { color: override.color } : {}),
    ...(override.align !== undefined ? { align: override.align } : {}),
    ...(override.valign !== undefined ? { valign: override.valign } : {}),
    ...(override.fontFace !== undefined ? { fontFace: override.fontFace } : {}),
    ...(override.fill !== undefined ? { fill: { ...slot.fill, ...override.fill } } : {}),
    ...(override.line !== undefined ? { line: { ...slot.line, ...override.line } } : {}),
  }
}

function resolveFontFace(slot: SlotElement, globalStyle: GlobalStyle): string | undefined {
  if (slot.fontFace) return slot.fontFace
  if (slot.type === 'text') {
    const isTitle = slot.fontSize !== undefined && slot.fontSize >= 24
    return isTitle ? globalStyle.fonts.headFontFace : globalStyle.fonts.bodyFontFace
  }
  return undefined
}

function resolveColor(slot: SlotElement, globalStyle: GlobalStyle, isTitleSlot: boolean): string | undefined {
  if (slot.color) return slot.color
  if (slot.type === 'text') {
    return isTitleSlot ? globalStyle.titleStyle.color : globalStyle.bodyStyle.color
  }
  return undefined
}

function translateTextSlot(
  slot: SlotElement,
  tokenValue: unknown,
  globalStyle: GlobalStyle,
): PptxPageElement {
  const isTitleSlot = slot.fontSize !== undefined && slot.fontSize >= 24
  const fontFace = resolveFontFace(slot, globalStyle)
  const color = resolveColor(slot, globalStyle, isTitleSlot)

  // 如果 token 值是数组，构建带项目符号的 textRuns
  if (Array.isArray(tokenValue)) {
    const textRuns = (tokenValue as (string | number)[]).map((item, idx) => ({
      text: String(item),
      fontSize: slot.fontSize ?? globalStyle.bodyStyle.fontSize,
      color,
      fontFace,
      bullet: idx === 0 ? { type: 'bullet' as const } : { type: 'bullet' as const },
      breakLine: true,
    }))
    return {
      type: 'text' as const,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      textRuns,
      align: slot.align,
      valign: slot.valign,
    }
  }

  // 字符串/数字 → 单文本
  return {
    type: 'text' as const,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    text: String(tokenValue ?? ''),
    fontSize: slot.fontSize,
    bold: slot.bold,
    italic: slot.italic,
    color,
    fontFace,
    align: slot.align,
    valign: slot.valign,
  }
}

function translateImageSlot(
  slot: SlotElement,
  tokenValue: unknown,
): PptxPageElement {
  const val = String(tokenValue ?? '')
  // 判断是文件路径还是 base64
  const isBase64 = val.startsWith('data:') || /^[A-Za-z0-9+/]+=*$/.test(val.slice(0, 100))
  return {
    type: 'image' as const,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    ...(isBase64 ? { imageData: val } : { imagePath: val }),
  }
}

function translateShapeSlot(slot: SlotElement, globalStyle: GlobalStyle): PptxPageElement {
  const fill = slot.fill ?? { type: 'solid' as const, color: globalStyle.colors.accent }
  return {
    type: 'shape' as const,
    shape: slot.shape ?? 'rect',
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    fill,
    line: slot.line,
  }
}

function translateTableSlot(
  slot: SlotElement,
  pageTokens: Record<string, unknown>,
  globalStyle: GlobalStyle,
): PptxPageElement {
  // data.table 模板的 slot 名是 "table"，但实际数据在 "rows" token 中
  // 兼容 slot 名与 token 名相同的情况
  const tokenValue = pageTokens['rows'] ?? pageTokens[slot.slot] ?? []
  // 归一化 rows：把字符串/数字单元格转为 { text } 对象，兼容 string[][] 和 CellObj[][]
  const rawRows = Array.isArray(tokenValue) ? tokenValue : []
  const rows = rawRows.map((row) =>
    Array.isArray(row)
      ? row.map((cell) =>
          typeof cell === 'string' || typeof cell === 'number'
            ? { text: String(cell) }
            : cell && typeof cell === 'object'
              ? { text: (cell as { text?: unknown }).text ?? '', ...cell }
              : { text: '' },
        )
      : [],
  )
  const colW = pageTokens['colW'] ?? undefined
  return {
    type: 'table' as const,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    rows,
    colW,
    fontSize: globalStyle.bodyStyle.fontSize,
    color: globalStyle.bodyStyle.color,
    fontFace: globalStyle.fonts.bodyFontFace,
  }
}

function translateChartSlot(
  slot: SlotElement,
  pageTokens: Record<string, unknown>,
): PptxPageElement {
  const chartType = (pageTokens['chartType'] as string) ?? slot.chartType ?? 'bar'
  const chartData = pageTokens['chartData'] ?? []
  return {
    type: 'chart' as const,
    chartType,
    chartData: chartData as unknown[],
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
  }
}

export function translatePage(page: PageDesign, globalStyle: GlobalStyle): TranslatedPage {
  const template = loadTemplate(page.template)
  const overrides = page.overrides ?? {}
  const tokens = page.tokens ?? {}
  const errors: string[] = []

  const elements: PptxPageElement[] = []

  for (const slot of template.slots) {
    // 跳过可选 slot 且无 token 值
    // 注意：部分模板的 slot 名与 token 名不同（如 data.table 的 slot="rows" 对应 token="rows"，
    // data.chart 的 slot="chart" 对应 tokens chartType/chartData）。
    // 对 table/chart 类型，translateTableSlot/translateChartSlot 内部会从 pageTokens 中按 token 名取值。
    const tokenDef = template.tokens[slot.slot]
    const tokenValue = tokens[slot.slot]
    const isAggregateSlot = slot.type === 'table' || slot.type === 'chart'
    if (tokenDef?.required && tokenValue === undefined && !isAggregateSlot) {
      errors.push(`页 ${page.id}: 必填 token "${slot.slot}" 未提供`)
      continue
    }
    if (!tokenDef?.required && tokenValue === undefined && slot.type !== 'shape' && !isAggregateSlot) {
      // 跳过可选且无值的非形状 slot
      continue
    }

    // 合并 overrides
    const merged = page.locked ? slot : mergeOverride(slot, overrides[slot.slot], globalStyle)

    // 根据类型翻译
    let element: PptxPageElement
    switch (merged.type) {
      case 'text':
        element = translateTextSlot(merged, tokenValue, globalStyle)
        break
      case 'image':
        element = translateImageSlot(merged, tokenValue)
        break
      case 'shape':
        element = translateShapeSlot(merged, globalStyle)
        break
      case 'table':
        element = translateTableSlot(merged, tokens, globalStyle)
        break
      case 'chart':
        element = translateChartSlot(merged, tokens)
        break
      default:
        errors.push(`页 ${page.id}: 未知元素类型 "${merged.type}"`)
        continue
    }
    elements.push(element)
  }

  return {
    pageId: page.id,
    template: page.template,
    elements,
    background: { color: globalStyle.colors.background },
  }
}

export function translateDesignFile(designFile: PptxDesignFile): TranslationResult {
  const errors: string[] = []
  const pages: TranslatedPage[] = []

  for (const page of designFile.pages) {
    try {
      const translated = translatePage(page, designFile.globalStyle)
      pages.push(translated)
      errors.push(...(translated.elements.length === 0 ? [`页 ${page.id}: 无元素生成`] : []))
    } catch (err) {
      errors.push(`页 ${page.id} 翻译失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    pages,
    globalStyle: designFile.globalStyle,
    title: designFile.title,
    errors,
  }
}
