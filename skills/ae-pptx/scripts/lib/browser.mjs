/**
 * 无头浏览器探测与渲染（可选依赖）
 *
 * 只在"HTML 里既没有图表 spec、也没有内联 <svg>"时才需要：
 * 用本机已安装的 Chrome / Edge / Chromium 无头渲染页面，再把渲染后的
 * DOM 中的 <svg> 抽取出来。
 *
 * 不引入任何 npm 依赖：直接调用浏览器自带的 --dump-dom 能力。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveExternalCommand } from './ae-config.mjs'

/**
 * 定位本机可用的浏览器可执行文件。
 * @param {object} [options]
 * @param {object} [options.env]
 * @returns {string|null}
 */
export function findBrowser(options = {}) {
  const env = options.env ?? process.env

  const explicit = [env.AE_BROWSER, env.CHROME_PATH].find((value) => value && existsSync(value))
  if (explicit) {
    return explicit
  }

  const candidates = []
  if (process.platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const localAppData = env.LOCALAPPDATA || ''
    candidates.push(
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/snap/bin/chromium',
    )
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const resolved = resolveExternalCommand(name, env)
    if (resolved) {
      return resolved
    }
  }
  return null
}

/**
 * 用无头浏览器渲染 HTML，返回渲染后的 DOM 文本。
 *
 * @param {string} htmlPath HTML 文件绝对路径
 * @param {object} [options]
 * @param {number} [options.timeoutMs] 进程超时
 * @param {number} [options.virtualTimeBudgetMs] 虚拟时间预算（给图表库的动画/异步留时间）
 * @param {object} [options.env]
 * @returns {{ ok: boolean, dom: string, browser: string, error: string|null }}
 */
export function renderDomWithBrowser(htmlPath, options = {}) {
  const env = options.env ?? process.env
  const browser = findBrowser({ env })
  if (!browser) {
    return { ok: false, dom: '', browser: '', error: '未找到可用的浏览器（Chrome / Edge / Chromium）' }
  }

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30000
  const budget = Number(options.virtualTimeBudgetMs) > 0 ? Number(options.virtualTimeBudgetMs) : 5000
  const url = pathToFileURL(htmlPath).href
  const profileDir = mkdtempSync(join(tmpdir(), 'pptx-chrome-'))

  const baseArgs = [
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--user-data-dir=' + profileDir,
    '--virtual-time-budget=' + budget,
    '--dump-dom',
  ]

  for (const headlessFlag of ['--headless=new', '--headless']) {
    const result = spawnSync(browser, [...baseArgs, headlessFlag, url], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      env,
    })
    if (result.status === 0 && typeof result.stdout === 'string' && result.stdout.includes('<')) {
      return { ok: true, dom: result.stdout, browser, error: null }
    }
    if (result.error && result.error.code === 'ENOENT') {
      return { ok: false, dom: '', browser, error: '浏览器无法启动：' + result.error.message }
    }
    const stderr = String(result.stderr ?? '').trim()
    if (result.status !== 0 && stderr && !stderr.includes('DevTools')) {
      return { ok: false, dom: '', browser, error: '浏览器渲染失败：' + stderr.slice(0, 300) }
    }
  }
  return { ok: false, dom: '', browser, error: '浏览器渲染未产出 DOM' }
}
