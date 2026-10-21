/**
 * 无头浏览器探测与渲染的单元测试
 *
 * 运行：node --test skills/ae-pptx/tests/browser.test.mjs
 *
 * 不需要真实浏览器：findBrowser 通过 env / candidates 注入，
 * renderDomWithBrowser 通过 spawn 注入假的浏览器进程。
 */

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, describe, it } from 'node:test'

import { findBrowser, renderDomWithBrowser } from '../scripts/lib/browser.mjs'

const tempDirs = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-browser-'))
  tempDirs.push(dir)
  return dir
}

after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 一个"存在但不可执行"的占位文件，够用来验证探测逻辑 */
function fakeExecutable(dir, name) {
  const file = join(dir, name)
  writeFileSync(file, '', 'utf8')
  return file
}

describe('findBrowser', () => {
  it('优先用 AE_BROWSER 指向的可执行文件', () => {
    const dir = makeTempDir()
    const browser = fakeExecutable(dir, 'my-browser')
    assert.equal(findBrowser({ env: { AE_BROWSER: browser }, candidates: [] }), browser)
  })

  it('AE_BROWSER 不存在时退回 CHROME_PATH', () => {
    const dir = makeTempDir()
    const browser = fakeExecutable(dir, 'chrome-path-browser')
    const found = findBrowser({
      env: { AE_BROWSER: join(dir, 'nope.exe'), CHROME_PATH: browser },
      candidates: [],
    })
    assert.equal(found, browser)
  })

  it('环境变量都不可用时按候选列表找', () => {
    const dir = makeTempDir()
    const browser = fakeExecutable(dir, 'installed-browser')
    const found = findBrowser({
      env: { AE_BROWSER: join(dir, 'nope.exe'), CHROME_PATH: join(dir, 'nope2.exe') },
      candidates: [join(dir, 'nope3.exe'), browser],
    })
    assert.equal(found, browser)
  })

  it('候选列表与 PATH 里都没有时返回 null', () => {
    const found = findBrowser({ env: { PATH: '', PATHEXT: '' }, candidates: [] })
    assert.equal(found, null)
  })

  it('候选列表没有时从 PATH 里找浏览器命令', () => {
    const dir = makeTempDir()
    const name = process.platform === 'win32' ? 'google-chrome.EXE' : 'google-chrome'
    const browser = fakeExecutable(dir, name)
    // PATH 用 ';' 分隔时才会被按分号切分（Windows 盘符里的 ':' 不算分隔符），
    // 所以这里显式带上分隔符，避免路径被从盘符处截断。
    const pathValue = process.platform === 'win32' ? ';' + dir : dir
    const found = findBrowser({ env: { PATH: pathValue, PATHEXT: '.EXE' }, candidates: [] })
    assert.equal(found, browser)
  })
})

describe('renderDomWithBrowser', () => {
  const htmlPath = resolve('page.html')

  it('找不到浏览器时给出明确错误', () => {
    const result = renderDomWithBrowser(htmlPath, { env: { PATH: '', PATHEXT: '' }, candidates: [] })
    assert.equal(result.ok, false)
    assert.equal(result.dom, '')
    assert.match(result.error, /未找到可用的浏览器/)
  })

  it('渲染成功时返回浏览器输出的 DOM', () => {
    const dom = '<html><body><svg width="10" height="10"><rect/></svg></body></html>'
    const calls = []
    const result = renderDomWithBrowser(htmlPath, {
      browser: '/fake/chrome',
      spawn: (command, args) => {
        calls.push({ command, args })
        return { status: 0, stdout: dom, stderr: '' }
      },
    })
    assert.equal(result.ok, true)
    assert.equal(result.dom, dom)
    assert.equal(result.browser, '/fake/chrome')
    assert.equal(result.error, null)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].command, '/fake/chrome')
    assert.ok(calls[0].args.includes('--dump-dom'))
  })

  it('浏览器退出码非 0 时报告 stderr', () => {
    const result = renderDomWithBrowser(htmlPath, {
      browser: '/fake/chrome',
      spawn: () => ({ status: 1, stdout: '', stderr: 'chrome crashed' }),
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /浏览器渲染失败：chrome crashed/)
  })

  it('浏览器不存在时报告启动失败', () => {
    const result = renderDomWithBrowser(htmlPath, {
      browser: '/fake/chrome',
      spawn: () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOENT', message: 'spawn ENOENT' } }),
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /浏览器无法启动/)
  })

  it('没有产出 DOM 时报告渲染未产出 DOM', () => {
    const result = renderDomWithBrowser(htmlPath, {
      browser: '/fake/chrome',
      spawn: () => ({ status: 0, stdout: 'no markup here', stderr: '' }),
    })
    assert.equal(result.ok, false)
    assert.match(result.error, /浏览器渲染未产出 DOM/)
  })
})
