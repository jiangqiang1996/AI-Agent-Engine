/**
 * HTML → SVG 转换工具（零依赖，Node 标准库）
 *
 * 提供三块能力：
 *   1. extractChartSpec  —— 从 HTML 中取出内嵌的图表 spec（JSON）
 *   2. extractInlineSvg  —— 从 HTML 中取出内联 <svg>
 *   3. inlineCss / normalizeSvg —— 把 CSS 规则内联成呈现属性，并规范化 SVG 文档
 *
 * 为什么需要 CSS 内联：PPT 内嵌的 SVG 由 Office 自己的渲染器绘制，
 * 对 <style> + class 选择器的支持不稳定；把样式落成呈现属性（fill / stroke / font-size …）
 * 才能在 PowerPoint / WPS / Keynote 中稳定还原。
 */

/** 图表 spec 在 HTML 中的承载方式：<script type="application/json" id="ae-chart"> */
export const CHART_SCRIPT_ID = 'ae-chart'

/** 可直接转成 SVG 呈现属性的 CSS 属性白名单 */
const PRESENTATION_PROPERTIES = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'text-decoration',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'writing-mode',
  'direction',
  'transform',
  'transform-origin',
  'paint-order',
  'shape-rendering',
  'text-rendering',
  'vector-effect',
  'stop-color',
  'stop-opacity',
  'mix-blend-mode',
  'display',
  'visibility',
])

/** HTML/SVG 中常见的自闭合元素 */
const SELF_CLOSING_TAGS = new Set([
  'rect', 'circle', 'ellipse', 'line', 'path', 'polygon', 'polyline',
  'use', 'stop', 'image', 'br', 'hr', 'meta', 'link', 'input', 'img',
])

/** 读取标签内容 */
function readTagContent(html, tagName) {
  const pattern = new RegExp('<' + tagName + '\\b[^>]*>([\\s\\S]*?)</' + tagName + '>', 'gi')
  const results = []
  let match
  while ((match = pattern.exec(html)) !== null) {
    results.push({
      content: match[1],
      attrs: match[0].slice(0, match[0].indexOf('>') + 1),
    })
  }
  return results
}

/**
 * 取出 HTML 中内嵌的图表 spec。
 * 支持两种写法：
 *   - <script type="application/json" id="ae-chart">{...}</script>
 *   - <script type="application/json" class="ae-chart">{...}</script>
 * @param {string} html
 * @returns {object|null}
 */
export function extractChartSpec(html) {
  const text = String(html ?? '')
  const blocks = readTagContent(text, 'script')
  for (const block of blocks) {
    const attrs = block.attrs
    if (!/type\s*=\s*["']application\/json["']/i.test(attrs)) {
      continue
    }
    const idMatch = attrs.match(/id\s*=\s*["']([^"']+)["']/i)
    const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i)
    const wanted = idMatch
      ? idMatch[1] === CHART_SCRIPT_ID
      : (classMatch ? classMatch[1].split(/\s+/).includes(CHART_SCRIPT_ID) : false)
    if (!wanted) {
      continue
    }
    const raw = block.content.trim()
    if (!raw) {
      continue
    }
    try {
      return JSON.parse(raw)
    } catch (error) {
      throw new Error('HTML 中的图表 spec 不是合法 JSON：' + error.message)
    }
  }
  return null
}

/**
 * 取出 HTML 中第一个内联 <svg>（含其内部内容）。
 * @param {string} html
 * @returns {string|null}
 */
export function extractInlineSvg(html) {
  const text = String(html ?? '')
  const start = text.toLowerCase().indexOf('<svg')
  if (start === -1) {
    return null
  }
  const openEnd = text.indexOf('>', start)
  if (openEnd === -1) {
    return null
  }
  if (text.slice(start, openEnd).trimEnd().endsWith('/')) {
    return text.slice(start, openEnd + 1)
  }
  const end = text.toLowerCase().indexOf('</svg>', openEnd)
  if (end === -1) {
    return text.slice(start)
  }
  return text.slice(start, end + 6)
}

/** 取标签的属性映射 */
export function readAttributes(tagText) {
  const attrs = {}
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match
  while ((match = pattern.exec(tagText)) !== null) {
    const name = match[1].toLowerCase()
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attrs[name] = value
  }
  return attrs
}

/** 去掉 CSS 注释 */
function stripCssComments(text) {
  return String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 解析 CSS 文本，返回 [{ selector, declarations: [{property, value}], specificity }]
 */
export function parseCss(cssText) {
  const rules = []
  const text = stripCssComments(cssText).replace(/\r\n/g, '\n')
  let index = 0
  while (index < text.length) {
    const braceIndex = text.indexOf('{', index)
    if (braceIndex === -1) {
      break
    }
    const selectorText = text.slice(index, braceIndex).trim()
    const closeIndex = text.indexOf('}', braceIndex)
    if (closeIndex === -1) {
      break
    }
    const body = text.slice(braceIndex + 1, closeIndex)
    index = closeIndex + 1
    if (!selectorText || selectorText.startsWith('@')) {
      continue
    }
    const declarations = []
    for (const chunk of body.split(';')) {
      const colon = chunk.indexOf(':')
      if (colon === -1) {
        continue
      }
      const property = chunk.slice(0, colon).trim().toLowerCase()
      let value = chunk.slice(colon + 1).trim()
      if (!property || !value) {
        continue
      }
      value = value.replace(/\s*!important\s*$/i, '')
      if (value) {
        declarations.push({ property, value })
      }
    }
    if (declarations.length === 0) {
      continue
    }
    for (const selector of selectorText.split(',')) {
      const trimmed = selector.trim()
      if (!trimmed) {
        continue
      }
      rules.push({
        selector: trimmed,
        declarations,
        specificity: computeSpecificity(trimmed),
      })
    }
  }
  return rules
}

/** 计算选择器权重：id > class > 标签 */
function computeSpecificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  const classes = (selector.match(/\.[\w-]+/g) || []).length
  const tags = (selector.match(/(^|[\s>+~])([a-zA-Z][\w-]*)/g) || []).length
  return ids * 100 + classes * 10 + tags
}

/** 解析复合选择器：tag / .class / #id 的组合 */
function parseCompound(compound) {
  const result = { tag: null, id: null, classes: [] }
  const pattern = /([.#]?)([\w-]+)/g
  let match
  while ((match = pattern.exec(compound)) !== null) {
    const prefix = match[1]
    const name = match[2]
    if (prefix === '.') {
      result.classes.push(name)
    } else if (prefix === '#') {
      result.id = name
    } else {
      result.tag = name.toLowerCase()
    }
  }
  return result
}

/** 判断某个元素是否命中复合选择器 */
function matchesCompound(element, compound) {
  if (compound.tag && element.tag !== compound.tag) {
    return false
  }
  if (compound.id && element.attrs.id !== compound.id) {
    return false
  }
  for (const cls of compound.classes) {
    const classAttr = element.attrs.class
    if (!classAttr || !classAttr.split(/\s+/).includes(cls)) {
      return false
    }
  }
  return true
}

/**
 * 判断元素是否命中选择器（支持空格后代组合）。
 * @param {object} element 当前元素
 * @param {object[]} ancestors 祖先链（由远及近）
 */
function matchesSelector(element, ancestors, selector) {
  const parts = selector.split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return false
  }
  const last = parseCompound(parts[parts.length - 1])
  if (!matchesCompound(element, last)) {
    return false
  }
  if (parts.length === 1) {
    return true
  }
  const parentChain = parts.slice(0, -1).reverse()
  let cursor = ancestors.length - 1
  for (const part of parentChain) {
    const compound = parseCompound(part)
    let found = false
    while (cursor >= 0) {
      if (matchesCompound(ancestors[cursor], compound)) {
        found = true
        cursor -= 1
        break
      }
      cursor -= 1
    }
    if (!found) {
      return false
    }
  }
  return true
}

/**
 * 归一化呈现属性的取值。
 * SVG 的 font-size / stroke-width 用无单位数值最稳（Office 渲染器对 px 单位的兼容性参差）。
 */
function normalizePresentationValue(property, value) {
  const text = String(value ?? '').trim()
  if (property === 'font-size' || property === 'stroke-width' || property === 'letter-spacing' || property === 'word-spacing') {
    const match = text.match(/^(-?[0-9.]+)\s*(px|pt)?$/i)
    if (match) {
      return match[1]
    }
  }
  if (property === 'opacity' || property === 'fill-opacity' || property === 'stroke-opacity') {
    const match = text.match(/^([0-9.]+)%$/)
    if (match) {
      return String(Number(match[1]) / 100)
    }
  }
  return text
}

/**
 * 把 CSS 规则内联成元素的呈现属性（单遍扫描 + 祖先栈）。
 *
 * @param {string} svgText SVG 源文本
 * @param {string[]} cssTexts HTML/SVG 中的 <style> 内容
 * @returns {string} 处理后的 SVG 文本
 */
export function inlineCss(svgText, cssTexts) {
  const text = String(svgText ?? '')
  const rules = []
  for (const css of cssTexts) {
    rules.push(...parseCss(css))
  }
  if (rules.length === 0) {
    return text
  }

  const tagPattern = /<\/?([a-zA-Z_][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)(\/?)>/g
  const stack = []
  let cursor = 0
  let output = ''
  let match

  while ((match = tagPattern.exec(text)) !== null) {
    const full = match[0]
    const tag = match[1].toLowerCase()
    const isClosing = full.startsWith('</')
    // 自闭合判定看标签文本本身：正则里的属性组会贪婪吃掉结尾的 '/'
    const isSelfClosing = full.endsWith('/>') || SELF_CLOSING_TAGS.has(tag)

    output += text.slice(cursor, match.index)
    cursor = match.index + full.length

    if (isClosing) {
      output += full
      stack.pop()
      continue
    }
    if (tag === 'style' || tag === 'script') {
      output += full
      if (!isSelfClosing) {
        stack.push({ tag, attrs: {} })
      }
      continue
    }

    const element = { tag, attrs: readAttributes(full) }
    const ancestors = stack.slice()
    const props = new Map()

    const matched = rules
      .filter((rule) => matchesSelector(element, ancestors, rule.selector))
      .sort((a, b) => a.specificity - b.specificity)
    for (const rule of matched) {
      for (const declaration of rule.declarations) {
        if (!PRESENTATION_PROPERTIES.has(declaration.property)) {
          continue
        }
        props.set(declaration.property, declaration.value)
      }
    }

    const inlineStyle = element.attrs.style
    if (inlineStyle) {
      const parsed = parseCss('x{' + inlineStyle + '}')
      for (const declaration of parsed.length > 0 ? parsed[0].declarations : []) {
        if (!PRESENTATION_PROPERTIES.has(declaration.property)) {
          continue
        }
        props.set(declaration.property, declaration.value)
      }
    }

    const additions = []
    for (const [property, value] of props.entries()) {
      if (element.attrs[property] !== undefined && !inlineStyle) {
        continue
      }
      const normalized = normalizePresentationValue(property, value)
      additions.push(' ' + property + '="' + String(normalized).replace(/"/g, '&quot;') + '"')
    }

    if (additions.length > 0) {
      // 自闭合标签（... />）要插到 '/' 之前，否则会破坏标签结构
      const selfClosing = full.endsWith('/>')
      const insertAt = selfClosing ? full.length - 2 : full.length - 1
      output += full.slice(0, insertAt) + additions.join('') + full.slice(insertAt)
    } else {
      output += full
    }

    if (!isSelfClosing) {
      stack.push(element)
    }
  }

  output += text.slice(cursor)
  return output
}

/** 解析长度：支持纯数字（视为 px）与 px / pt 单位 */
export function parseLength(value) {
  if (value === undefined || value === null) {
    return null
  }
  const match = String(value).trim().match(/^(-?[0-9.]+)\s*(px|pt)?$/i)
  if (!match) {
    return null
  }
  const number = Number(match[1])
  return Number.isFinite(number) ? number : null
}

function round(value) {
  return Math.round(value)
}

/**
 * 规范化 SVG：补齐命名空间/尺寸/viewBox，移除脚本与注释。
 * @param {string} svgText
 * @param {object} [options]
 * @param {number} [options.width] 强制宽度
 * @param {number} [options.height] 强制高度
 * @param {string} [options.background] 背景色（6 位 HEX 或 transparent）
 * @param {string} [options.title] 无障碍标题
 */
export function normalizeSvg(svgText, options = {}) {
  let text = String(svgText ?? '').trim()
  if (!text) {
    throw new Error('SVG 内容为空')
  }
  text = text.replace(/<\?xml[\s\S]*?\?>/gi, '')
  text = text.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  text = text.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  text = text.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')

  const openTagMatch = text.match(/<svg\b([^>]*)>/i)
  if (!openTagMatch) {
    throw new Error('未找到 <svg> 根元素')
  }
  const attrs = readAttributes(openTagMatch[0])

  let width = Number(options.width) > 0 ? Number(options.width) : parseLength(attrs.width)
  let height = Number(options.height) > 0 ? Number(options.height) : parseLength(attrs.height)

  let viewBox = null
  if (attrs.viewbox) {
    const parts = attrs.viewbox.split(/[\s,]+/).map((v) => Number(v))
    if (parts.length === 4 && parts.every((v) => Number.isFinite(v))) {
      viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
    }
  }

  if (!width && viewBox) {
    width = viewBox.width
  }
  if (!height && viewBox) {
    height = viewBox.height
  }
  if (!width) {
    width = 960
  }
  if (!height) {
    height = 400
  }
  if (!viewBox) {
    viewBox = { x: 0, y: 0, width, height }
  }

  const newAttrs = [
    'xmlns="http://www.w3.org/2000/svg"',
    'width="' + round(width) + '"',
    'height="' + round(height) + '"',
    'viewBox="' + [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(' ') + '"',
    'preserveAspectRatio="xMidYMid meet"',
  ]
  if (attrs.role) {
    newAttrs.push('role="' + attrs.role + '"')
  }
  const label = options.title || attrs['aria-label']
  if (label) {
    newAttrs.push('aria-label="' + String(label).replace(/"/g, '&quot;') + '"')
  }

  text = text.replace(openTagMatch[0], '<svg ' + newAttrs.join(' ') + '>')

  // 移除 <style> 块（样式已内联成呈现属性）
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')

  if (options.background && options.background !== 'transparent') {
    const background = String(options.background).replace(/^#/, '')
    if (!/<rect[^>]*\bwidth=["']100%["'][^>]*\bheight=["']100%["']/i.test(text)) {
      const insertAt = text.indexOf('>', text.indexOf('<svg')) + 1
      text = text.slice(0, insertAt) +
        '\n  <rect x="0" y="0" width="' + round(width) + '" height="' + round(height) + '" fill="#' + background + '"/>' +
        text.slice(insertAt)
    }
  }

  return text.trim() + '\n'
}

/** 从 HTML 中收集所有 <style> 内容 */
export function collectStyleBlocks(html) {
  return readTagContent(String(html ?? ''), 'style').map((block) => block.content)
}

/**
 * HTML → SVG 的完整处理流程（不依赖浏览器）。
 * @param {string} html
 * @param {object} [options]
 * @param {Function} [options.renderChartImpl] 图表渲染器（默认由调用方注入，避免循环依赖）
 * @returns {{ svg: string, mode: string }|null} 无可转换内容时返回 null
 */
export function htmlToSvg(html, options = {}) {
  const spec = extractChartSpec(html)
  if (spec) {
    const render = options.renderChartImpl
    if (!render) {
      throw new Error('缺少图表渲染器实现')
    }
    return { svg: normalizeSvg(render(spec), options), mode: 'spec' }
  }

  const inline = extractInlineSvg(html)
  if (inline) {
    const inlined = inlineCss(inline, collectStyleBlocks(html))
    return { svg: normalizeSvg(inlined, options), mode: 'inline' }
  }

  return null
}
