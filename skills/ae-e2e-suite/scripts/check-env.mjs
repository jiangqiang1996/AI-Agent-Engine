/**
 * check-env.mjs — E2E 运行环境预检与项目测试布局勘察（随技能自带）
 *
 * 纯 Node 脚本，无外部依赖，只读目标项目文件，不做任何网络请求与安装。
 * 用法：node check-env.mjs [--root <项目根>] [--config <配置文件>] [--electron-entry <入口>]
 *   --root 缺省为当前目录；--config 缺省为 <root>/playwright.config.ts；
 *   electron 目标追加 --electron-entry 检查可启动入口是否存在。
 * 输出：stdout 单行 JSON —— { root, ok, checks: [{ name, ok, detail, informational? }] }。
 *   硬性项：node / playwright-dep / config / browsers（electron 目标降为信息项）/ electron-entry；
 *   informational 项只给信息不计入 ok：system-browser（可复用本机浏览器路径）、
 *   npm-scripts（既有测试脚本）、vitest-configs（vitest 配置文件）、
 *   e2e-layout（e2e 目录基建布局：helpers/fixtures/golden/global-setup/spec 数；
 *   候选目录动态发现——根级与一级子目录下的 tests/e2e、e2e、tests 等常用形态，不绑定具体项目）、
 *   artifacts（产物目录现状：根级与 e2e 目录内的 test-results/reports/coverage 等，集中管理核对用）。
 *   browsers 口径：bundled 包与本机复用居其一即过，bundled 只统计 chromium/firefox/webkit/msedge
 *   等浏览器包目录（ffmpeg 等辅助组件不算）。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

const argv = process.argv.slice(2)
function opt(name) {
  const i = argv.indexOf(name)
  if (i === -1) return undefined
  const value = argv[i + 1]
  if (!value || value.startsWith('--')) fail(`参数 ${name} 缺少取值`)
  return value
}
if (argv.some(a => a.startsWith('--') && !['--root', '--config', '--electron-entry'].includes(a))) {
  fail('未知参数：用法 node check-env.mjs [--root <项目根>] [--config <配置文件>] [--electron-entry <入口>]')
}

const root = resolve(opt('--root') ?? '.')
const config = resolve(root, opt('--config') ?? 'playwright.config.ts')
const electronEntry = opt('--electron-entry') ? resolve(root, opt('--electron-entry')) : null

const checks = []
function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  return ok
}

// Node 版本（Playwright 要求 ≥ 18，本技能口径 ≥ 20）
const major = Number(process.versions.node.split('.')[0])
check('node', major >= 20, `当前 ${process.versions.node}（要求 ≥ 20）`)

// package.json：依赖检查 + 测试脚本勘察
let pkg = null
const pkgPath = join(root, 'package.json')
let playwrightInstalled = false
let playwrightDetail = '未找到 <root>/package.json'
if (existsSync(pkgPath)) {
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const version = pkg?.devDependencies?.['@playwright/test'] ?? pkg?.dependencies?.['@playwright/test']
    playwrightInstalled = typeof version === 'string'
    playwrightDetail = playwrightInstalled ? `@playwright/test ${version}` : 'package.json 未声明 @playwright/test（执行 npm init playwright@latest 初始化）'
  } catch {
    playwrightDetail = 'package.json 解析失败'
  }
}
check('playwright-dep', playwrightInstalled, playwrightDetail)

// 配置文件存在
const configExists = existsSync(config)
check('config', configExists, configExists ? config : `配置文件不存在：${config}（先 npm init playwright@latest 初始化，或用 --config 指定实际路径）`)

// 浏览器可用（bundled 包、本地复用二者居其一；electron 目标降为信息项）
function defaultBrowsersDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return resolve(process.env.PLAYWRIGHT_BROWSERS_PATH)
  if (process.platform === 'win32') return join(homedir(), 'AppData', 'Local', 'ms-playwright')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright')
  return join(homedir(), '.cache', 'ms-playwright')
}
function systemBrowserCandidates() {
  const list = []
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LocalAppData]) {
      if (base) list.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    }
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']]) {
      if (base) list.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    }
  } else if (process.platform === 'darwin') {
    list.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')
  } else {
    for (const dir of (process.env.PATH ?? '').split(':')) {
      for (const bin of ['google-chrome', 'microsoft-edge', 'chromium', 'chromium-browser']) {
        if (dir) list.push(join(dir, bin))
      }
    }
  }
  return [...new Set(list)].filter(p => { try { return existsSync(p) } catch { return false } })
}
const browsersDir = defaultBrowsersDir()
const reuseBrowsers = systemBrowserCandidates()
let browsersOk = false
let browsersDetail = `目录不存在：${browsersDir}`
try {
  // 只统计浏览器包目录；ffmpeg-*、winldd-* 等辅助组件目录不算浏览器存在的证据
  const entries = readdirSync(browsersDir).filter(name => /^(chromium|firefox|webkit|msedge)/i.test(name))
  browsersOk = entries.length > 0
  browsersDetail = browsersOk
    ? `${browsersDir}（${entries.length} 个浏览器包：${entries.join('、')}）`
    : `目录内无浏览器包（可能仅有 ffmpeg 等辅助组件）：${browsersDir}`
} catch { /* 缺失即未安装，走复用或安装兜底 */ }
if (!browsersOk && reuseBrowsers.length) {
  browsersOk = true
  browsersDetail = `bundled 包未装，可复用本机浏览器（无需安装）：${reuseBrowsers.join('；')}`
} else if (!browsersOk) {
  browsersDetail = `${browsersDetail}；亦无本机浏览器可复用（执行 npx playwright install chromium 安装）`
}
if (electronEntry) {
  // electron 自带 Chromium：纯 electron 运行不依赖 bundled 包，信息项即可
  checks.push({ name: 'browsers', ok: true, informational: true, detail: `${browsersDetail}（electron 目标非必需）` })
} else {
  check('browsers', browsersOk, browsersDetail)
}

// electron 可启动入口（仅 electron 目标传参时检查）
if (electronEntry) {
  check('electron-entry', existsSync(electronEntry), electronEntry)
}

// 本机用户浏览器（web 复用优先：channel/executablePath；信息项，不计入 ok）
checks.push({ name: 'system-browser', ok: true, informational: true, detail: reuseBrowsers.length ? `可复用：${reuseBrowsers.join('；')}（channel: chrome/msedge 或 executablePath）` : '未发现本机 Chrome/Edge（复用包管理器 Chromium，或执行 npx playwright install chromium 安装）' })

// ===== 以下为勘察信息项：项目既有测试分层与 e2e 基建布局（复用优先的依据） =====

// npm-scripts：既有测试相关脚本（test/e2e/coverage 关键字），第 4 步运行编排直接取用
if (pkg?.scripts && typeof pkg.scripts === 'object') {
  const testScripts = Object.entries(pkg.scripts)
    .filter(([name, cmd]) => /^(test|e2e|coverage)/i.test(name) || /playwright|vitest|c8\b/i.test(String(cmd)))
    .map(([name, cmd]) => `${name}=${cmd}`)
  checks.push({ name: 'npm-scripts', ok: true, informational: true, detail: testScripts.length ? testScripts.join(' ｜ ') : 'package.json 无测试相关脚本（可按 references 约定补 test:e2e 等入口）' })
}

// vitest-configs：vitest 配置文件（分层判据：单测/集成/node 级 e2e 各自独立配置）
try {
  const vitestConfigs = readdirSync(root).filter(name => /^vitest.*\.config\.(ts|mts|js|mjs)$/.test(name))
  checks.push({ name: 'vitest-configs', ok: true, informational: true, detail: vitestConfigs.length ? vitestConfigs.join('、') : '根目录无 vitest 配置（项目未用 vitest 分层）' })
} catch { /* root 不可读时跳过 */ }

// e2e-layout：候选 e2e 目录的基建布局（helpers/fixtures/golden/global-setup/spec 数）
function surveyE2eDir(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return null }
  const specCount = entries.filter(n => /\.(spec|test)\.(ts|js|mjs)$/.test(n)).length
  const parts = [`${specCount} spec`]
  for (const sub of ['helpers', 'fixtures', 'golden', 'page-objects']) {
    if (entries.includes(sub)) parts.push(`${sub}/`)
  }
  if (entries.some(n => /^global-setup\./.test(n))) parts.push('global-setup')
  const configs = entries.filter(n => /^playwright\..+\.config\.(ts|js|mjs)$/.test(n) || ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'].includes(n))
  if (configs.length) parts.push(`配置：${configs.join('、')}`)
  return parts.join('，')
}
// 候选目录动态发现，不绑定任何项目的目录名：根级常用名（tests/e2e、e2e、tests 等，
// 含 node 级 e2e 的 tests/e2e-vitest）+ 一级子目录下的同款形态（<子目录>/tests/e2e，
// 覆盖 monorepo 子包与自定义测试根）；跳过隐藏目录与 node_modules
function e2eCandidateDirs() {
  const found = []
  const seen = new Set()
  const push = (rel) => {
    if (seen.has(rel)) return
    seen.add(rel)
    if (existsSync(join(root, ...rel.split('/')))) found.push(rel)
  }
  for (const rel of ['tests/e2e', 'tests/e2e-vitest', 'test/e2e', 'e2e', 'tests', 'test']) push(rel)
  try {
    for (const ent of readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'node_modules') continue
      for (const rel of [`${ent.name}/tests/e2e`, `${ent.name}/test/e2e`, `${ent.name}/e2e`, `${ent.name}/tests`]) push(rel)
    }
  } catch { /* root 不可读时只用根级候选 */ }
  return found
}
const e2eCandidates = e2eCandidateDirs()
const foundLayouts = []
for (const rel of e2eCandidates) {
  const dir = join(root, ...rel.split('/'))
  const survey = surveyE2eDir(dir)
  if (survey) foundLayouts.push(`${rel}/：${survey}`)
}
checks.push({ name: 'e2e-layout', ok: true, informational: true, detail: foundLayouts.length ? foundLayouts.join(' ｜ ') : '未发现既有 e2e 目录（按 references 目录布局新建）' })

// artifacts：产物目录现状（集中管理核对：运行产物/报告/覆盖率/分片/登录态各自归位，散落时收口迁移）
const ARTIFACT_NAMES = ['test-results', 'playwright-report', 'reports', 'coverage', 'coverage-json', 'blob-report', 'golden']
const foundArtifacts = []
try {
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (name.isDirectory() && ARTIFACT_NAMES.includes(name.name)) foundArtifacts.push(`${name.name}/（根级）`)
  }
  if (existsSync(join(root, 'playwright', '.auth'))) foundArtifacts.push('playwright/.auth/（根级）')
} catch { /* root 不可读时跳过 */ }
for (const rel of e2eCandidates) {
  const dir = join(root, ...rel.split('/'))
  for (const name of ['test-results', 'reports', 'golden']) {
    if (existsSync(join(dir, name))) foundArtifacts.push(`${rel}/${name}/`)
  }
}
checks.push({ name: 'artifacts', ok: true, informational: true, detail: foundArtifacts.length ? `既有产物目录：${foundArtifacts.join('、')}（对照集中管理约定：产物与配置同址归类且 gitignore，根级散落项列出归并方案经确认后迁移）` : '未发现产物目录（首跑后按集中管理约定归位：outputDir/报告/覆盖率钉进配置）' })

const ok = checks.filter(c => !c.informational).every(c => c.ok)
process.stdout.write(JSON.stringify({ root, ok, checks }) + '\n')
