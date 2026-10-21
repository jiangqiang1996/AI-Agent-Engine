/**
 * validate-deck.mjs 单元测试
 *
 * 运行：node --test skills/ae-pptx/tests/validate-deck.test.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(SKILL_DIR, 'scripts', 'validate-deck.mjs')
const tempDirs = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-validate-'))
  tempDirs.push(dir)
  return dir
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 生成一个 shape 片段（text 用 \n 分段时渲染成多个 <div class="para">） */
function shape({ path, left, top, width, height, text = '', fontSize = 12, fill = null, lineHeight = 1.4 }) {
  const background = fill ? `background:#${fill};` : 'background:transparent;'
  const paras = text === ''
    ? '<div class="para" style="font-size:18pt;line-height:1.22"><span>&nbsp;</span></div>'
    : String(text).split('\n')
      .map((line) => `<div class="para" style="font-size:${fontSize}pt;line-height:${lineHeight}">${line}</div>`)
      .join('')
  return `<div class="shape" data-path="${path}" style="left:${left}pt;top:${top}pt;width:${width}pt;height:${height}pt;${background}padding:0pt"><div class="shape-text valign-top">${paras}</div></div>`
}

/** 生成一页 */
function page(slideNo, shapes, background = '#FFFFFF') {
  return `<div class="slide-container" data-slide="${slideNo}"><div class="slide-label">Slide ${slideNo}</div><div class="slide-wrapper"><div class="slide" style="background:${background}">${shapes.join('')}</div></div></div>`
}

/**
 * 写一份多页 HTML 并跑校验器。
 * @param {Array<{shapes: string[], background?: string}>} pages
 */
function runDeck(pages, extraArgs = []) {
  const dir = makeTempDir()
  const file = join(dir, 'deck.html')
  const html = `<!DOCTYPE html><html><body>${pages
    .map((item, index) => page(index + 1, item.shapes, item.background ?? '#FFFFFF'))
    .join('')}</body></html>`
  writeFileSync(file, html, 'utf8')
  const result = spawnSync(process.execPath, [CLI, '--html', file, ...extraArgs], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * 写一份 HTML 并跑校验器。
 * 默认在底部补一块装饰形状，让"版面偏上"检查不干扰其它用例。
 */
function run(shapes, extraArgs = [], options = {}) {
  const dir = makeTempDir()
  const file = join(dir, 'deck.html')
  const body = options.noBottom
    ? shapes
    : [...shapes, shape({ path: '/slide[1]/shape[999]', left: 50, top: 440, width: 860, height: 30, fill: '0B1F3A' })]
  writeFileSync(file, `<!DOCTYPE html><html><body>${page(1, body)}</body></html>`, 'utf8')
  const result = spawnSync(process.execPath, [CLI, '--html', file, ...extraArgs], { encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe('validate-deck', () => {
  it('正常页面通过校验', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 0, top: 0, width: 960, height: 50, fill: '0B1F3A' }),
      shape({ path: '/slide[1]/shape[2]', left: 30, top: 12, width: 400, height: 30, text: '标题文字' }),
      shape({ path: '/slide[1]/shape[3]', left: 50, top: 80, width: 400, height: 100, fill: 'EAF6F9' }),
      shape({ path: '/slide[1]/shape[4]', left: 70, top: 100, width: 300, height: 24, text: '卡片说明文字' }),
    ])
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /视觉验证通过/)
  })

  it('检测文本重叠', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 300, height: 40, text: '文字一' }),
      shape({ path: '/slide[1]/shape[2]', left: 100, top: 90, width: 300, height: 40, text: '文字二' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /重叠/)
  })

  it('检测换行后块高不足的溢出', () => {
    // 34 个 ASCII 字符在 100pt 宽的 12pt 字号下需要 2 行，但 shape 只有 20pt 高
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 100, height: 20, text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /溢出/)
  })

  it('正常换行不算溢出（按行数估算而不是整段宽度）', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 200, height: 40, text: '这是一段会在宽度内正常换行的中文说明文字内容' }),
    ])
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })

  it('检测纯文字页', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 40, text: '只有文字没有图形' }),
    ], [], { noBottom: true })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /纯文字页/)
  })

  it('检测文字过密（可用 --max-lines 调整预算）', () => {
    const shapes = [
      shape({ path: '/slide[1]/shape[1]', left: 0, top: 0, width: 960, height: 50, fill: '0B1F3A' }),
      shape({ path: '/slide[1]/shape[2]', left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' }),
    ]
    for (let i = 0; i < 6; i += 1) {
      shapes.push(shape({
        path: `/slide[1]/shape[${i + 3}]`,
        left: 50 + (i % 3) * 250,
        top: 160 + Math.floor(i / 3) * 60,
        width: 200,
        height: 24,
        text: `第 ${i + 1} 行说明`,
      }))
    }
    const strict = run(shapes, ['--max-lines', '4'])
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /文字过密/)

    const loose = run(shapes, ['--max-lines', '20'])
    assert.doesNotMatch(loose.stdout, /文字过密/)
  })

  it('检测越出页边距', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 10, top: 80, width: 200, height: 40, fill: 'EAF6F9' }),
      shape({ path: '/slide[1]/shape[2]', left: 800, top: 120, width: 200, height: 40, fill: 'EAF6F9' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /越界/)
  })
  it('检测单 shape 段落数超过 3', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 100, fill: 'EAF6F9' }),
      shape({ path: '/slide[1]/shape[2]', left: 70, top: 90, width: 300, height: 80, text: '一\n二\n三\n四' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /文字块过长/)
  })

  it('--json 输出结构化结果', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 40, text: '文字' }),
    ], ['--json'])
    const report = JSON.parse(result.stdout)
    assert.equal(report.pages.length, 1)
    assert.equal(report.pages[0].page, 1)
    assert.ok(Array.isArray(report.pages[0].problems))
  })

  it('检测页面过重（浅底页深色块过多）', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 860, height: 300, fill: '0B1F3A' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /页面过重/)
  })

  it('检测节奏单调（连续多页同一条通栏色带）', () => {
    const dir = makeTempDir()
    const file = join(dir, 'deck.html')
    const band = shape({ path: '/slide[1]/shape[1]', left: 0, top: 0, width: 960, height: 50, fill: '0B1F3A' })
    const body = shape({ path: '/slide[1]/shape[2]', left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' })
    const html = `<!DOCTYPE html><html><body>${[1, 2, 3, 4, 5]
      .map((n) => `<div class="slide-container" data-slide="${n}"><div class="slide" style="background:#FFFFFF">${band}${body}</div></div>`)
      .join('')}</body></html>`
    writeFileSync(file, html, 'utf8')
    const result = spawnSync(process.execPath, [CLI, '--html', file], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /节奏单调/)
  })

  it('检测深色页过多', () => {
    const dir = makeTempDir()
    const file = join(dir, 'deck.html')
    const body = shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' })
    const html = `<!DOCTYPE html><html><body>${[1, 2, 3, 4, 5, 6]
      .map((n) => `<div class="slide-container" data-slide="${n}"><div class="slide" style="background:#0B1F3A">${body}</div></div>`)
      .join('')}</body></html>`
    writeFileSync(file, html, 'utf8')
    const result = spawnSync(process.execPath, [CLI, '--html', file], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stdout, /深色页过多/)
  })

  /* ---------------- 调参项 ---------------- */

  it('多段落文本按整块高度判定溢出（逐段比对会永远不溢出）', () => {
    // 3 个段落各占 1 行（12pt × 1.4 = 16.8pt），合计 ≈ 50pt > shape 高度 30pt
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 30, text: '第一行\n第二行\n第三行' }),
    ])
    assert.equal(result.status, 1)
    assert.match(result.stdout, /\[溢出\]/)
    // 一个 shape 只报一次溢出
    assert.equal((result.stdout.match(/\[溢出\]/g) || []).length, 1)
  })

  it('段落高度够用时不报溢出', () => {
    const result = run([
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 80, text: '第一行\n第二行\n第三行' }),
    ])
    assert.doesNotMatch(result.stdout, /\[溢出\]/)
  })

  it('style 里含嵌套引号 / margin-* 时 shape 不会被丢掉', () => {
    const dir = makeTempDir()
    const file = join(dir, 'deck.html')
    const textShape = `<div class="shape" data-path="/slide[1]/shape[1]" style="margin-left:10pt;margin-top:20pt;left:50pt;top:80pt;width:400pt;height:40pt;font-family:"Microsoft YaHei";background:transparent"><div class="shape-text valign-top"><div class="para" style="font-size:18pt;line-height:1.22"><span>引号测试</span></div></div></div>`
    const deco = shape({ path: '/slide[1]/shape[2]', left: 50, top: 440, width: 860, height: 30, fill: '0B1F3A' })
    writeFileSync(file, `<!DOCTYPE html><html><body>${page(1, [textShape, deco])}</body></html>`, 'utf8')
    const result = spawnSync(process.execPath, [CLI, '--html', file], { encoding: 'utf8' })
    // shape 被正确解析：算作有文字的内容行，且位置没被 margin-* 带偏
    assert.doesNotMatch(result.stdout, /\[纯文字页\]/)
    assert.doesNotMatch(result.stdout, /\[越界\]/)
    assert.match(result.stdout, /\|\s+1\s+\|/) // 内容行 = 1
  })

  it('--min-gap 调整底部留白上限', () => {
    // 内容底边 410pt → 距页脚 95pt
    const shapes = [
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 400, width: 200, height: 10, fill: 'EAF6F9' }),
    ]
    const strict = run(shapes, [], { noBottom: true })
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /版面偏上/)

    const loose = run(shapes, ['--min-gap', '120'], { noBottom: true })
    assert.doesNotMatch(loose.stdout, /版面偏上/)
  })

  it('--text-area-ratio 调整文字面积占比上限', () => {
    const shapes = [
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 400, height: 200, text: '文字' }),
    ]
    const loose = run(shapes)
    assert.doesNotMatch(loose.stdout, /文字占比过高/)

    const strict = run(shapes, ['--text-area-ratio', '0.2'])
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /文字占比过高/)
  })

  it('--max-dark-ratio 调整深色面积上限', () => {
    // 深色块 800×200pt ≈ 30.9% 版面
    const shapes = [
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 800, height: 200, fill: '0B1F3A' }),
    ]
    const loose = run(shapes, [], { noBottom: true })
    assert.doesNotMatch(loose.stdout, /页面过重/)

    const strict = run(shapes, ['--max-dark-ratio', '0.25'], { noBottom: true })
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /页面过重/)
  })

  it('--max-same-band 调整同色带连续页数上限', () => {
    const pages = [1, 2, 3, 4].map((n) => ({
      shapes: [
        shape({ path: `/slide[${n}]/shape[1]`, left: 0, top: 0, width: 960, height: 50, fill: '0B1F3A' }),
        shape({ path: `/slide[${n}]/shape[2]`, left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' }),
      ],
    }))
    const strict = runDeck(pages)
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /节奏单调/)

    const loose = runDeck(pages, ['--max-same-band', '5'])
    assert.doesNotMatch(loose.stdout, /节奏单调/)
  })

  it('深色页预算默认 40%（9/20 = 45% 超出）', () => {
    const pages = []
    for (let i = 0; i < 20; i += 1) {
      const dark = i < 9
      pages.push({
        background: dark ? '#0B1F3A' : '#FFFFFF',
        shapes: [
          shape({ path: `/slide[${i + 1}]/shape[1]`, left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' }),
        ],
      })
    }
    const result = runDeck(pages)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /深色页过多/)
    assert.match(result.stdout, /45%/)
  })

  it('--max-dark-page-ratio 调整深色页占比上限', () => {
    const pages = []
    for (let i = 0; i < 20; i += 1) {
      const dark = i < 9
      pages.push({
        background: dark ? '#0B1F3A' : '#FFFFFF',
        shapes: [
          shape({ path: `/slide[${i + 1}]/shape[1]`, left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' }),
        ],
      })
    }
    const loose = runDeck(pages, ['--max-dark-page-ratio', '0.5'])
    assert.doesNotMatch(loose.stdout, /深色页过多/)

    const strict = runDeck(pages, ['--max-dark-page-ratio', '0.3'])
    assert.equal(strict.status, 1)
    assert.match(strict.stdout, /深色页过多/)
  })

  it('--cwd 指定相对路径的基准目录', () => {
    const dir = makeTempDir()
    writeFileSync(join(dir, 'deck.html'), `<!DOCTYPE html><html><body>${page(1, [
      shape({ path: '/slide[1]/shape[1]', left: 50, top: 80, width: 200, height: 60, fill: 'EAF6F9' }),
      shape({ path: '/slide[1]/shape[2]', left: 50, top: 440, width: 860, height: 30, fill: '0B1F3A' }),
    ])}</body></html>`, 'utf8')
    const result = spawnSync(process.execPath, [CLI, '--html', 'deck.html', '--cwd', dir], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, /视觉验证通过/)
  })
})
