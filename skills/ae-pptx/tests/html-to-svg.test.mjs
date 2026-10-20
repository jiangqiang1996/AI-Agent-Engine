/**
 * HTML → SVG 转换脚本单元测试
 *
 * 运行：node --test skills/ae-pptx/tests/html-to-svg.test.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import { renderChart, estimateTextWidth, formatValue, normalizeSpec } from '../scripts/lib/chart-spec.mjs'
import {
  collectStyleBlocks,
  extractChartSpec,
  extractInlineSvg,
  inlineCss,
  normalizeSvg,
  parseCss,
} from '../scripts/lib/html-svg.mjs'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(SKILL_DIR, 'scripts', 'html-to-svg.mjs')
const tempDirs = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-svg-'))
  tempDirs.push(dir)
  return dir
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const BAR_SPEC = {
  type: 'bar',
  width: 960,
  height: 420,
  title: '季度营收',
  categories: ['Q1', 'Q2', 'Q3'],
  series: [{ name: '国内', data: [120, 200, 180] }],
  colors: ['4472C4'],
  options: { showValues: true },
}

describe('chart-spec 渲染器', () => {
  it('渲染柱状图，包含坐标轴、柱体与标题', () => {
    const svg = renderChart(BAR_SPEC)
    assert.match(svg, /^<svg /)
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /width="960"/)
    assert.match(svg, /height="420"/)
    assert.match(svg, /viewBox="0 0 960 420"/)
    assert.match(svg, /<rect[^>]*fill="#4472C4"/)
    assert.match(svg, /季度营收/)
    assert.match(svg, /<title>季度营收<\/title>/)
  })

  it('各类图表类型都能产出合法 SVG', () => {
    for (const type of ['bar', 'hbar', 'line', 'area', 'pie', 'donut']) {
      const svg = renderChart({ ...BAR_SPEC, type })
      assert.match(svg, /^<svg /, type + ' 应输出 SVG')
      assert.match(svg, /<\/svg>/, type + ' 应闭合 SVG')
    }
  })

  it('不支持的类型报错', () => {
    assert.throws(() => renderChart({ ...BAR_SPEC, type: 'radar' }), /不支持的图表类型/)
  })

  it('饼图输出扇形路径与百分比标签', () => {
    const svg = renderChart({
      ...BAR_SPEC,
      type: 'donut',
      series: [{ name: '占比', data: [25, 75] }],
      options: { showValues: true },
    })
    assert.match(svg, /<path d="M /)
    assert.match(svg, /25%/)
    assert.match(svg, /75%/)
  })

  it('缺失 categories 时按最长序列补齐', () => {
    const cfg = normalizeSpec({
      type: 'bar',
      series: [{ name: 'A', data: [1, 2, 3, 4] }],
    })
    assert.equal(cfg.categories.length, 4)
  })

  it('中文文本宽度按 1em 估算，ASCII 更窄', () => {
    assert.ok(estimateTextWidth('中文字', 12) > estimateTextWidth('abc', 12))
    assert.equal(estimateTextWidth('中', 12), 12)
  })

  it('数值格式化支持前缀后缀与小数位', () => {
    assert.equal(formatValue(12.345, { decimals: 1 }), '12.3')
    assert.equal(formatValue(12, { prefix: '¥', suffix: ' 万' }), '¥12 万')
  })
})

describe('HTML 解析与 CSS 内联', () => {
  it('从 HTML 中提取图表 spec', () => {
    const html = '<html><body><script type="application/json" id="ae-chart">{"type":"line","series":[{"name":"A","data":[1,2]}]}</script></body></html>'
    const spec = extractChartSpec(html)
    assert.equal(spec.type, 'line')
    assert.equal(spec.series[0].data.length, 2)
  })

  it('没有图表 spec 时返回 null', () => {
    assert.equal(extractChartSpec('<html><body>hi</body></html>'), null)
  })

  it('提取内联 svg', () => {
    const html = '<html><body><svg width="10" height="20"><rect/></svg></body></html>'
    const svg = extractInlineSvg(html)
    assert.ok(svg.startsWith('<svg'))
    assert.ok(svg.endsWith('</svg>'))
  })

  it('解析 CSS 规则', () => {
    const rules = parseCss('.a { fill: red; } #b { stroke: blue }')
    assert.equal(rules.length, 2)
    assert.equal(rules[0].selector, '.a')
    assert.equal(rules[0].declarations[0].property, 'fill')
  })

  it('把 class 样式内联成呈现属性', () => {
    const svg = '<svg width="100" height="100"><rect class="bar" x="0" y="0" width="10" height="10"/></svg>'
    const result = inlineCss(svg, ['.bar { fill: #4472C4; }'])
    assert.match(result, /fill="#4472C4"/)
    assert.match(result, /<rect[^>]*\/>/)
  })

  it('style 属性优先级高于 class，且 px 单位被归一化', () => {
    const svg = '<svg width="100" height="100"><text class="t" style="font-size:20px">A</text></svg>'
    const result = inlineCss(svg, ['.t { font-size: 12px; fill: #333333; }'])
    assert.match(result, /font-size="20"/)
    assert.match(result, /fill="#333333"/)
  })

  it('收集 style 块内容', () => {
    const blocks = collectStyleBlocks('<html><style>.a{fill:red}</style></html>')
    assert.equal(blocks.length, 1)
    assert.match(blocks[0], /fill:red/)
  })

  it('规范化：补 viewBox、去掉脚本', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>'
    const result = normalizeSvg(svg, { width: 300, height: 150, title: 'T' })
    assert.match(result, /width="300"/)
    assert.match(result, /height="150"/)
    assert.match(result, /viewBox="0 0 300 150"/)
    assert.doesNotMatch(result, /<script/)
    assert.match(result, /aria-label="T"/)
  })
})

describe('html-to-svg 命令行', () => {
  it('HTML 含图表 spec 时输出 SVG 文件', () => {
    const dir = makeTempDir()
    const htmlPath = join(dir, 'chart.html')
    const outPath = join(dir, 'chart.svg')
    writeFileSync(htmlPath, [
      '<html><body><script type="application/json" id="ae-chart">',
      JSON.stringify(BAR_SPEC),
      '</script></body></html>',
    ].join('\n'), 'utf8')

    const result = spawnSync(process.execPath, [CLI, '--html', htmlPath, '--out', outPath, '--json'], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.mode, 'spec')
    assert.equal(report.out, outPath)

    const svg = readFileSync(outPath, 'utf8')
    assert.match(svg, /^<svg /)
    assert.match(svg, /fill="#4472C4"/)
  })

  it('缺少输入参数时以非零退出码失败', () => {
    const result = spawnSync(process.execPath, [CLI], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /缺少 --html 或 --spec/)
  })

  it('spec 文件可直接渲染', () => {
    const dir = makeTempDir()
    const specPath = join(dir, 'chart.json')
    const outPath = join(dir, 'chart.svg')
    writeFileSync(specPath, JSON.stringify(BAR_SPEC), 'utf8')
    const result = spawnSync(process.execPath, [CLI, '--spec', specPath, '--out', outPath], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(readFileSync(outPath, 'utf8'), /季度营收/)
  })

  it('缺省输出落到 <cwd>/ae/pptx/assets/ 下', () => {
    const dir = makeTempDir()
    const htmlPath = join(dir, 'chart.html')
    writeFileSync(htmlPath, [
      '<html><body><script type="application/json" id="ae-chart">',
      JSON.stringify(BAR_SPEC),
      '</script></body></html>',
    ].join('\n'), 'utf8')

    const result = spawnSync(process.execPath, [CLI, '--html', htmlPath, '--cwd', dir, '--json'], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.out, join(dir, 'ae', 'pptx', 'assets', 'chart.svg'))
    assert.ok(readFileSync(report.out, 'utf8').startsWith('<svg'))
  })
})
