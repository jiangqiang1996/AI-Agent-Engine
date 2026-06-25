import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import type { PptxInputElement, PptxSlideContent, PptxTextRun } from './pptx-service.js'

export type SlideSeparator = 'section' | 'hr' | 'h1' | 'auto'

export interface BrowserBackground {
  type: 'color' | 'image'
  value?: string
  path?: string
}

export interface BrowserTextStyle {
  fontSize?: number
  color?: string
  bold?: boolean
  italic?: boolean
  fontFace?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  underline?: boolean | { style: string }
  lineSpacing?: number
  paraSpaceBefore?: number
  paraSpaceAfter?: number
  margin?: number | [number, number, number, number]
  rotate?: number
  transparency?: number
  valign?: 'top' | 'middle' | 'bottom'
}

export interface BrowserBullet {
  indent?: number
  type?: 'bullet' | 'number'
  numberStartAt?: number
  numberType?: string
}

export interface BrowserTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fontFace?: string
  underline?: boolean | { style: string }
  bullet?: boolean | BrowserBullet
  breakLine?: boolean
  subscript?: boolean
  superscript?: boolean
  hyperlink?: string
  transparency?: number
}

export interface BrowserShadow {
  type: 'outer' | 'inner' | 'none'
  opacity?: number
  blur?: number
  angle?: number
  offset?: number
  color?: string
  rotateWithShape?: boolean
}

export interface BrowserBorder {
  color?: string
  width?: number
  type?: string
}

export interface BrowserPptxElement {
  type: 'text' | 'image' | 'shape' | 'list' | 'line' | 'table'
  x: number
  y: number
  w: number
  h: number
  text?: string
  textRuns?: BrowserTextRun[]
  src?: string
  alt?: string
  fill?: { color?: string; transparency?: number }
  border?: BrowserBorder
  shape?: string
  rectRadius?: number
  shadow?: BrowserShadow
  rotation?: number
  items?: BrowserTextRun[]
  rows?: { cells: { text: string; bold?: boolean; fill?: { color?: string } }[] }[]
  style?: BrowserTextStyle
}

export interface BrowserSlideDimensions {
  width: number
  height: number
}

export interface BrowserSlideData {
  background: BrowserBackground
  elements: BrowserPptxElement[]
  dimensions: BrowserSlideDimensions
  errors: string[]
}

export interface BrowserExtractionResult {
  slides: BrowserSlideData[]
  bodyDimensions: { width: number; height: number }
  errors: string[]
}

export type McpExecutor = (script: string) => Promise<string>

export function buildViewportProbeScript(): string {
  return `(function() {
  var body = document.body;
  var style = window.getComputedStyle(body);
  return {
    width: parseFloat(style.width),
    height: parseFloat(style.height),
    scrollWidth: body.scrollWidth,
    scrollHeight: body.scrollHeight
  };
})();`
}

export function buildExtractionScript(slideSeparator: SlideSeparator): string {
  const separatorLogic = buildSeparatorLogic(slideSeparator)
  return `(function() {
  ${HELPER_FUNCTIONS}
  ${separatorLogic}
  var result = extractAllSlides();
  return result;
})();`
}

function buildSeparatorLogic(separator: SlideSeparator): string {
  switch (separator) {
    case 'section':
      return `function getSlideSections() {
  var sections = document.querySelectorAll('section');
  if (sections.length > 0) {
    return Array.from(sections);
  }
  return [document.body];
}`
    case 'hr':
      return `function getSlideSections() {
  var hrs = document.querySelectorAll('hr');
  if (hrs.length > 0) {
    var sections = [];
    var current = [];
    var body = document.body;
    for (var i = 0; i < body.children.length; i++) {
      var child = body.children[i];
      if (child.tagName === 'HR') {
        if (current.length > 0) {
          sections.push(current);
        }
        current = [];
      } else {
        current.push(child);
      }
    }
    if (current.length > 0) {
      sections.push(current);
    }
    return sections.map(function(elements) {
      var div = document.createElement('div');
      elements.forEach(function(el) { div.appendChild(el.cloneNode(true)); });
      return div;
    });
  }
  return [document.body];
}`
    case 'h1':
      return `function getSlideSections() {
  var h1s = document.querySelectorAll('h1');
  if (h1s.length > 0) {
    var sections = [];
    var currentElements = [];
    var body = document.body;
    for (var i = 0; i < body.children.length; i++) {
      var child = body.children[i];
      if (child.tagName === 'H1') {
        if (currentElements.length > 0) {
          sections.push(currentElements);
        }
        currentElements = [child];
      } else {
        currentElements.push(child);
      }
    }
    if (currentElements.length > 0) {
      sections.push(currentElements);
    }
    return sections.map(function(elements) {
      var div = document.createElement('div');
      elements.forEach(function(el) { div.appendChild(el.cloneNode(true)); });
      return div;
    });
  }
  return [document.body];
}`
    case 'auto':
      return `function getSlideSections() {
  var sections = document.querySelectorAll('section');
  if (sections.length > 0) {
    return Array.from(sections);
  }
  var hrs = document.querySelectorAll('hr');
  if (hrs.length > 0) {
    var slideSections = [];
    var current = [];
    var body = document.body;
    for (var i = 0; i < body.children.length; i++) {
      var child = body.children[i];
      if (child.tagName === 'HR') {
        if (current.length > 0) { slideSections.push(current); }
        current = [];
      } else {
        current.push(child);
      }
    }
    if (current.length > 0) { slideSections.push(current); }
    if (slideSections.length > 1) {
      return slideSections.map(function(elements) {
        var div = document.createElement('div');
        elements.forEach(function(el) { div.appendChild(el.cloneNode(true)); });
        return div;
      });
    }
  }
  var h1s = document.querySelectorAll('h1');
  if (h1s.length > 1) {
    var h1Sections = [];
    var currentElements = [];
    var body = document.body;
    for (var i = 0; i < body.children.length; i++) {
      var child = body.children[i];
      if (child.tagName === 'H1') {
        if (currentElements.length > 0) { h1Sections.push(currentElements); }
        currentElements = [child];
      } else {
        currentElements.push(child);
      }
    }
    if (currentElements.length > 0) { h1Sections.push(currentElements); }
    return h1Sections.map(function(elements) {
      var div = document.createElement('div');
      elements.forEach(function(el) { div.appendChild(el.cloneNode(true)); });
      return div;
    });
  }
  return [document.body];
}`
  }
}

const HELPER_FUNCTIONS = `
var PT_PER_PX = 0.75;
var PX_PER_IN = 96;
var SINGLE_WEIGHT_FONTS = ['impact'];

function pxToInch(px) { return px / PX_PER_IN; }
function pxToPoints(pxStr) { return parseFloat(pxStr) * PT_PER_PX; }
function rgbToHex(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return undefined;
  if (rgb.startsWith('#')) {
    if (rgb.length === 4) {
      return rgb[1]+rgb[1]+rgb[2]+rgb[2]+rgb[3]+rgb[3];
    }
    return rgb.replace('#','');
  }
  var match = rgb.match(/rgba?\\(([^)]+)\\)/);
  if (!match) return undefined;
  var parts = match[1].split(',').map(function(s){return parseFloat(s.trim());});
  if (parts.length < 3) return undefined;
  return ((1<<24)+(Math.round(parts[0])<<16)+(Math.round(parts[1])<<8)+Math.round(parts[2])).toString(16).slice(1);
}
function rgbToHexOrDefault(rgb, defaultHex) {
  var hex = rgbToHex(rgb);
  return hex || defaultHex || 'FFFFFF';
}
function extractAlpha(rgb) {
  if (!rgb) return undefined;
  var match = rgb.match(/rgba\\(([^)]+)\\)/);
  if (!match) return undefined;
  var parts = match[1].split(',').map(function(s){return parseFloat(s.trim());});
  if (parts.length < 4) return undefined;
  return Math.round((1 - parts[3]) * 100);
}
function shouldSkipBold(fontFamily) {
  if (!fontFamily) return false;
  var normalized = fontFamily.toLowerCase().replace(/['"]/g, '').split(',')[0].trim();
  return SINGLE_WEIGHT_FONTS.indexOf(normalized) >= 0;
}
function applyTextTransform(text, textTransform) {
  if (textTransform === 'uppercase') return text.toUpperCase();
  if (textTransform === 'lowercase') return text.toLowerCase();
  if (textTransform === 'capitalize') {
    return text.replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
  }
  return text;
}
function getRotation(transform, writingMode) {
  var angle = 0;
  if (writingMode === 'vertical-rl') {
    angle = 90;
  } else if (writingMode === 'vertical-lr') {
    angle = 270;
  }
  if (transform && transform !== 'none') {
    var rotateMatch = transform.match(/rotate\\((-?\\d+(?:\\.\\d+)?)deg\\)/);
    if (rotateMatch) {
      angle += parseFloat(rotateMatch[1]);
    } else {
      var matrixMatch = transform.match(/matrix\\(([^)]+)\\)/);
      if (matrixMatch) {
        var values = matrixMatch[1].split(',').map(parseFloat);
        var matrixAngle = Math.atan2(values[1], values[0]) * (180 / Math.PI);
        angle += Math.round(matrixAngle);
      }
    }
  }
  angle = angle % 360;
  if (angle < 0) angle += 360;
  return angle === 0 ? null : angle;
}
function getPositionAndSize(el, rect, rotation) {
  if (rotation === null) {
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  }
  var isVertical = rotation === 90 || rotation === 270;
  if (isVertical) {
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    return {
      x: centerX - rect.height / 2,
      y: centerY - rect.width / 2,
      w: rect.height,
      h: rect.width
    };
  }
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  return {
    x: cx - el.offsetWidth / 2,
    y: cy - el.offsetHeight / 2,
    w: el.offsetWidth,
    h: el.offsetHeight
  };
}
function parseBoxShadow(boxShadow) {
  if (!boxShadow || boxShadow === 'none') return null;
  if (boxShadow.match(/inset/)) return null;
  var colorMatch = boxShadow.match(/rgba?\\([^)]+\\)/);
  var parts = boxShadow.match(/([-\\d.]+)(px|pt)/g);
  if (!parts || parts.length < 2) return null;
  var offsetX = parseFloat(parts[0]);
  var offsetY = parseFloat(parts[1]);
  var blur = parts.length > 2 ? parseFloat(parts[2]) : 0;
  var angle = 0;
  if (offsetX !== 0 || offsetY !== 0) {
    angle = Math.atan2(offsetY, offsetX) * (180 / Math.PI);
    if (angle < 0) angle += 360;
  }
  var offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY) * PT_PER_PX;
  var opacity = 0.5;
  if (colorMatch) {
    var opacityMatch = colorMatch[0].match(/[\\d.]+\\)$/);
    if (opacityMatch) {
      opacity = parseFloat(opacityMatch[0].replace(')', ''));
    }
  }
  return {
    type: 'outer',
    angle: Math.round(angle),
    blur: blur * PT_PER_PX,
    color: colorMatch ? rgbToHex(colorMatch[0]) : '000000',
    offset: offset,
    opacity: opacity,
    rotateWithShape: false
  };
}
function parseInlineFormatting(element, baseOptions, runs, textTransformFn) {
  if (!runs) runs = [];
  if (!textTransformFn) textTransformFn = function(x) { return x; };
  var prevNodeIsText = false;
  for (var i = 0; i < element.childNodes.length; i++) {
    var node = element.childNodes[i];
    var isText = node.nodeType === 3 || (node.nodeType === 1 && node.tagName === 'BR');
    if (isText) {
      var text = node.nodeType === 1 && node.tagName === 'BR' ? '\\n' : textTransformFn((node.textContent || '').replace(/\\s+/g, ' '));
      var prevRun = runs.length > 0 ? runs[runs.length - 1] : null;
      if (prevNodeIsText && prevRun) {
        prevRun.text += text;
      } else {
        runs.push({ text: text, options: Object.assign({}, baseOptions) });
      }
    } else if (node.nodeType === 1 && (node.textContent || '').trim()) {
      var tag = node.tagName.toLowerCase();
      var computed = window.getComputedStyle(node);
      var opts = Object.assign({}, baseOptions);
      if (tag === 'span' || tag === 'b' || tag === 'strong' || tag === 'i' || tag === 'em' || tag === 'u') {
        var isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;
        if (isBold && !shouldSkipBold(computed.fontFamily)) opts.bold = true;
        if (computed.fontStyle === 'italic') opts.italic = true;
        if (computed.textDecoration && computed.textDecoration.indexOf('underline') >= 0) opts.underline = true;
        if (computed.color && computed.color !== 'rgb(0, 0, 0)') {
          opts.color = rgbToHex(computed.color);
          var t = extractAlpha(computed.color);
          if (t !== undefined) opts.transparency = t;
        }
        if (computed.fontSize) opts.fontSize = pxToPoints(computed.fontSize);
        if (computed.textTransform && computed.textTransform !== 'none') {
          var tt = computed.textTransform;
          textTransformFn = function(txt) { return applyTextTransform(txt, tt); };
        }
        parseInlineFormatting(node, opts, runs, textTransformFn);
      } else if (tag === 'sub') {
        opts.subscript = true;
        parseInlineFormatting(node, opts, runs, textTransformFn);
      } else if (tag === 'sup') {
        opts.superscript = true;
        parseInlineFormatting(node, opts, runs, textTransformFn);
      } else if (tag === 'code') {
        opts.fontFace = 'Consolas';
        parseInlineFormatting(node, opts, runs, textTransformFn);
      } else if (tag === 'a') {
        var href = node.getAttribute('href');
        if (href) opts.hyperlink = href;
        parseInlineFormatting(node, opts, runs, textTransformFn);
      }
    }
    prevNodeIsText = isText;
  }
  if (runs.length > 0) {
    runs[0].text = runs[0].text.replace(/^\\s+/, '');
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\\s+$/, '');
  }
  return runs.filter(function(r) { return r.text.length > 0; });
}
function extractAllSlides() {
  var errors = [];
  var sections = getSlideSections();
  var bodyRect = document.body.getBoundingClientRect();
  var bodyStyle = window.getComputedStyle(document.body);
  var bodyBg = rgbToHexOrDefault(bodyStyle.backgroundColor, 'FFFFFF');
  var bodyBgAlpha = extractAlpha(bodyStyle.backgroundColor);
  var bodyBgImage = bodyStyle.backgroundImage;
  var slides = [];
  for (var si = 0; si < sections.length; si++) {
    var section = sections[si];
    var sectionRect = section.getBoundingClientRect();
    var sectionStyle = window.getComputedStyle(section);
    var sectionBg = rgbToHex(sectionStyle.backgroundColor);
    var sectionBgAlpha = extractAlpha(sectionStyle.backgroundColor);
    var sectionHasBg = sectionBg && (sectionBgAlpha === undefined || sectionBgAlpha < 100);
    var bodyHasBg = bodyBg && (bodyBgAlpha === undefined || bodyBgAlpha < 100);
    var slideBg;
    if (sectionHasBg && sectionBg !== bodyBg) {
      slideBg = { type: 'color', value: sectionBg };
    } else if (bodyHasBg) {
      slideBg = { type: 'color', value: bodyBg };
    } else {
      slideBg = { type: 'color', value: 'FFFFFF' };
    }
    if (bodyBgImage && bodyBgImage !== 'none') {
      var urlMatch = bodyBgImage.match(/url\\(["']?([^"')]+)["']?\\)/);
      if (urlMatch) slideBg = { type: 'image', path: urlMatch[1] };
    }
    var elements = [];
    var processed = new Set();
    var textTags = ['P','H1','H2','H3','H4','H5','H6','UL','OL','LI'];
    var allEls = section.querySelectorAll('*');
    for (var j = 0; j < allEls.length; j++) {
      var el = allEls[j];
      if (processed.has(el)) continue;
      try {
        var data = extractElement(el, sectionRect, processed, textTags, errors);
        if (data) {
          if (Array.isArray(data)) {
            for (var k = 0; k < data.length; k++) elements.push(data[k]);
          } else {
            elements.push(data);
          }
        }
      } catch(e) {
        errors.push('元素提取错误: ' + (el.tagName || 'unknown') + ': ' + e.message);
      }
    }
    slides.push({
      background: slideBg,
      elements: elements,
      dimensions: { width: pxToInch(sectionRect.width), height: pxToInch(sectionRect.height) },
      errors: []
    });
  }
  return { slides: slides, bodyDimensions: { width: pxToInch(bodyRect.width), height: pxToInch(bodyRect.height) }, errors: errors };
}
function extractElement(el, sectionRect, processed, textTags, errors) {
  var tag = el.tagName.toUpperCase();
  var computed = window.getComputedStyle(el);
  if (textTags.indexOf(tag) >= 0 && tag !== 'UL' && tag !== 'OL' && tag !== 'LI') {
    var hasBg = computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'transparent';
    var hasBdr = (parseFloat(computed.borderTopWidth) > 0 || parseFloat(computed.borderRightWidth) > 0 || parseFloat(computed.borderBottomWidth) > 0 || parseFloat(computed.borderLeftWidth) > 0);
    var hasShd = computed.boxShadow && computed.boxShadow !== 'none';
    if (hasBg || hasBdr || hasShd) {
      errors.push('Text element <' + tag.toLowerCase() + '> has ' + (hasBg ? 'background' : hasBdr ? 'border' : 'shadow') + '. Only supported on <div> elements, not text elements.');
      processed.add(el);
      return null;
    }
  }
  if (tag === 'IMG') {
    var rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      processed.add(el);
      return {
        type: 'image',
        x: pxToInch(rect.left - sectionRect.left),
        y: pxToInch(rect.top - sectionRect.top),
        w: pxToInch(rect.width),
        h: pxToInch(rect.height),
        src: el.src || '',
        alt: el.alt || ''
      };
    }
    return null;
  }
  if (tag === 'UL' || tag === 'OL') {
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { processed.add(el); return null; }
    var liElements = el.querySelectorAll('li');
    var ulComputed = window.getComputedStyle(el);
    var ulPaddingLeftPt = pxToPoints(ulComputed.paddingLeft);
    var marginLeft = ulPaddingLeftPt * 0.5;
    var textIndent = ulPaddingLeftPt * 0.5;
    var allRuns = [];
    var isOrdered = tag === 'OL';
    var numberType = ulComputed.listStyleType || 'decimal';
    for (var idx = 0; idx < liElements.length; idx++) {
      var li = liElements[idx];
      if (processed.has(li)) continue;
      var isLast = idx === liElements.length - 1;
      var liRuns = parseInlineFormatting(li, { breakLine: false }, [], function(x) { return x; });
      if (liRuns.length > 0) {
        liRuns[0].text = liRuns[0].text.replace(/^[\\u2022\\-\\*\\u25AA\\u25B8\\u25CB\\u25CF\\u25C6\\u25C7\\u25A0\\u25A1]\\s*/, '');
        liRuns[0].options.bullet = { indent: textIndent };
      }
      if (liRuns.length > 0 && !isLast) {
        liRuns[liRuns.length - 1].options.breakLine = true;
      }
      for (var ri = 0; ri < liRuns.length; ri++) {
        allRuns.push({ text: liRuns[ri].text, options: liRuns[ri].options });
      }
      processed.add(li);
    }
    var firstLi = liElements.length > 0 ? liElements[0] : el;
    var firstComputed = window.getComputedStyle(firstLi);
    var listStyle = {
      fontSize: pxToPoints(firstComputed.fontSize),
      fontFace: firstComputed.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
      color: rgbToHex(firstComputed.color),
      align: firstComputed.textAlign === 'start' ? 'left' : firstComputed.textAlign,
      valign: 'top',
      lineSpacing: firstComputed.lineHeight && firstComputed.lineHeight !== 'normal' ? pxToPoints(firstComputed.lineHeight) : undefined,
      paraSpaceBefore: 0,
      paraSpaceAfter: pxToPoints(firstComputed.marginBottom),
      margin: [marginLeft, 0, 0, 0]
    };
    var colorTransparency = extractAlpha(firstComputed.color);
    if (colorTransparency !== undefined) listStyle.transparency = colorTransparency;
    processed.add(el);
    return {
      type: 'list',
      x: pxToInch(rect.left - sectionRect.left),
      y: pxToInch(rect.top - sectionRect.top),
      w: pxToInch(rect.width),
      h: pxToInch(rect.height),
      items: allRuns,
      style: listStyle
    };
  }
  if (tag === 'TABLE') {
    var rect = el.getBoundingClientRect();
    var result = {
      type: 'table',
      x: pxToInch(rect.left - sectionRect.left),
      y: pxToInch(rect.top - sectionRect.top),
      w: pxToInch(rect.width),
      h: pxToInch(rect.height),
      rows: []
    };
    var trs = el.querySelectorAll('tr');
    for (var j = 0; j < trs.length; j++) {
      var row = [];
      var cells = trs[j].querySelectorAll('td, th');
      for (var k = 0; k < cells.length; k++) {
        var cell = cells[k];
        var isHeader = cell.tagName.toLowerCase() === 'th';
        var cellStyle = window.getComputedStyle(cell);
        var cellBg = rgbToHex(cellStyle.backgroundColor);
        var cellBgAlpha = extractAlpha(cellStyle.backgroundColor);
        var cellHasBg = cellBg && (cellBgAlpha === undefined || cellBgAlpha < 100);
        row.push({ text: cell.textContent || '', bold: isHeader, fill: cellHasBg ? { color: cellBg } : undefined });
      }
      if (row.length > 0) result.rows.push({ cells: row });
    }
    processed.add(el);
    return result;
  }
  if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'ASIDE' || tag === 'HEADER' || tag === 'FOOTER' || tag === 'NAV' || tag === 'MAIN') {
    var rect = el.getBoundingClientRect();
    var bg = rgbToHex(computed.backgroundColor);
    var alpha = extractAlpha(computed.backgroundColor);
    var hasBg = bg && (alpha === undefined || alpha < 100);
    var borderTop = parseFloat(computed.borderTopWidth);
    var borderRight = parseFloat(computed.borderRightWidth);
    var borderBottom = parseFloat(computed.borderBottomWidth);
    var borderLeft = parseFloat(computed.borderLeftWidth);
    var borders = [borderTop, borderRight, borderBottom, borderLeft];
    var hasAnyBorder = borders.some(function(b) { return b > 0; });
    var hasUniformBorder = hasAnyBorder && borders.every(function(b) { return b === borders[0]; });
    if (hasBg || hasAnyBorder) {
      var resultElements = [];
      if (hasBg || hasUniformBorder) {
        var shadow = parseBoxShadow(computed.boxShadow);
        var shapeResult = {
          type: 'shape',
          shape: 'rect',
          x: pxToInch(rect.left - sectionRect.left),
          y: pxToInch(rect.top - sectionRect.top),
          w: pxToInch(rect.width),
          h: pxToInch(rect.height)
        };
        if (hasBg) {
          shapeResult.fill = { color: bg };
          if (alpha !== undefined && alpha < 100) shapeResult.fill.transparency = alpha;
        }
        if (hasUniformBorder) {
          shapeResult.border = {
            color: rgbToHex(computed.borderTopColor) || rgbToHex(computed.borderColor),
            width: pxToPoints(computed.borderWidth || computed.borderTopWidth),
            type: computed.borderTopStyle
          };
        }
        var radiusVal = parseFloat(computed.borderRadius);
        if (radiusVal > 0) {
          if (computed.borderRadius.indexOf('%') >= 0) {
            shapeResult.rectRadius = radiusVal >= 50 ? pxToInch(Math.min(rect.width, rect.height) / 2) : pxToInch((radiusVal / 100) * Math.min(rect.width, rect.height));
          } else {
            shapeResult.rectRadius = pxToInch(radiusVal);
          }
        }
        if (shadow) shapeResult.shadow = shadow;
        resultElements.push(shapeResult);
      }
      if (hasAnyBorder && !hasUniformBorder) {
        var x = pxToInch(rect.left - sectionRect.left);
        var y = pxToInch(rect.top - sectionRect.top);
        var w = pxToInch(rect.width);
        var h = pxToInch(rect.height);
        if (borderTop > 0) {
          var wpt = pxToPoints(computed.borderTopWidth);
          resultElements.push({ type: 'line', x: x, y: y, w: w, h: 0, border: { color: rgbToHex(computed.borderTopColor), width: wpt, type: 'solid' } });
        }
        if (borderBottom > 0) {
          var wpt = pxToPoints(computed.borderBottomWidth);
          resultElements.push({ type: 'line', x: x, y: y + h, w: w, h: 0, border: { color: rgbToHex(computed.borderBottomColor), width: wpt, type: 'solid' } });
        }
        if (borderLeft > 0) {
          var wpt = pxToPoints(computed.borderLeftWidth);
          resultElements.push({ type: 'line', x: x, y: y, w: 0, h: h, border: { color: rgbToHex(computed.borderLeftColor), width: wpt, type: 'solid' } });
        }
        if (borderRight > 0) {
          var wpt = pxToPoints(computed.borderRightWidth);
          resultElements.push({ type: 'line', x: x + w, y: y, w: 0, h: h, border: { color: rgbToHex(computed.borderRightColor), width: wpt, type: 'solid' } });
        }
      }
      processed.add(el);
      return resultElements;
    }
    return null;
  }
  if (tag === 'HR') {
    processed.add(el);
    return {
      type: 'line',
      shape: 'line',
      x: pxToInch(el.getBoundingClientRect().left - sectionRect.left),
      y: pxToInch(el.getBoundingClientRect().top - sectionRect.top),
      w: pxToInch(el.getBoundingClientRect().width),
      h: 0.02,
      border: {
        color: rgbToHex(computed.borderTopColor),
        width: pxToPoints(computed.borderTopWidth),
        type: computed.borderTopStyle
      }
    };
  }
  if (!textTags.indexOf(tag) >= 0) return null;
  var rect = el.getBoundingClientRect();
  var text = (el.textContent || '').trim();
  if (rect.width === 0 || rect.height === 0 || !text) { processed.add(el); return null; }
  var rotation = getRotation(computed.transform, computed.writingMode);
  var pos = getPositionAndSize(el, rect, rotation);
  var baseStyle = {
    fontSize: pxToPoints(computed.fontSize),
    fontFace: computed.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
    color: rgbToHex(computed.color),
    align: computed.textAlign === 'start' ? 'left' : (computed.textAlign === 'center' || computed.textAlign === 'right' || computed.textAlign === 'justify' ? computed.textAlign : undefined),
    lineSpacing: computed.lineHeight && computed.lineHeight !== 'normal' ? pxToPoints(computed.lineHeight) : undefined,
    paraSpaceBefore: pxToPoints(computed.marginTop),
    paraSpaceAfter: pxToPoints(computed.marginBottom),
    margin: [
      pxToPoints(computed.paddingLeft),
      pxToPoints(computed.paddingRight),
      pxToPoints(computed.paddingBottom),
      pxToPoints(computed.paddingTop)
    ]
  };
  var colorTransparency = extractAlpha(computed.color);
  if (colorTransparency !== undefined) baseStyle.transparency = colorTransparency;
  if (rotation !== null) baseStyle.rotate = rotation;
  var hasFormatting = el.querySelector('b, i, u, strong, em, span, br');
  var result;
  if (hasFormatting) {
    var transformStr = computed.textTransform;
    var runs = parseInlineFormatting(el, {}, [], function(str) { return applyTextTransform(str, transformStr); });
    result = {
      type: 'text',
      x: pxToInch(pos.x - sectionRect.left),
      y: pxToInch(pos.y - sectionRect.top),
      w: pxToInch(pos.w),
      h: pxToInch(pos.h),
      textRuns: runs.map(function(r) {
        return {
          text: r.text,
          bold: r.options.bold,
          italic: r.options.italic,
          fontSize: r.options.fontSize,
          color: r.options.color,
          fontFace: r.options.fontFace,
          underline: r.options.underline ? { style: 'single' } : undefined,
          bullet: r.options.bullet,
          breakLine: r.options.breakLine,
          subscript: r.options.subscript,
          superscript: r.options.superscript,
          hyperlink: r.options.hyperlink,
          transparency: r.options.transparency
        };
      }),
      style: baseStyle
    };
  } else {
    var isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600;
    var transformedText = applyTextTransform(text, computed.textTransform);
    result = {
      type: 'text',
      x: pxToInch(pos.x - sectionRect.left),
      y: pxToInch(pos.y - sectionRect.top),
      w: pxToInch(pos.w),
      h: pxToInch(pos.h),
      text: transformedText,
      style: Object.assign({}, baseStyle, {
        bold: isBold && !shouldSkipBold(computed.fontFamily),
        italic: computed.fontStyle === 'italic',
        underline: computed.textDecoration && computed.textDecoration.indexOf('underline') >= 0
      })
    };
  }
  processed.add(el);
  return result;
}`

const PPTX_SLIDE_WIDTH = 13.33
const PPTX_SLIDE_HEIGHT = 7.5

export function mapBrowserSlideToPptxSlide(
  browserSlide: BrowserSlideData,
  worktree: string,
  baseDir: string,
  warnings: string[],
): PptxSlideContent {
  const elements: PptxInputElement[] = []

  const sx = browserSlide.dimensions.width > 0 ? PPTX_SLIDE_WIDTH / browserSlide.dimensions.width : 1
  const sy = browserSlide.dimensions.height > 0 ? PPTX_SLIDE_HEIGHT / browserSlide.dimensions.height : 1

  for (const el of browserSlide.elements) {
    const scaledX = el.x * sx
    const scaledY = el.y * sy
    const scaledW = el.w * sx
    const scaledH = el.h * sy
    switch (el.type) {
      case 'text': {
        const pptxEl: PptxInputElement = {
          type: 'text',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          h: scaledH,
        }
        if (el.textRuns && el.textRuns.length > 0) {
          pptxEl.textRuns = mapRuns(el.textRuns, sx, sy)
          if (el.style?.underline) propagateUnderlineToRuns(pptxEl.textRuns, el.style.underline)
        } else if (el.text) {
          pptxEl.text = el.text
        }
        if (el.style) {
          applyStyle(pptxEl, el.style, sx, sy)
        }
        elements.push(pptxEl)
        break
      }
      case 'image': {
        if (!el.src) continue
        if (el.src.startsWith('data:image/svg')) {
          warnings.push('PPTX 不支持 SVG 格式的 data URI，已跳过该图片。')
          continue
        }
        const pptxEl: PptxInputElement = {
          type: 'image',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          h: scaledH,
          altText: el.alt,
        }
        if (el.src.startsWith('data:')) {
          pptxEl.imageData = el.src.replace(/^data:image\/[a-z+]+;base64,/, '')
        } else {
          const imgPath = resolveBrowserImagePath(worktree, baseDir, el.src)
          if (imgPath) {
            pptxEl.imagePath = imgPath
          } else {
            warnings.push(`图片无法解析或不存在，已跳过：${el.src}`)
            continue
          }
        }
        elements.push(pptxEl)
        break
      }
      case 'shape': {
        const pptxEl: PptxInputElement = {
          type: 'shape',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          h: scaledH,
          shape: el.shape ?? 'rect',
        }
        if (el.rectRadius) pptxEl.rectRadius = el.rectRadius * sx
        if (el.fill) {
          pptxEl.fill = { type: 'solid', color: el.fill.color }
          if (el.fill.transparency !== undefined) pptxEl.fill.transparency = el.fill.transparency
        }
        if (el.border) {
          pptxEl.line = {
            type: 'solid',
            color: el.border.color,
            width: el.border.width ? el.border.width * Math.min(sx, sy) : undefined,
          }
          if (el.border.type) pptxEl.line.dashType = mapDashType(el.border.type)
        }
        if (el.shadow) {
          pptxEl.shadow = mapShadow(el.shadow)
        }
        elements.push(pptxEl)
        break
      }
      case 'list': {
        if (!el.items || el.items.length === 0) continue
        const pptxEl: PptxInputElement = {
          type: 'text',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          h: scaledH,
          textRuns: mapRuns(el.items, sx, sy),
          valign: 'top',
        }
        if (el.style) {
          applyStyle(pptxEl, el.style, sx, sy)
          if (el.style.underline) propagateUnderlineToRuns(pptxEl.textRuns!, el.style.underline)
          pptxEl.valign = el.style.valign ?? 'top'
        }
        elements.push(pptxEl)
        break
      }
      case 'line': {
        const pptxEl: PptxInputElement = {
          type: 'shape',
          shape: 'line',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          h: scaledH > 0 ? scaledH : 0.02,
        }
        if (el.border) {
          pptxEl.line = {
            type: 'solid',
            color: el.border.color,
            width: el.border.width ? el.border.width * Math.min(sx, sy) : undefined,
          }
          if (el.border.type) pptxEl.line.dashType = mapDashType(el.border.type)
        }
        elements.push(pptxEl)
        break
      }
      case 'table': {
        if (!el.rows || el.rows.length === 0) continue
        elements.push({
          type: 'table',
          x: scaledX,
          y: scaledY,
          w: scaledW,
          rows: el.rows.map(row =>
            row.cells.map(cell => ({
              text: cell.text,
              bold: cell.bold,
              fill: cell.fill ? { type: 'solid', color: cell.fill.color } : undefined,
            }))
          ),
        })
        break
      }
    }
  }

  const slide: PptxSlideContent = { elements }

  if (browserSlide.background.type === 'color' && browserSlide.background.value) {
    slide.background = { color: browserSlide.background.value }
  } else if (browserSlide.background.type === 'image' && browserSlide.background.path) {
    const imgPath = resolveBrowserImagePath(worktree, baseDir, browserSlide.background.path)
    if (imgPath) {
      slide.background = { path: imgPath }
    }
  }

  return slide
}

function mapRuns(runs: BrowserTextRun[], sx: number, sy: number): PptxTextRun[] {
  return runs.map(run => {
    const mapped: PptxTextRun = {
      text: run.text,
    }
    if (run.bold) mapped.bold = true
    if (run.italic) mapped.italic = true
    if (run.fontSize) mapped.fontSize = run.fontSize * Math.min(sx, sy)
    if (run.color) mapped.color = run.color
    if (run.fontFace) mapped.fontFace = run.fontFace
    if (run.underline) mapped.underline = run.underline === true ? { style: 'single' } : run.underline
    if (run.subscript) mapped.subscript = true
    if (run.superscript) mapped.superscript = true
    if (run.hyperlink) mapped.hyperlink = { url: run.hyperlink }
    if (run.transparency !== undefined) mapped.highlight = 'background'
    if (run.bullet) {
      if (typeof run.bullet === 'boolean') {
        mapped.bullet = run.bullet
      } else {
        mapped.bullet = {
          type: run.bullet.type ?? 'bullet',
          indent: run.bullet.indent,
        }
        if (run.bullet.numberStartAt) mapped.bullet.numberStartAt = run.bullet.numberStartAt
        if (run.bullet.numberType) mapped.bullet.numberType = run.bullet.numberType
      }
    }
    if (run.breakLine) mapped.breakLine = true
    return mapped
  })
}

function propagateUnderlineToRuns(runs: PptxTextRun[], underline: boolean | { style: string }): void {
  const mappedUnderline = underline === true ? { style: 'single' } : underline === false ? undefined : underline
  if (!mappedUnderline) return
  for (const run of runs) {
    if (!run.underline) run.underline = mappedUnderline
  }
}

function applyStyle(pptxEl: PptxInputElement, style: BrowserTextStyle, sx: number, sy: number): void {
  if (style.fontSize) pptxEl.fontSize = style.fontSize * Math.min(sx, sy)
  if (style.color) pptxEl.color = style.color
  if (style.bold) pptxEl.bold = true
  if (style.italic) pptxEl.italic = true
  if (style.fontFace) pptxEl.fontFace = style.fontFace
  if (style.align) pptxEl.align = style.align

  if (style.lineSpacing) pptxEl.lineSpacing = style.lineSpacing * Math.min(sx, sy)
  if (style.paraSpaceBefore) pptxEl.paraSpaceBefore = style.paraSpaceBefore * Math.min(sx, sy)
  if (style.paraSpaceAfter) pptxEl.paraSpaceAfter = style.paraSpaceAfter * Math.min(sx, sy)
  if (style.margin) {
    if (typeof style.margin === 'number') {
      pptxEl.margin = style.margin * Math.min(sx, sy)
    } else {
      pptxEl.margin = style.margin.map(v => v * Math.min(sx, sy)) as [number, number, number, number]
    }
  }
  if (style.rotate) pptxEl.rotate = style.rotate
  if (style.transparency !== undefined) pptxEl.fill = { type: 'solid', color: pptxEl.color ?? '000000', transparency: style.transparency }
  if (style.valign) pptxEl.valign = style.valign
}

function mapShadow(shadow: BrowserShadow): PptxInputElement['shadow'] {
  return {
    type: shadow.type,
    opacity: shadow.opacity,
    blur: shadow.blur,
    angle: shadow.angle,
    offset: shadow.offset,
    color: shadow.color,
    rotateWithShape: shadow.rotateWithShape,
  }
}

function mapDashType(cssType: string | undefined): 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot' | undefined {
  if (!cssType) return undefined
  switch (cssType) {
    case 'dotted': return 'sysDot'
    case 'dashed': return 'dash'
    case 'double': return 'solid'
    case 'solid': return 'solid'
    default: return 'solid'
  }
}

function resolveBrowserImagePath(worktree: string, baseDir: string, src: string): string | undefined {
  if (!src || src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
    return undefined
  }
  const { existsSync } = require('node:fs')
  const { isAbsolute, resolve } = require('node:path')
  const clean = src.split('?')[0]?.split('#')[0] ?? ''
  if (!clean) return undefined
  const resolved = isAbsolute(clean) ? resolve(worktree, clean.replace(/^[/\\]+/, '')) : resolve(baseDir, clean)
  return existsSync(resolved) ? resolved : undefined
}
