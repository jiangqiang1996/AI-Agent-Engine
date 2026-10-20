/**
 * 图表 spec → SVG 渲染器（零依赖，Node 标准库）
 *
 * 输入：一个图表 spec（普通 JSON 对象）；
 * 输出：一个独立可嵌入 PPTX 的 SVG 文本（纯矢量图元，无位图、无外链资源）。
 *
 * 设计约束：
 *   - 颜色一律 6 位 HEX、不带 `#`（与 PPTX 配色方案同源）
 *   - 文本通过 `font-family` 声明通用字体族，不依赖任何外部字体文件
 *   - 数值/坐标全部落在整数像素上，避免 PPT 缩放时的半像素锯齿
 *   - 不依赖任何第三方库，保证技能可单独拷走使用
 *
 * 支持的图表类型：bar / hbar / line / area / pie / donut
 */

/** 默认配色（与 PPTX 常用色系一致，取自设计指南的参考色） */
export const DEFAULT_COLORS = [
  '4472C4',
  'E94560',
  '70AD47',
  'ED7D31',
  '8E7CC3',
  '0097A7',
  'C0504D',
  '7F7F7F',
]

/** 默认字体族：优先中文可读性好的黑体，最后回落到无衬线 */
export const DEFAULT_FONT_FAMILY = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Segoe UI',Arial,sans-serif"

/** 转义 XML 文本 */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 估算文本宽度（pt/px 通用近似值）。
 * CJK 按 1.0 em，其余按经验系数折算，用于轴标签截断与图例宽度计算。
 */
export function estimateTextWidth(text, fontSize) {
  let width = 0
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0)
    if (code > 0x2e80) {
      width += fontSize
    } else if (ch === ' ') {
      width += fontSize * 0.27
    } else if ('ilj.,:;\'!|'.includes(ch)) {
      width += fontSize * 0.28
    } else if ('MW@%&'.includes(ch)) {
      width += fontSize * 0.72
    } else if (ch >= 'A' && ch <= 'Z') {
      width += fontSize * 0.62
    } else {
      width += fontSize * 0.52
    }
  }
  return width
}

/** 数值格式化：支持前缀/后缀与小数位 */
export function formatValue(value, options = {}) {
  const raw = Number(value)
  if (!Number.isFinite(raw)) {
    return String(value ?? '')
  }
  const decimals = Number.isFinite(options.decimals)
    ? options.decimals
    : (Number.isInteger(raw) ? 0 : 2)
  const prefix = options.prefix ?? ''
  const suffix = options.suffix ?? ''
  return prefix + raw.toFixed(decimals) + suffix
}

/** 把上限抬到"好看"的刻度值（1 / 2 / 2.5 / 5 / 10 × 10^n） */
function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }
  const exponent = Math.floor(Math.log10(value))
  const base = Math.pow(10, exponent)
  const fraction = value / base
  let nice
  if (fraction <= 1) {
    nice = 1
  } else if (fraction <= 2) {
    nice = 2
  } else if (fraction <= 2.5) {
    nice = 2.5
  } else if (fraction <= 5) {
    nice = 5
  } else {
    nice = 10
  }
  return nice * base
}

function round(value) {
  return Math.round(value)
}

/** 规范化 spec：补齐默认值并做基本校验 */
export function normalizeSpec(input) {
  const spec = input && typeof input === 'object' ? input : {}
  const options = spec.options && typeof spec.options === 'object' ? spec.options : {}

  const categories = Array.isArray(spec.categories) ? spec.categories.map((item) => String(item)) : []
  const series = Array.isArray(spec.series) && spec.series.length > 0
    ? spec.series.map((item, index) => ({
      name: String(item?.name ?? '系列' + (index + 1)),
      data: Array.isArray(item?.data) ? item.data.map((v) => Number(v) || 0) : [],
    }))
    : []

  if (categories.length === 0 && series.length > 0) {
    const longest = series.reduce((max, item) => Math.max(max, item.data.length), 0)
    for (let i = 0; i < longest; i += 1) {
      categories.push(String(i + 1))
    }
  }
  if (series.length === 0) {
    throw new Error('图表 spec 缺少 series 数据')
  }
  for (const item of series) {
    while (item.data.length < categories.length) {
      item.data.push(0)
    }
  }

  const colors = Array.isArray(spec.colors) && spec.colors.length > 0
    ? spec.colors.map((c) => String(c).replace(/^#/, '').toUpperCase())
    : DEFAULT_COLORS.slice()

  return {
    type: String(spec.type ?? 'bar').toLowerCase(),
    width: Number(spec.width) > 0 ? Number(spec.width) : 960,
    height: Number(spec.height) > 0 ? Number(spec.height) : 400,
    title: String(spec.title ?? ''),
    subtitle: String(spec.subtitle ?? ''),
    background: spec.background === 'transparent' ? 'transparent' : String(spec.background ?? 'FFFFFF').replace(/^#/, '').toUpperCase(),
    categories,
    series,
    colors,
    textColor: String(spec.text?.color ?? '333333').replace(/^#/, '').toUpperCase(),
    gridColor: String(spec.grid?.color ?? 'E5E7EB').replace(/^#/, '').toUpperCase(),
    axisColor: String(spec.grid?.axisColor ?? 'BFBFBF').replace(/^#/, '').toUpperCase(),
    options: {
      showLegend: options.showLegend !== false,
      showValues: options.showValues === true,
      legendPosition: options.legendPosition === 'bottom' ? 'bottom' : 'right',
      fontFamily: String(options.fontFamily ?? DEFAULT_FONT_FAMILY),
      titleSize: Number(options.titleSize) > 0 ? Number(options.titleSize) : 18,
      subtitleSize: Number(options.subtitleSize) > 0 ? Number(options.subtitleSize) : 12,
      axisSize: Number(options.axisSize) > 0 ? Number(options.axisSize) : 12,
      valueSize: Number(options.valueSize) > 0 ? Number(options.valueSize) : 11,
      ticks: Number(options.ticks) > 0 ? Number(options.ticks) : 5,
      yMin: Number.isFinite(Number(options.yMin)) ? Number(options.yMin) : null,
      yMax: Number.isFinite(Number(options.yMax)) ? Number(options.yMax) : null,
      decimals: Number.isFinite(Number(options.decimals)) ? Number(options.decimals) : undefined,
      prefix: options.prefix ?? '',
      suffix: options.suffix ?? '',
      labelRotate: Number(options.labelRotate) || 0,
      maxLabelChars: Number(options.maxLabelChars) > 0 ? Number(options.maxLabelChars) : 12,
    },
  }
}

/** 截断过长标签并补省略号 */
function truncateLabel(text, fontSize, maxChars) {
  const value = String(text ?? '')
  if (maxChars <= 0 || value.length <= maxChars) {
    return value
  }
  let result = ''
  let width = 0
  for (const ch of value) {
    const chWidth = ch.codePointAt(0) > 0x2e80 ? fontSize : fontSize * 0.55
    if (width + chWidth > estimateTextWidth('…', fontSize)) {
      break
    }
    result += ch
    width += chWidth
  }
  return result + '…'
}

function seriesColor(cfg, index) {
  return cfg.colors[index % cfg.colors.length]
}

/** 计算图例需要的宽度 */
function legendWidth(cfg) {
  let max = 0
  for (const item of cfg.series) {
    max = Math.max(max, estimateTextWidth(item.name, cfg.options.axisSize))
  }
  return round(max + 34)
}

/** 计算绘图区（plot area） */
function computePlotArea(cfg) {
  const { options, width, height } = cfg
  let top = 16
  if (cfg.title) {
    top += round(options.titleSize * 1.35)
    if (cfg.subtitle) {
      top += round(options.subtitleSize * 1.4)
    }
  }
  top += 10

  const legendRight = options.legendPosition === 'right'
  const bottom = options.showLegend && !legendRight ? 26 + 24 : 30

  const axisLeft = 58
  const axisRight = legendRight && options.showLegend ? legendWidth(cfg) + 26 : 20

  return {
    left: axisLeft,
    top: round(top),
    right: round(width - axisRight),
    bottom: round(height - bottom),
    legendRight,
  }
}

function renderTitle(cfg) {
  if (!cfg.title && !cfg.subtitle) {
    return ''
  }
  const parts = []
  let y = 14
  if (cfg.title) {
    parts.push(
      `<text x="${cfg.options.titleSize}" y="${round(y + cfg.options.titleSize)}" ` +
      `font-family="${escapeXml(cfg.options.fontFamily)}" font-size="${cfg.options.titleSize}" ` +
      `font-weight="700" fill="#${cfg.textColor}">${escapeXml(cfg.title)}</text>`,
    )
    y += round(cfg.options.titleSize * 1.35)
  }
  if (cfg.subtitle) {
    parts.push(
      `<text x="${cfg.options.subtitleSize}" y="${round(y + cfg.options.subtitleSize)}" ` +
      `font-family="${escapeXml(cfg.options.fontFamily)}" font-size="${cfg.options.subtitleSize}" ` +
      `fill="#${cfg.axisColor}">${escapeXml(cfg.subtitle)}</text>`,
    )
  }
  return parts.join('\n    ')
}

/** 图例（右侧或底部） */
function renderLegend(cfg, plot) {
  if (!cfg.options.showLegend) {
    return ''
  }
  const parts = []
  const swatch = 11
  const fontSize = cfg.options.axisSize

  if (cfg.options.legendPosition === 'bottom') {
    const gap = 22
    let total = 0
    for (const item of cfg.series) {
      total += swatch + 6 + estimateTextWidth(item.name, fontSize) + gap
    }
    total -= gap
    let x = Math.max(10, round((cfg.width - total) / 2))
    const y = cfg.height - 18
    for (const [index, item] of cfg.series.entries()) {
      parts.push(
        `<rect x="${x}" y="${round(y - swatch + 2)}" width="${swatch}" height="${swatch}" rx="2" fill="#${seriesColor(cfg, index)}"/>`,
      )
      parts.push(
        `<text x="${x + swatch + 6}" y="${round(y)}" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
        `font-size="${fontSize}" fill="#${cfg.textColor}">${escapeXml(item.name)}</text>`,
      )
      x += swatch + 6 + round(estimateTextWidth(item.name, fontSize)) + gap
    }
    return parts.join('\n    ')
  }

  let y = plot.top + 6
  const x = plot.right + 16
  for (const [index, item] of cfg.series.entries()) {
    parts.push(
      `<rect x="${x}" y="${round(y - swatch + 2)}" width="${swatch}" height="${swatch}" rx="2" fill="#${seriesColor(cfg, index)}"/>`,
    )
    parts.push(
      `<text x="${x + swatch + 6}" y="${round(y)}" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
      `font-size="${fontSize}" fill="#${cfg.textColor}">${escapeXml(item.name)}</text>`,
    )
    y += 22
  }
  return parts.join('\n    ')
}

/** 计算数值轴范围与刻度 */
function computeScale(cfg) {
  const values = []
  for (const item of cfg.series) {
    for (const v of item.data) {
      values.push(v)
    }
  }
  const maxValue = values.length > 0 ? Math.max(...values) : 1
  const minValue = values.length > 0 ? Math.min(...values) : 0

  let yMax = cfg.options.yMax
  let yMin = cfg.options.yMin
  if (yMax === null) {
    yMax = niceCeil(maxValue > 0 ? maxValue : 1)
  }
  if (yMin === null) {
    yMin = minValue < 0 ? -niceCeil(-minValue) : 0
  }
  if (yMax === yMin) {
    yMax = yMin + 1
  }
  const ticks = cfg.options.ticks
  const step = (yMax - yMin) / ticks
  const values_out = []
  for (let i = 0; i <= ticks; i += 1) {
    values_out.push(yMin + step * i)
  }
  return { yMin, yMax, ticks: values_out }
}

/** 网格线 + Y 轴刻度标签 */
function renderGrid(cfg, plot, scale) {
  const parts = []
  const height = plot.bottom - plot.top
  for (const value of scale.ticks) {
    const y = round(plot.bottom - ((value - scale.yMin) / (scale.yMax - scale.yMin)) * height)
    parts.push(
      `<line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}" stroke="#${cfg.gridColor}" stroke-width="1"/>`,
    )
    parts.push(
      `<text x="${plot.left - 8}" y="${y + 4}" text-anchor="end" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
      `font-size="${cfg.options.axisSize}" fill="#${cfg.axisColor}">${escapeXml(formatValue(value, cfg.options))}</text>`,
    )
  }
  parts.push(
    `<line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="#${cfg.axisColor}" stroke-width="1"/>`,
  )
  return parts.join('\n    ')
}

/** X 轴分类标签 */
function renderCategoryLabels(cfg, plot, bandWidth) {
  const parts = []
  const y = plot.bottom + 18
  for (const [index, label] of cfg.categories.entries()) {
    const center = round(plot.left + bandWidth * index + bandWidth / 2)
    const text = truncateLabel(label, cfg.options.axisSize, cfg.options.maxLabelChars)
    if (cfg.options.labelRotate) {
      parts.push(
        `<text x="${center}" y="${y}" text-anchor="end" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
        `font-size="${cfg.options.axisSize}" fill="#${cfg.textColor}" ` +
        `transform="rotate(${cfg.options.labelRotate} ${center} ${y})">${escapeXml(text)}</text>`,
      )
    } else {
      parts.push(
        `<text x="${center}" y="${y}" text-anchor="middle" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
        `font-size="${cfg.options.axisSize}" fill="#${cfg.textColor}">${escapeXml(text)}</text>`,
      )
    }
  }
  return parts.join('\n    ')
}

function renderBarChart(cfg) {
  const horizontal = cfg.type === 'hbar'
  const plot = computePlotArea(cfg)
  const scale = computeScale(cfg)
  const parts = []

  const plotWidth = plot.right - plot.left
  const plotHeight = plot.bottom - plot.top
  const bandWidth = horizontal ? plotHeight / cfg.categories.length : plotWidth / cfg.categories.length
  const groupWidth = bandWidth * 0.64
  const barWidth = groupWidth / cfg.series.length

  if (!horizontal) {
    parts.push(renderGrid(cfg, plot, scale))
  }

  for (const [seriesIndex, item] of cfg.series.entries()) {
    for (const [categoryIndex, value] of item.data.entries()) {
      const color = seriesColor(cfg, seriesIndex)
      const offset = groupWidth / 2 - barWidth * seriesIndex - barWidth + (barWidth * 0.08)
      if (horizontal) {
        const groupTop = plot.top + bandWidth * categoryIndex + (bandWidth - groupWidth) / 2
        const length = Math.abs(value) / (scale.yMax - scale.yMin) * plotWidth
        const x = value >= 0 ? plot.left : plot.left - length
        const y = round(groupTop + offset)
        parts.push(
          `<rect x="${round(x)}" y="${y}" width="${round(Math.max(length, 1))}" height="${round(barWidth * 0.84)}" rx="2" fill="#${color}"/>`,
        )
        if (cfg.options.showValues) {
          const labelX = value >= 0 ? round(x + length + 6) : round(x - 6)
          const anchor = value >= 0 ? 'start' : 'end'
          parts.push(
            `<text x="${labelX}" y="${round(y + barWidth * 0.84 * 0.7)}" text-anchor="${anchor}" ` +
            `font-family="${escapeXml(cfg.options.fontFamily)}" font-size="${cfg.options.valueSize}" ` +
            `fill="#${cfg.textColor}">${escapeXml(formatValue(value, cfg.options))}</text>`,
          )
        }
      } else {
        const groupLeft = plot.left + bandWidth * categoryIndex + (bandWidth - groupWidth) / 2
        const x = round(groupLeft + offset)
        const zeroY = plot.bottom - ((0 - scale.yMin) / (scale.yMax - scale.yMin)) * plotHeight
        const valueY = plot.bottom - ((value - scale.yMin) / (scale.yMax - scale.yMin)) * plotHeight
        const top = round(Math.min(valueY, zeroY))
        const height = round(Math.max(Math.abs(zeroY - valueY), 1))
        parts.push(
          `<rect x="${x}" y="${top}" width="${round(barWidth * 0.84)}" height="${height}" rx="2" fill="#${color}"/>`,
        )
        if (cfg.options.showValues) {
          parts.push(
            `<text x="${round(x + barWidth * 0.42)}" y="${top - 6}" text-anchor="middle" ` +
            `font-family="${escapeXml(cfg.options.fontFamily)}" font-size="${cfg.options.valueSize}" ` +
            `fill="#${cfg.textColor}">${escapeXml(formatValue(value, cfg.options))}</text>`,
          )
        }
      }
    }
  }

  if (!horizontal) {
    parts.push(renderCategoryLabels(cfg, plot, bandWidth))
  } else {
    // 横向条形图：Y 轴是分类，X 轴是数值
    const step = (scale.yMax - scale.yMin) / cfg.options.ticks
    for (let i = 0; i <= cfg.options.ticks; i += 1) {
      const value = scale.yMin + step * i
      const x = round(plot.left + ((value - scale.yMin) / (scale.yMax - scale.yMin)) * plotWidth)
      parts.push(
        `<line x1="${x}" y1="${plot.top}" x2="${x}" y2="${plot.bottom}" stroke="#${cfg.gridColor}" stroke-width="1"/>`,
      )
      parts.push(
        `<text x="${x}" y="${plot.bottom + 18}" text-anchor="middle" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
        `font-size="${cfg.options.axisSize}" fill="#${cfg.axisColor}">${escapeXml(formatValue(value, cfg.options))}</text>`,
      )
    }
    for (const [index, label] of cfg.categories.entries()) {
      const center = round(plot.top + bandWidth * index + bandWidth / 2)
      const text = truncateLabel(label, cfg.options.axisSize, cfg.options.maxLabelChars)
      parts.push(
        `<text x="${plot.left - 8}" y="${center + 4}" text-anchor="end" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
        `font-size="${cfg.options.axisSize}" fill="#${cfg.textColor}">${escapeXml(text)}</text>`,
      )
    }
  }

  parts.push(renderLegend(cfg, plot))
  return wrapSvg(cfg, parts.join('\n    '))
}

function renderLineChart(cfg) {
  const plot = computePlotArea(cfg)
  const scale = computeScale(cfg)
  const parts = []
  const plotWidth = plot.right - plot.left
  const plotHeight = plot.bottom - plot.top
  const bandWidth = plotWidth / cfg.categories.length
  const isArea = cfg.type === 'area'

  parts.push(renderGrid(cfg, plot, scale))

  const baseline = round(plot.bottom - ((0 - scale.yMin) / (scale.yMax - scale.yMin)) * plotHeight)

  for (const [seriesIndex, item] of cfg.series.entries()) {
    const color = seriesColor(cfg, seriesIndex)
    const points = []
    for (const [index, value] of item.data.entries()) {
      const x = round(plot.left + bandWidth * index + bandWidth / 2)
      const y = round(plot.bottom - ((value - scale.yMin) / (scale.yMax - scale.yMin)) * plotHeight)
      points.push({ x, y, value })
    }
    if (points.length === 0) {
      continue
    }
    if (isArea) {
      const areaPath = 'M ' + points.map((p) => p.x + ' ' + p.y).join(' L ') +
        ' L ' + points[points.length - 1].x + ' ' + baseline +
        ' L ' + points[0].x + ' ' + baseline + ' Z'
      parts.push(`<path d="${areaPath}" fill="#${color}" fill-opacity="0.18"/>`)
    }
    const linePath = 'M ' + points.map((p) => p.x + ' ' + p.y).join(' L ')
    parts.push(
      `<path d="${linePath}" fill="none" stroke="#${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    for (const point of points) {
      parts.push(`<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#${color}"/>`)
      if (cfg.options.showValues) {
        parts.push(
          `<text x="${point.x}" y="${point.y - 9}" text-anchor="middle" ` +
          `font-family="${escapeXml(cfg.options.fontFamily)}" font-size="${cfg.options.valueSize}" ` +
          `fill="#${cfg.textColor}">${escapeXml(formatValue(point.value, cfg.options))}</text>`,
        )
      }
    }
  }

  parts.push(renderCategoryLabels(cfg, plot, bandWidth))
  parts.push(renderLegend(cfg, plot))
  return wrapSvg(cfg, parts.join('\n    '))
}

function polarPoint(cx, cy, radius, degree) {
  const radian = ((degree - 90) * Math.PI) / 180
  return {
    x: round(cx + radius * Math.cos(radian)),
    y: round(cy + radius * Math.sin(radian)),
  }
}

function renderPieChart(cfg) {
  const isDonut = cfg.type === 'donut'
  const parts = []
  const legendRight = cfg.options.legendPosition === 'right'
  const legendPad = cfg.options.showLegend && legendRight ? legendWidth(cfg) + 30 : 10
  const top = cfg.title ? round(16 + cfg.options.titleSize * 1.35 + (cfg.subtitle ? cfg.options.subtitleSize * 1.4 : 0) + 10) : 20
  const bottom = cfg.options.showLegend && !legendRight ? 56 : 20

  const cx = round((cfg.width - legendPad) / 2)
  const cy = round((top + (cfg.height - bottom)) / 2)
  const radius = round(Math.min((cfg.width - legendPad) / 2, (cfg.height - top - bottom) / 2) - 12)
  if (radius <= 0) {
    throw new Error('图表尺寸过小，无法绘制饼图')
  }
  const innerRadius = isDonut ? round(radius * 0.56) : 0

  const values = cfg.series[0].data
  const total = values.reduce((sum, v) => sum + Math.max(v, 0), 0)

  if (total <= 0) {
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
      `font-size="${cfg.options.axisSize}" fill="#${cfg.axisColor}">无数据</text>`,
    )
  } else {
    let angle = 0
    for (const [index, value] of values.entries()) {
      const ratio = Math.max(value, 0) / total
      const sweep = ratio * 360
      const color = seriesColor(cfg, index)
      const start = polarPoint(cx, cy, radius, angle)
      const end = polarPoint(cx, cy, radius, angle + sweep)
      const largeArc = sweep > 180 ? 1 : 0

      if (isDonut) {
        const innerStart = polarPoint(cx, cy, innerRadius, angle)
        const innerEnd = polarPoint(cx, cy, innerRadius, angle + sweep)
        const path = 'M ' + start.x + ' ' + start.y +
          ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + end.x + ' ' + end.y +
          ' L ' + innerEnd.x + ' ' + innerEnd.y +
          ' A ' + innerRadius + ' ' + innerRadius + ' 0 ' + largeArc + ' 0 ' + innerStart.x + ' ' + innerStart.y + ' Z'
        parts.push(`<path d="${path}" fill="#${color}" fill-rule="evenodd"/>`)
      } else {
        const path = 'M ' + cx + ' ' + cy +
          ' L ' + start.x + ' ' + start.y +
          ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + end.x + ' ' + end.y + ' Z'
        parts.push(`<path d="${path}" fill="#${color}"/>`)
      }

      if (cfg.options.showValues && ratio > 0.03) {
        const labelRadius = isDonut ? (radius + innerRadius) / 2 : radius * 0.66
        const label = polarPoint(cx, cy, labelRadius, angle + sweep / 2)
        parts.push(
          `<text x="${label.x}" y="${label.y + 4}" text-anchor="middle" font-family="${escapeXml(cfg.options.fontFamily)}" ` +
          `font-size="${cfg.options.valueSize}" fill="#FFFFFF">${escapeXml(formatValue(ratio * 100, { decimals: 0 }) + '%')}</text>`,
        )
      }
      angle += sweep
    }
  }

  const legendCfg = {
    ...cfg,
    series: cfg.categories.map((name, index) => ({ name, data: [] })),
  }
  parts.push(renderLegend(legendCfg, { top, right: cx + radius + 8 }))
  return wrapSvg(cfg, parts.join('\n    '))
}

/** 组装最终 SVG 文档 */
function wrapSvg(cfg, content) {
  const background = cfg.background === 'transparent'
    ? ''
    : `    <rect x="0" y="0" width="${cfg.width}" height="${cfg.height}" fill="#${cfg.background}"/>\n`
  const title = cfg.title
    ? `  <title>${escapeXml(cfg.title)}</title>\n`
    : ''
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + cfg.width + '" height="' + cfg.height + '"',
    ' viewBox="0 0 ' + cfg.width + ' ' + cfg.height + '"',
    ' preserveAspectRatio="xMidYMid meet" role="img"',
    ' aria-label="' + escapeXml(cfg.title || cfg.subtitle || 'chart') + '">',
    title + background + '    ' + renderTitle(cfg),
    content,
    '</svg>',
    '',
  ].join('\n')
}

/**
 * 把图表 spec 渲染为独立 SVG 文本。
 * @param {object} spec 图表 spec
 * @returns {string} SVG 文本
 */
export function renderChart(spec) {
  const cfg = normalizeSpec(spec)
  switch (cfg.type) {
    case 'bar':
      return renderBarChart(cfg)
    case 'hbar':
      return renderBarChart(cfg)
    case 'line':
      return renderLineChart(cfg)
    case 'area':
      return renderLineChart(cfg)
    case 'pie':
      return renderPieChart(cfg)
    case 'donut':
      return renderPieChart(cfg)
    default:
      throw new Error('不支持的图表类型：' + cfg.type + '（可用：bar / hbar / line / area / pie / donut）')
  }
}
