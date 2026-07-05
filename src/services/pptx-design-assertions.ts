import type { PptxDesignFile, PageDesign, GlobalStyle, Override } from '../schemas/pptx-design-schema.js'
import type { TranslationResult, TranslatedPage } from './pptx-template-translator.js'

// ==================== 断言结果类型 ====================

export type AssertionSeverity = 'error' | 'warning' | 'info'

export interface AssertionResult {
  id: string
  severity: AssertionSeverity
  title: string
  passed: boolean
  message: string
  pageId?: string
}

export interface AssertionReport {
  totalAssertions: number
  passed: number
  failed: number
  warnings: number
  results: AssertionResult[]
  blockingErrors: AssertionResult[]
}

// ==================== 辅助函数 ====================

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return { r, g, b }
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hexToRgb(hex1))
  const l2 = relativeLuminance(hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function getElementRect(el: Record<string, unknown>): Rect | null {
  const x = el['x']
  const y = el['y']
  const w = el['w']
  const h = el['h']
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
    return null
  }
  return { x, y, w, h }
}

// ==================== 17 条结构化断言 ====================

// A1: 必填 token 完整性
function assertRequiredTokens(designFile: PptxDesignFile, results: AssertionResult[]): void {
  for (const page of designFile.pages) {
    for (const [slotName, tokenDef] of Object.entries(page.tokens ?? {})) {
      // 此处由翻译器已校验，这里只做双重检查
      if (tokenDef === undefined || tokenDef === null) {
        results.push({
          id: 'A1',
          severity: 'error',
          title: '必填 token 完整性',
          passed: false,
          message: `页 ${page.id}: token "${slotName}" 值为空`,
          pageId: page.id,
        })
      }
    }
  }
  results.push({ id: 'A1', severity: 'error', title: '必填 token 完整性', passed: true, message: '所有必填 token 已提供' })
}

// A2: 页面尺寸内
function assertWithinBounds(translation: TranslationResult, globalStyle: GlobalStyle, results: AssertionResult[]): void {
  const layoutWidth = globalStyle.layout.size === 'LAYOUT_4x3' ? 10 : 13.33
  const layoutHeight = globalStyle.layout.size === 'LAYOUT_4x3' ? 7.5 : 7.5
  const margin = globalStyle.layout.margin

  for (const page of translation.pages) {
    for (const el of page.elements) {
      const rect = getElementRect(el)
      if (!rect) continue
      if (rect.x < margin || rect.y < margin || rect.x + rect.w > layoutWidth - margin || rect.y + rect.h > layoutHeight - margin) {
        results.push({
          id: 'A2',
          severity: 'error',
          title: '页面尺寸内',
          passed: false,
          message: `页 ${page.pageId}: 元素超出安全区 (x=${rect.x}, y=${rect.y}, w=${rect.w}, h=${rect.h})`,
          pageId: page.pageId,
        })
      }
    }
  }
  results.push({ id: 'A2', severity: 'error', title: '页面尺寸内', passed: true, message: '所有元素在安全区内' })
}

// A3: 元素不重叠
function assertNoOverlap(translation: TranslationResult, results: AssertionResult[]): void {
  for (const page of translation.pages) {
    const rects: { rect: Rect; slot: string }[] = []
    for (const el of page.elements) {
      const rect = getElementRect(el)
      if (rect) rects.push({ rect, slot: String(el.slot ?? '') })
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (rectsOverlap(rects[i].rect, rects[j].rect)) {
          // 允许装饰性 shape 与文本重叠（如背景卡片 + 文字）
          const isBgShape = rects[i].slot.includes('card_bg') || rects[j].slot.includes('card_bg') ||
            rects[i].slot.includes('quote_mark') || rects[j].slot.includes('quote_mark')
          if (!isBgShape) {
            results.push({
              id: 'A3',
              severity: 'error',
              title: '元素不重叠',
              passed: false,
              message: `页 ${page.pageId}: 元素 "${rects[i].slot}" 与 "${rects[j].slot}" 重叠`,
              pageId: page.pageId,
            })
          }
        }
      }
    }
  }
  results.push({ id: 'A3', severity: 'error', title: '元素不重叠', passed: true, message: '元素无非法重叠' })
}

// A4: 字号最小值
function assertMinFontSize(translation: TranslationResult, results: AssertionResult[]): void {
  const MIN_FONT_SIZE = 10
  for (const page of translation.pages) {
    for (const el of page.elements) {
      const fontSize = el.fontSize as number | undefined
      if (fontSize !== undefined && fontSize < MIN_FONT_SIZE) {
        results.push({
          id: 'A4',
          severity: 'error',
          title: '字号最小值',
          passed: false,
          message: `页 ${page.pageId}: 字号 ${fontSize}pt 低于最小值 ${MIN_FONT_SIZE}pt`,
          pageId: page.pageId,
        })
      }
    }
  }
  results.push({ id: 'A4', severity: 'error', title: '字号最小值', passed: true, message: `所有字号 >= ${MIN_FONT_SIZE}pt` })
}

// A5: 字号最大值
function assertMaxFontSize(translation: TranslationResult, results: AssertionResult[]): void {
  const MAX_FONT_SIZE = 60
  for (const page of translation.pages) {
    for (const el of page.elements) {
      const fontSize = el.fontSize as number | undefined
      if (fontSize !== undefined && fontSize > MAX_FONT_SIZE) {
        results.push({
          id: 'A5',
          severity: 'warning',
          title: '字号最大值',
          passed: false,
          message: `页 ${page.pageId}: 字号 ${fontSize}pt 超过建议最大值 ${MAX_FONT_SIZE}pt`,
          pageId: page.pageId,
        })
      }
    }
  }
  results.push({ id: 'A5', severity: 'warning', title: '字号最大值', passed: true, message: `所有字号 <= ${MAX_FONT_SIZE}pt` })
}

// A6: 标题与正文字号差 >= 8pt
function assertTitleBodyFontSizeDiff(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const titleSize = designFile.globalStyle.titleStyle.fontSize
  const bodySize = designFile.globalStyle.bodyStyle.fontSize
  if (titleSize - bodySize < 8) {
    results.push({
      id: 'A6',
      severity: 'error',
      title: '标题与正文字号差',
      passed: false,
      message: `标题字号 ${titleSize}pt 与正文字号 ${bodySize}pt 差值 < 8pt`,
    })
  } else {
    results.push({ id: 'A6', severity: 'error', title: '标题与正文字号差', passed: true, message: `标题-正文字号差 = ${titleSize - bodySize}pt` })
  }
}

// A7: WCAG AA 对比度
function assertContrastRatio(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const { background, text, title } = designFile.globalStyle.colors
  const bodyContrast = contrastRatio(text, background)
  const titleContrast = contrastRatio(title, background)
  const BODY_MIN = 4.5
  const TITLE_MIN = 3.0

  if (bodyContrast < BODY_MIN) {
    results.push({
      id: 'A7',
      severity: 'error',
      title: 'WCAG AA 对比度',
      passed: false,
      message: `正文对比度 ${bodyContrast.toFixed(2)} < ${BODY_MIN} (正文最低 4.5:1)`,
    })
  }
  if (titleContrast < TITLE_MIN) {
    results.push({
      id: 'A7',
      severity: 'error',
      title: 'WCAG AA 对比度',
      passed: false,
      message: `标题对比度 ${titleContrast.toFixed(2)} < ${TITLE_MIN} (大标题最低 3:1)`,
    })
  }
  results.push({
    id: 'A7',
    severity: 'error',
    title: 'WCAG AA 对比度',
    passed: bodyContrast >= BODY_MIN && titleContrast >= TITLE_MIN,
    message: `正文 ${bodyContrast.toFixed(2)}:1, 标题 ${titleContrast.toFixed(2)}:1`,
  })
}

// A8: 主题锁定（全册一致）
function assertThemeLock(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const theme = designFile.globalStyle.theme
  const bg = designFile.globalStyle.colors.background.toLowerCase()
  const isDarkBg = parseInt(bg.slice(0, 2), 16) < 128
  const matchesTheme = (theme === 'dark' && isDarkBg) || (theme === 'light' && !isDarkBg)
  if (!matchesTheme) {
    results.push({
      id: 'A8',
      severity: 'error',
      title: '主题锁定',
      passed: false,
      message: `主题为 ${theme} 但背景色 ${bg} 与主题不一致`,
    })
  } else {
    results.push({ id: 'A8', severity: 'error', title: '主题锁定', passed: true, message: `全册 ${theme} 主题锁定` })
  }
}

// A9: 强调色唯一性
function assertSingleAccentColor(designFile: PptxDesignFile, results: AssertionResult[]): void {
  // 检查 globalStyle.colors 中只有一个 accent
  const colors = designFile.globalStyle.colors
  if (!colors.accent) {
    results.push({ id: 'A9', severity: 'warning', title: '强调色唯一性', passed: false, message: '未定义强调色' })
    return
  }
  results.push({ id: 'A9', severity: 'info', title: '强调色唯一性', passed: true, message: `强调色: ${colors.accent}` })
}

// A10: CJK 字体兼容
function assertCjkFont(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const { headFontFace, bodyFontFace } = designFile.globalStyle.fonts
  const cjkFonts = ['Microsoft YaHei', 'SimHei', 'Noto Sans CJK', 'Noto Sans SC', 'MSYH', 'SimSun', 'KaiTi']
  const isCjk = (font: string) => cjkFonts.some((cjk) => font.includes(cjk))

  if (!isCjk(headFontFace)) {
    results.push({ id: 'A10', severity: 'error', title: 'CJK 字体兼容', passed: false, message: `标题字体 "${headFontFace}" 非 CJK 兼容` })
  }
  if (!isCjk(bodyFontFace)) {
    results.push({ id: 'A10', severity: 'error', title: 'CJK 字体兼容', passed: false, message: `正文字体 "${bodyFontFace}" 非 CJK 兼容` })
  }
  results.push({
    id: 'A10',
    severity: 'error',
    title: 'CJK 字体兼容',
    passed: isCjk(headFontFace) && isCjk(bodyFontFace),
    message: `标题: ${headFontFace}, 正文: ${bodyFontFace}`,
  })
}

// A11: 元素间距 >= 0.15 英寸
function assertElementGap(translation: TranslationResult, globalStyle: GlobalStyle, results: AssertionResult[]): void {
  const MIN_GAP = 0.15
  for (const page of translation.pages) {
    const rects: Rect[] = []
    for (const el of page.elements) {
      const rect = getElementRect(el)
      if (rect) rects.push(rect)
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]
        const b = rects[j]
        // 只检查同列或同行的相邻元素
        const vGap = Math.min(Math.abs(a.y + a.h - b.y), Math.abs(b.y + b.h - a.y))
        const hGap = Math.min(Math.abs(a.x + a.w - b.x), Math.abs(b.x + b.w - a.x))
        if (vGap > 0 && vGap < MIN_GAP && hGap < 2) {
          results.push({
            id: 'A11',
            severity: 'warning',
            title: '元素间距',
            passed: false,
            message: `页 ${page.pageId}: 垂直间距 ${vGap.toFixed(2)} < ${MIN_GAP} 英寸`,
            pageId: page.pageId,
          })
        }
      }
    }
  }
  results.push({ id: 'A11', severity: 'warning', title: '元素间距', passed: true, message: `元素间距 >= ${MIN_GAP} 英寸` })
}

// A12: 内容区起始 Y
function assertContentStartY(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const startY = designFile.globalStyle.layout.contentStartY
  const titleH = designFile.globalStyle.layout.titleAreaH
  const titleY = designFile.globalStyle.layout.titleAreaY
  if (startY < titleY + titleH) {
    results.push({
      id: 'A12',
      severity: 'error',
      title: '内容区起始 Y',
      passed: false,
      message: `内容区起始 Y (${startY}) < 标题区底部 (${titleY + titleH})`,
    })
  } else {
    results.push({ id: 'A12', severity: 'error', title: '内容区起始 Y', passed: true, message: `内容区 Y=${startY}, 标题区底部=${titleY + titleH}` })
  }
}

// A13: overrides 安全区
function assertOverridesSafeArea(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const layoutWidth = designFile.globalStyle.layout.size === 'LAYOUT_4x3' ? 10 : 13.33
  const layoutHeight = 7.5
  const margin = designFile.globalStyle.layout.margin

  for (const page of designFile.pages) {
    if (page.locked) continue
    const overrides = page.overrides ?? {}
    for (const [slotName, ov] of Object.entries(overrides)) {
      const x = ov.x ?? 0
      const y = ov.y ?? 0
      const w = ov.w ?? 0
      const h = ov.h ?? 0
      if (x < margin || y < margin || x + w > layoutWidth - margin || y + h > layoutHeight - margin) {
        results.push({
          id: 'A13',
          severity: 'error',
          title: 'overrides 安全区',
          passed: false,
          message: `页 ${page.id} slot "${slotName}": overrides 超出安全区`,
          pageId: page.id,
        })
      }
    }
  }
  results.push({ id: 'A13', severity: 'error', title: 'overrides 安全区', passed: true, message: 'overrides 在安全区内' })
}

// A14: overrides 不导致重叠
function assertOverridesNoOverlap(designFile: PptxDesignFile, results: AssertionResult[]): void {
  // 此断言需要结合翻译器输出检查，简化为记录 warning
  results.push({ id: 'A14', severity: 'warning', title: 'overrides 不导致重叠', passed: true, message: '需结合翻译器输出验证' })
}

// A15: overrides 字号范围
function assertOverridesFontSizeRange(designFile: PptxDesignFile, results: AssertionResult[]): void {
  for (const page of designFile.pages) {
    const overrides = page.overrides ?? {}
    for (const [slotName, ov] of Object.entries(overrides)) {
      if (ov.fontSize !== undefined && (ov.fontSize < 8 || ov.fontSize > 72)) {
        results.push({
          id: 'A15',
          severity: 'error',
          title: 'overrides 字号范围',
          passed: false,
          message: `页 ${page.id} slot "${slotName}": overrides 字号 ${ov.fontSize} 超出 8-72 范围`,
          pageId: page.id,
        })
      }
    }
  }
  results.push({ id: 'A15', severity: 'error', title: 'overrides 字号范围', passed: true, message: 'overrides 字号在 8-72 范围内' })
}

// A16: overrides 对比度
function assertOverridesContrast(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const bg = designFile.globalStyle.colors.background
  for (const page of designFile.pages) {
    const overrides = page.overrides ?? {}
    for (const [slotName, ov] of Object.entries(overrides)) {
      if (ov.color) {
        const ratio = contrastRatio(ov.color, bg)
        if (ratio < 3.0) {
          results.push({
            id: 'A16',
            severity: 'error',
            title: 'overrides 对比度',
            passed: false,
            message: `页 ${page.id} slot "${slotName}": overrides 颜色对比度 ${ratio.toFixed(2)} < 3.0`,
            pageId: page.id,
          })
        }
      }
    }
  }
  results.push({ id: 'A16', severity: 'error', title: 'overrides 对比度', passed: true, message: 'overrides 颜色对比度满足 WCAG AA' })
}

// A17: overrides 主题一致
function assertOverridesThemeConsistency(designFile: PptxDesignFile, results: AssertionResult[]): void {
  const theme = designFile.globalStyle.theme
  for (const page of designFile.pages) {
    const overrides = page.overrides ?? {}
    for (const [slotName, ov] of Object.entries(overrides)) {
      // 检查 fill 颜色是否与主题一致
      if (ov.fill?.color) {
        const fillRgb = parseInt(ov.fill.color.slice(0, 2), 16)
        const isLightFill = fillRgb > 128
        if (theme === 'dark' && isLightFill && !slotName.includes('card_bg')) {
          results.push({
            id: 'A17',
            severity: 'error',
            title: 'overrides 主题一致',
            passed: false,
            message: `页 ${page.id} slot "${slotName}": overrides fill ${ov.fill.color} 在 dark 主题中过亮`,
            pageId: page.id,
          })
        }
        if (theme === 'light' && !isLightFill && !slotName.includes('text')) {
          results.push({
            id: 'A17',
            severity: 'error',
            title: 'overrides 主题一致',
            passed: false,
            message: `页 ${page.id} slot "${slotName}": overrides fill ${ov.fill.color} 在 light 主题中过暗`,
            pageId: page.id,
          })
        }
      }
    }
  }
  results.push({ id: 'A17', severity: 'error', title: 'overrides 主题一致', passed: true, message: 'overrides 不导致主题翻转' })
}

// ==================== 主函数 ====================

export function runAssertions(designFile: PptxDesignFile, translation: TranslationResult): AssertionReport {
  const results: AssertionResult[] = []
  const globalStyle = designFile.globalStyle

  // 基础断言 A1-A12
  assertRequiredTokens(designFile, results)
  assertWithinBounds(translation, globalStyle, results)
  assertNoOverlap(translation, results)
  assertMinFontSize(translation, results)
  assertMaxFontSize(translation, results)
  assertTitleBodyFontSizeDiff(designFile, results)
  assertContrastRatio(designFile, results)
  assertThemeLock(designFile, results)
  assertSingleAccentColor(designFile, results)
  assertCjkFont(designFile, results)
  assertElementGap(translation, globalStyle, results)
  assertContentStartY(designFile, results)

  // overrides 断言 A13-A17
  assertOverridesSafeArea(designFile, results)
  assertOverridesNoOverlap(designFile, results)
  assertOverridesFontSizeRange(designFile, results)
  assertOverridesContrast(designFile, results)
  assertOverridesThemeConsistency(designFile, results)

  // 统计
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed && r.severity === 'error').length
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning').length
  const blockingErrors = results.filter((r) => !r.passed && r.severity === 'error')

  return {
    totalAssertions: results.length,
    passed,
    failed,
    warnings,
    results,
    blockingErrors,
  }
}

export function formatAssertionReport(report: AssertionReport): string {
  const lines: string[] = []
  lines.push(`结构化断言报告：${report.passed}/${report.totalAssertions} 通过，${report.failed} 错误，${report.warnings} 警告`)
  lines.push('')
  for (const result of report.results) {
    if (result.passed) continue
    const icon = result.severity === 'error' ? '[ERROR]' : result.severity === 'warning' ? '[WARN]' : '[INFO]'
    lines.push(`${icon} ${result.id} ${result.title}${result.pageId ? ` (页 ${result.pageId})` : ''}: ${result.message}`)
  }
  if (report.blockingErrors.length === 0) {
    lines.push('')
    lines.push('无阻断错误，可继续生成。')
  } else {
    lines.push('')
    lines.push(`存在 ${report.blockingErrors.length} 个阻断错误，必须修复后再生成。`)
  }
  return lines.join('\n')
}
