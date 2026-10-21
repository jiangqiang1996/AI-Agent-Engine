#!/usr/bin/env node
/**
 * HTML → SVG 转换（PPT 配图用）
 *
 * 用法：
 *   node scripts/html-to-svg.mjs --html chart.html --out ae/pptx/assets/chart.svg
 *   node scripts/html-to-svg.mjs --spec chart.json  --out ae/pptx/assets/chart.svg
 *
 * 三种转换路径（--mode 指定，缺省为 auto 自动判定）：
 *   spec    —— HTML/JSON 里带图表 spec，由内置渲染器输出矢量图表
 *   inline  —— HTML 里直接写了内联 <svg>，抽出并把 CSS 内联成呈现属性
 *   browser —— 上面都没有时，用本机 Chrome/Edge 无头渲染页面后抽取 <svg>
 *
 * 退出码：0 成功 / 1 失败（错误信息输出到 stderr）
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'

import { renderChart } from './lib/chart-spec.mjs'
import {
  collectStyleBlocks,
  extractChartSpec,
  extractInlineSvg,
  inlineCss,
  normalizeSvg,
} from './lib/html-svg.mjs'
import { renderDomWithBrowser } from './lib/browser.mjs'
import { resolveOwningSkillName, skillArtifactDir } from './lib/ae-paths.mjs'

const SCRIPT_URL = import.meta.url

/** 解析命令行参数 */
function parseArgs(argv) {
  const args = { mode: 'auto' }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      continue
    }
    const key = token.slice(2)
    if (key === 'json' || key === 'help') {
      args[key] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = value
    i += 1
  }
  return args
}

const USAGE = [
  '用法：node scripts/html-to-svg.mjs --html <file.html> [--out <file.svg>] [选项]',
  '',
  '选项：',
  '  --html <path>     输入 HTML 文件',
  '  --spec <path>     输入图表 spec（JSON 文件），跳过 HTML',
  '  --out <path>      输出 SVG 路径（缺省写到 <cwd>/ae/pptx/assets/<同名>.svg）',
  '  --cwd <path>      工作根目录（相对路径的基准），缺省为当前目录',
  '  --mode <mode>     auto | spec | inline | browser（缺省 auto）',
  '  --width <px>      强制输出宽度',
  '  --height <px>     强制输出高度',
  '  --title <text>    写入 <title> 与 aria-label',
  '  --background <c>  背景色（6 位 HEX 或 transparent）',
  '  --json            以 JSON 输出结果',
  '  --help            显示本帮助',
].join('\n')

/** 生成默认输出路径 */
function defaultOutput(inputPath, cwd) {
  const skillName = resolveOwningSkillName(SCRIPT_URL)
  const dir = skillName ? join(skillArtifactDir(skillName, cwd), 'assets') : join(cwd, 'ae', 'pptx', 'assets')
  const name = basename(inputPath, extname(inputPath))
  return join(dir, name + '.svg')
}

/**
 * 按 mode 转换。
 *
 * @param {object} args 命令行参数
 * @param {string} cwd 工作根目录
 * @param {object} [deps] 依赖注入（测试用）：renderDom 覆盖无头浏览器渲染
 * @returns {{ svg: string, mode: string }}
 */
export function convert(args, cwd, deps = {}) {
  const renderDom = typeof deps.renderDom === 'function' ? deps.renderDom : renderDomWithBrowser
  const options = {
    width: Number(args.width) > 0 ? Number(args.width) : undefined,
    height: Number(args.height) > 0 ? Number(args.height) : undefined,
    title: typeof args.title === 'string' ? args.title : undefined,
    background: typeof args.background === 'string' ? args.background : undefined,
  }

  // 1) 直接给 spec 文件
  if (args.spec && typeof args.spec === 'string') {
    const specPath = resolve(cwd, args.spec)
    const spec = JSON.parse(readFileSync(specPath, 'utf8'))
    return { svg: normalizeSvg(renderChart(spec), options), mode: 'spec' }
  }

  if (!args.html || typeof args.html !== 'string') {
    throw new Error('缺少 --html 或 --spec 参数\n\n' + USAGE)
  }

  const htmlPath = resolve(cwd, args.html)
  const html = readFileSync(htmlPath, 'utf8')
  const mode = args.mode === 'spec' || args.mode === 'inline' || args.mode === 'browser' ? args.mode : 'auto'

  const runSpec = () => {
    const spec = extractChartSpec(html)
    if (!spec) {
      throw new Error('HTML 中没有找到图表 spec（期望 <script type="application/json" id="ae-chart">）')
    }
    return { svg: normalizeSvg(renderChart(spec), options), mode: 'spec' }
  }

  const runInline = () => {
    const inline = extractInlineSvg(html)
    if (!inline) {
      throw new Error('HTML 中没有找到内联 <svg>')
    }
    const inlined = inlineCss(inline, collectStyleBlocks(html))
    return { svg: normalizeSvg(inlined, options), mode: 'inline' }
  }

  const runBrowser = () => {
    const rendered = renderDom(htmlPath, { timeoutMs: 60000 })
    if (!rendered.ok) {
      throw new Error('浏览器渲染失败：' + rendered.error)
    }
    const inline = extractInlineSvg(rendered.dom)
    if (!inline) {
      throw new Error('浏览器渲染后的页面中没有 <svg>（请确认页面确实渲染出矢量图形）')
    }
    const inlined = inlineCss(inline, collectStyleBlocks(rendered.dom))
    return { svg: normalizeSvg(inlined, options), mode: 'browser' }
  }

  if (mode === 'spec') {
    return runSpec()
  }
  if (mode === 'inline') {
    return runInline()
  }
  if (mode === 'browser') {
    return runBrowser()
  }

  // auto：spec → inline → browser
  if (extractChartSpec(html)) {
    return runSpec()
  }
  if (extractInlineSvg(html)) {
    return runInline()
  }
  return runBrowser()
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(USAGE + '\n')
    return
  }
  const cwd = typeof args.cwd === 'string' ? resolve(args.cwd) : process.cwd()
  try {
    const result = convert(args, cwd)
    const outPath = typeof args.out === 'string'
      ? (isAbsolute(args.out) ? args.out : resolve(cwd, args.out))
      : defaultOutput(typeof args.html === 'string' ? args.html : String(args.spec ?? 'chart'), cwd)

    mkdirSync(join(outPath, '..'), { recursive: true })
    writeFileSync(outPath, result.svg, 'utf8')

    const size = Buffer.byteLength(result.svg, 'utf8')
    if (args.json) {
      process.stdout.write(JSON.stringify({
        ok: true,
        out: outPath,
        mode: result.mode,
        bytes: size,
      }, null, 2) + '\n')
      return
    }
    process.stdout.write('已生成 SVG：' + outPath + '（模式：' + result.mode + '，' + size + ' 字节）\n')
  } catch (error) {
    process.stderr.write('转换失败：' + error.message + '\n')
    process.exitCode = 1
  }
}

const entryArgs = process.argv.slice(1, 2)
const invokedDirectly = entryArgs.length > 0 && String(entryArgs[0]).endsWith('html-to-svg.mjs')
if (invokedDirectly) {
  main()
}
