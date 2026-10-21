#!/usr/bin/env node
/**
 * PPTX 视觉验证器（解析 `officecli view <file> html` 的输出）
 *
 * 逐页检查并报告：
 *   1. 文本重叠      两个文本 shape 的交集面积 > 较小面积的 10%
 *   2. 文本溢出      按换行估算行数，比对 shape 高度；单个不可断词超宽也算
 *   3. 文字块过长    单个 shape 的段落数 > 3
 *   4. 文字过密      单页内容行数 > 预算（默认 10，不含页眉/页脚框架）
 *   5. 纯文字页      整页没有任何"纯装饰形状"（无文字的形状）
 *   6. 越出页边距    内容超出左右 50pt / 上下边界
 *   7. 底部留白过大  内容底边距页脚太远（版面偏上）
 *   8. 字号过小      文本字号 < 9pt
 *   9. 文字占比过高  文本形状面积 / 内容区面积 > 40%（该用图形承载）
 *  10. 页面过重      浅底页面的深色填充面积 > 30%（大面积深色块压得慌）
 *  11. 节奏单调      连续多页使用同一条通栏色带（每页都"黑底白字"）
 *
 * 用法：
 *   node scripts/validate-deck.mjs --html ae/pptx/deck.html
 *   node scripts/validate-deck.mjs --html ae/pptx/deck.html --max-lines 12 --json
 *
 * 退出码：0 通过 / 1 发现问题
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { resolveOwningSkillName, skillTempDir } from './lib/ae-paths.mjs'

const SCRIPT_URL = import.meta.url
/** 幻灯片面积（960 × 540） */
const SLIDE_AREA = 960 * 540

/* ------------------------------------------------------------------ *
 * 参数
 * ------------------------------------------------------------------ */
function parseArgs(argv) {
  const args = {
    maxLines: 10,
    minFont: 9,
    minGap: 90,
    margin: 50,
    textAreaRatio: 0.4,
    maxDarkRatio: 0.35,
    maxSameBand: 3,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
    i += 1
  }
  return args
}

/* ------------------------------------------------------------------ *
 * HTML 解析
 * ------------------------------------------------------------------ */
const CJK = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/

function decodeEntities(text) {
  return String(text ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

/** 估算一行文本宽度（pt）：CJK = 字号，ASCII ≈ 0.55 字号，空格 ≈ 0.27 字号 */
function estimateWidth(line, fontSize) {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width += fontSize * 0.27
    else if (CJK.test(ch)) width += fontSize
    else width += fontSize * 0.55
  }
  return width
}

/**
 * 最长"不可断片段"宽度（pt）。
 * 中日韩字符可在任意字间断行 → 单字即一个片段；
 * 连续的 ASCII 单词（字母数字串）才是真正不可断的片段。
 */
function longestUnbreakable(line, fontSize) {
  let longest = fontSize
  let run = ''
  const flush = () => {
    if (run) {
      longest = Math.max(longest, estimateWidth(run, fontSize))
      run = ''
    }
  }
  for (const ch of line) {
    if (ch === ' ' || CJK.test(ch)) {
      flush()
      continue
    }
    run += ch
  }
  flush()
  return longest
}

/** 相对亮度（0~255），用于判断深/浅 */
function luminance(hex) {
  const value = String(hex ?? '').replace('#', '')
  if (value.length < 6) return 255
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 解析一页里的所有元素 */
function parsePage(page) {
  const shapes = []
  const background = (page.match(/class="slide"[^>]*background:(#[0-9A-Fa-f]{6})/) || [])[1] || '#FFFFFF'
  const re = /<div\b([^>]*data-path="[^"]+"[^>]*)>([\s\S]*?)(?=<div\b[^>]*data-path=|$)/g
  let match
  while ((match = re.exec(page)) !== null) {
    const [, attrs, inner] = match
    const style = (attrs.match(/style="([^"]*)"/) || [])[1] || ''
    const path = (attrs.match(/data-path="([^"]+)"/) || [])[1] || ''
    const num = (name) => {
      const found = style.match(new RegExp(name + '\\s*:\\s*(-?[\\d.]+)pt'))
      return found ? Number(found[1]) : null
    }
    const left = num('left')
    const top = num('top')
    const width = num('width')
    const height = num('height')
    if (left === null || top === null || width === null || height === null) continue

    const paras = [...inner.matchAll(/<div class="para"[^>]*>([\s\S]*?)<\/div>/g)]
      .map((m) => decodeEntities(m[1]))
      .filter((line) => line !== '')

    const sizes = [...inner.matchAll(/font-size:([\d.]+)pt/g)].map((m) => Number(m[1]))
    const lineHeights = [...inner.matchAll(/line-height:([\d.]+)/g)].map((m) => Number(m[1]))
    const fillMatch = style.match(/background:(#[0-9A-Fa-f]{6})/)
    const isPicture = attrs.includes('class="picture"') || /<img\b/.test(inner)

    shapes.push({
      path,
      left,
      top,
      width,
      height,
      paras,
      fontSize: sizes.length ? Math.max(...sizes) : null,
      lineHeight: lineHeights.length ? Math.max(...lineHeights) : 1.4,
      hasFill: Boolean(fillMatch),
      fill: fillMatch ? fillMatch[1].slice(1) : null,
      isPicture,
    })
  }
  return { shapes, background }
}

/* ------------------------------------------------------------------ *
 * 检查
 * ------------------------------------------------------------------ */
function validateSlide(shapes, options) {
  const problems = []
  const textShapes = shapes.filter((s) => s.paras.length > 0)
  const lineCount = textShapes.reduce((sum, s) => sum + s.paras.length, 0)
  const decorative = shapes.filter((s) => s.paras.length === 0)

  // 1) 文本重叠
  for (let i = 0; i < textShapes.length; i += 1) {
    for (let j = i + 1; j < textShapes.length; j += 1) {
      const a = textShapes[i]
      const b = textShapes[j]
      const overlapW = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)
      const overlapH = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top)
      if (overlapW <= 0 || overlapH <= 0) continue
      const area = overlapW * overlapH
      const minArea = Math.min(a.width * a.height, b.width * b.height)
      if (minArea > 0 && area / minArea > 0.1) {
        problems.push({
          type: '重叠',
          detail: `${a.path} × ${b.path}（交集 ${Math.round(area)}pt²，阈值 ${Math.round(minArea * 0.1)}pt²）`,
        })
      }
    }
  }

  // 2) 文本溢出（按换行估算行数 → 需要的块高）
  for (const shape of textShapes) {
    const size = shape.fontSize || 12
    for (const line of shape.paras) {
      const textWidth = estimateWidth(line, size)
      const tokenWidth = longestUnbreakable(line, size)
      if (tokenWidth > shape.width + 1) {
        problems.push({
          type: '溢出',
          detail: `${shape.path}「${line.slice(0, 18)}」存在放不下的不可断片段（${Math.round(tokenWidth)}pt > ${Math.round(shape.width)}pt）`,
        })
        continue
      }
      const lines = Math.max(1, Math.ceil(textWidth / Math.max(shape.width, 1)))
      const needed = lines * size * shape.lineHeight
      if (needed > shape.height + 1) {
        problems.push({
          type: '溢出',
          detail: `${shape.path}「${line.slice(0, 18)}」换行后需 ${lines} 行 ≈ ${Math.round(needed)}pt > 高 ${Math.round(shape.height)}pt`,
        })
      }
    }
  }

  // 3) 文字块过长
  for (const shape of textShapes) {
    if (shape.paras.length > 3) {
      problems.push({
        type: '文字块过长',
        detail: `${shape.path} 共 ${shape.paras.length} 段（上限 3）`,
      })
    }
  }

  // 4) 文字过密
  if (lineCount > options.maxLines) {
    problems.push({
      type: '文字过密',
      detail: `本页 ${lineCount} 行内容（上限 ${options.maxLines}）——把能画成图的信息改成图`,
    })
  }

  // 5) 纯文字页
  if (decorative.length === 0) {
    problems.push({
      type: '纯文字页',
      detail: '整页没有任何纯装饰形状（色块/图表/配图/大数字块）',
    })
  }

  // 6) 越出页边距（只查内容区：页眉条 0~60、页脚条 505~540 是通栏设计，不计入）
  const margin = options.margin
  for (const shape of shapes) {
    if (shape.top < 60 || shape.top + shape.height > 505) continue
    if (shape.left < margin - 1 || shape.left + shape.width > 960 - margin + 1) {
      problems.push({
        type: '越界',
        detail: `${shape.path} 横向 ${Math.round(shape.left)}~${Math.round(shape.left + shape.width)}pt 超出 ${margin}pt 页边距`,
      })
    }
  }

  // 7) 底部留白过大
  const body = shapes.filter((s) => s.top >= 60 && s.top + s.height <= 505)
  if (body.length) {
    const bottom = Math.max(...body.map((s) => s.top + s.height))
    if (505 - bottom > options.minGap) {
      problems.push({
        type: '版面偏上',
        detail: `内容底边 ${Math.round(bottom)}pt，距页脚 ${Math.round(505 - bottom)}pt（上限 ${options.minGap}pt）`,
      })
    }
  }

  // 8) 字号过小
  for (const shape of textShapes) {
    if (shape.fontSize && shape.fontSize < options.minFont) {
      problems.push({
        type: '字号过小',
        detail: `${shape.path} 字号 ${shape.fontSize}pt（下限 ${options.minFont}pt）`,
      })
    }
  }

  // 9) 文字占比过高
  if (body.length) {
    const area = body.reduce((sum, s) => sum + s.width * s.height, 0)
    const textArea = textShapes.reduce((sum, s) => sum + s.width * s.height, 0)
    const ratio = area > 0 ? textArea / area : 0
    if (ratio > options.textAreaRatio) {
      problems.push({
        type: '文字占比过高',
        detail: `文本形状面积占内容区 ${Math.round(ratio * 100)}%（上限 ${Math.round(options.textAreaRatio * 100)}%）`,
      })
    }
  }

  // 10) 页面过重：浅底正文页的深色填充面积过大
  //     （深底页——封面/章节页/结束页——是刻意的重色，不计入本项）
  const pageBackground = options.background ?? '#FFFFFF'
  const isLightPage = luminance(pageBackground) >= 120
  const darkArea = shapes
    .filter((s) => s.fill && luminance(s.fill) < 120)
    .reduce((sum, s) => sum + s.width * s.height, 0)
  const darkRatio = darkArea / SLIDE_AREA
  if (isLightPage && darkRatio > options.maxDarkRatio) {
    problems.push({
      type: '页面过重',
      detail: `深色块占版面 ${Math.round(darkRatio * 100)}%（上限 ${Math.round(options.maxDarkRatio * 100)}%）——深色留给章节页/重点页，正文页别整片压深`,
    })
  }

  // 通栏色带（页眉/页脚）颜色，用于节奏检查
  const bands = shapes
    .filter((s) => s.fill && s.width >= 950 && (s.top < 60 || s.top + s.height > 505))
    .map((s) => s.fill.toUpperCase())

  return {
    problems,
    lineCount,
    decorative: decorative.length,
    ratio: body.length ? (() => {
      const area = body.reduce((sum, s) => sum + s.width * s.height, 0)
      const textArea = textShapes.reduce((sum, s) => sum + s.width * s.height, 0)
      return area > 0 ? textArea / area : 0
    })() : 0,
    darkRatio,
    bands,
    background: pageBackground,
    ...summarize(body, textShapes),
  }
}

function summarize(body, textShapes) {
  const sizes = textShapes.map((s) => s.fontSize).filter(Boolean)
  return {
    elements: body.length,
    minFont: sizes.length ? Math.min(...sizes) : null,
    bottom: body.length ? Math.max(...body.map((s) => s.top + s.height)) : null,
  }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */
function main() {
  const args = parseArgs(process.argv.slice(2))
  const htmlPath = resolve(String(args.html ?? 'ae/pptx/deck.html'))
  let html
  try {
    html = readFileSync(htmlPath, 'utf8')
  } catch (error) {
    process.stderr.write('读取 HTML 失败：' + error.message + '\n')
    process.stderr.write('请先执行：officecli view <file> html -o ' + htmlPath + '\n')
    process.exitCode = 1
    return
  }

  const pages = html.split(/<div class="slide-container"/i).slice(1)
  if (pages.length === 0) {
    process.stderr.write('HTML 里没有识别到幻灯片容器（需要 officecli view <file> html 的输出）\n')
    process.exitCode = 1
    return
  }

  const results = pages.map((page, index) => {
    const { shapes, background } = parsePage(page)
    const result = validateSlide(shapes, { ...args, background })
    return { page: index + 1, ...result }
  })

  // 11) 节奏单调：连续多页使用同一条通栏色带
  const rhythmProblems = []
  let runStart = 0
  for (let i = 1; i <= results.length; i += 1) {
    const current = i < results.length ? results[i].bands[0] : null
    const previous = results[runStart].bands[0]
    if (i === results.length || current !== previous) {
      const length = i - runStart
      if (length > args.maxSameBand && previous) {
        rhythmProblems.push({
          page: runStart + 1,
          type: '节奏单调',
          detail: `第 ${runStart + 1}~${i} 页连续 ${length} 页使用同一条色带 #${previous}——每页都"黑底白字"会翻页疲劳，建议浅色页眉或交替深浅页`,
        })
      }
      runStart = i
    }
  }
  for (const item of rhythmProblems) {
    results[item.page - 1].problems.push({ type: item.type, detail: item.detail })
  }

  const allProblems = results.flatMap((r) => r.problems.map((p) => ({ page: r.page, ...p })))

  if (args.json) {
    process.stdout.write(JSON.stringify({
      file: htmlPath,
      pages: results.map((r) => ({
        page: r.page,
        lines: r.lineCount,
        decorative: r.decorative,
        minFont: r.minFont,
        textAreaRatio: Number(r.ratio.toFixed(3)),
        darkAreaRatio: Number(r.darkRatio.toFixed(3)),
        background: r.background,
        bands: r.bands,
        bottom: r.bottom,
        problems: r.problems,
      })),
      problemCount: allProblems.length,
    }, null, 2) + '\n')
  } else {
    process.stdout.write('页 | 内容行 | 装饰形状 | 最小字号 | 文字占比 | 深色占比 | 底色     | 内容底边 | 结论\n')
    process.stdout.write('---+--------+----------+----------+----------+----------+-----------+----------+------\n')
    for (const r of results) {
      const verdict = r.problems.length === 0 ? 'OK' : `${r.problems.length} 项待修`
      process.stdout.write(
        `${String(r.page).padStart(2)} | ${String(r.lineCount).padStart(6)} | ${String(r.decorative).padStart(8)} | ` +
        `${String(r.minFont ?? '-').padStart(8)}pt | ${String(Math.round(r.ratio * 100)).padStart(7)}% | ` +
        `${String(Math.round(r.darkRatio * 100)).padStart(7)}% | ${r.background.padEnd(9)} | ` +
        `${String(r.bottom === null ? '-' : Math.round(r.bottom)).padStart(8)}pt | ${verdict}\n`,
      )
    }
    process.stdout.write('\n')
    if (allProblems.length === 0) {
      process.stdout.write('✅ 视觉验证通过：无重叠、无溢出、无纯文字页、版面无越界\n')
    } else {
      process.stdout.write(`❌ 发现 ${allProblems.length} 个问题：\n`)
      for (const p of allProblems) {
        process.stdout.write(`  - 第 ${p.page} 页 [${p.type}] ${p.detail}\n`)
      }
    }
  }

  // 报告落盘，便于回看与留痕
  try {
    const skillName = resolveOwningSkillName(SCRIPT_URL)
    if (skillName) {
      const dir = skillTempDir(skillName, process.cwd())
      mkdirSync(dir, { recursive: true })
      const report = [
        '文件: ' + htmlPath,
        '页数: ' + results.length,
        '问题数: ' + allProblems.length,
        '',
        ...results.map((r) =>
          `第 ${String(r.page).padStart(2)} 页：内容 ${r.lineCount} 行 | 装饰形状 ${r.decorative} | 最小字号 ${r.minFont ?? '-'}pt | 文字占比 ${Math.round(r.ratio * 100)}% | 底边 ${r.bottom === null ? '-' : Math.round(r.bottom)}pt`),
        '',
        ...allProblems.map((p) => `第 ${p.page} 页 [${p.type}] ${p.detail}`),
      ].join('\n')
      writeFileSync(join(dir, 'deck-validation.txt'), report, 'utf8')
    }
  } catch {
    // 报告落盘失败不影响主流程
  }

  process.exitCode = allProblems.length > 0 ? 1 : 0
}

main()
