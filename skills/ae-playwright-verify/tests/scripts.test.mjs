/**
 * scripts.test.mjs — 本技能自带脚本的单元测试
 *
 * 零外部依赖（仅 Node 标准库）：不需要浏览器、不需要 Playwright 安装、不访问网络。
 * 覆盖范围：
 *   - scripts/parse-report.mjs：Playwright JSON reporter 取证的解析与统计口径
 *   - scripts/check-env.mjs：环境预检的 ok 判定、ae.jsonc 配置读取、证据落盘路径
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = resolve(HERE, '..')
const SCRIPTS_DIR = join(SKILL_DIR, 'scripts')

/** 临时工作目录，测试结束自动清理 */
function makeWorkDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/**
 * 运行技能脚本并解析 stdout 的单行 JSON。
 * AE_CONFIG 固定指向不存在的路径，保证用例不依赖用户真实的 ae.jsonc（可用 env 覆盖）。
 */
function runScript(name, args, options = {}) {
  const stdout = execFileSync(process.execPath, [join(SCRIPTS_DIR, name), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AE_CONFIG: join(options.workDir ?? tmpdir(), '__no_such_ae_config__.jsonc'),
      ...options.env,
    },
  })
  return JSON.parse(stdout)
}

/** 构造一个小型 Playwright JSON reporter 报告：1 通过 + 1 失败 + 1 跳过 + 1 不稳定 */
function makeReport() {
  return {
    config: { rootDir: '/tmp/project' },
    suites: [
      {
        title: 'smoke.spec.ts',
        file: 'tests/e2e/smoke.spec.ts',
        specs: [
          {
            title: '应用启动且桥安全',
            file: 'tests/e2e/smoke.spec.ts',
            line: 10,
            tests: [{ status: 'expected', projectName: 'chromium', results: [{ status: 'passed', duration: 8, attachments: [] }] }],
          },
        ],
      },
      {
        title: 'login.spec.ts',
        file: 'tests/e2e/login.spec.ts',
        specs: [
          {
            title: '登录成功',
            file: 'tests/e2e/login.spec.ts',
            line: 20,
            tests: [
              {
                status: 'unexpected',
                projectName: 'chromium',
                results: [
                  {
                    status: 'failed',
                    duration: 30,
                    error: { message: 'expect(locator).toBeVisible() failed' },
                    attachments: [{ name: 'screenshot', path: 'test-results/x/screenshot.png', contentType: 'image/png' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'skip.spec.ts',
        file: 'tests/e2e/skip.spec.ts',
        specs: [
          {
            title: '待定用例',
            file: 'tests/e2e/skip.spec.ts',
            line: 5,
            tests: [{ status: 'skipped', projectName: 'chromium', results: [] }],
          },
        ],
      },
      {
        title: 'flaky.spec.ts',
        file: 'tests/e2e/flaky.spec.ts',
        specs: [
          {
            title: '不稳定用例',
            file: 'tests/e2e/flaky.spec.ts',
            line: 8,
            tests: [{ status: 'flaky', projectName: 'chromium', results: [{ status: 'failed' }, { status: 'passed' }] }],
          },
        ],
      },
    ],
    errors: [],
  }
}

function writeReport(dir, report, name = 'pw-report.json') {
  const reportPath = join(dir, name)
  writeFileSync(reportPath, JSON.stringify(report), 'utf8')
  return reportPath
}

function checksByName(result) {
  return Object.fromEntries(result.checks.map(c => [c.name, c]))
}

/* ------------------------------------------------------------------ *
 * parse-report.mjs
 * ------------------------------------------------------------------ */

test('parse-report.mjs：按 suites 结构统计总数/通过/失败/跳过/不稳定', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const reportPath = writeReport(dir, makeReport())

  const summary = runScript('parse-report.mjs', [reportPath, '--artifact-root', dir])

  assert.equal(summary.total, 4)
  assert.equal(summary.passed, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.flaky, 1)
  assert.equal(summary.truncated, false)
  assert.deepEqual(summary.errors, [])
  assert.equal(summary.failedTests.length, 1)

  const [failed] = summary.failedTests
  assert.equal(failed.title, '登录成功 ｜ chromium')
  assert.equal(failed.file, 'tests/e2e/login.spec.ts')
  assert.equal(failed.line, 20)
  assert.match(failed.error, /toBeVisible/)
  assert.equal(failed.attachments.length, 1)
  assert.equal(failed.attachments[0].name, 'screenshot')
  assert.equal(failed.attachments[0].contentType, 'image/png')
})

test('parse-report.mjs：stats 段存在时以其为准', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const report = { ...makeReport(), stats: { expected: 2, unexpected: 1, flaky: 1, skipped: 0 } }
  const reportPath = writeReport(dir, report)

  const summary = runScript('parse-report.mjs', [reportPath, '--artifact-root', dir])

  assert.equal(summary.total, 4)
  assert.equal(summary.passed, 2)
  assert.equal(summary.failed, 1)
  assert.equal(summary.flaky, 1)
  assert.equal(summary.skipped, 0)
  assert.equal(summary.failedTests.length, 1)
})

test('parse-report.mjs：根级 errors 非空表示运行未成功', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const reportPath = writeReport(dir, { suites: [], errors: [{ message: 'Config file not found' }] })

  const summary = runScript('parse-report.mjs', [reportPath, '--artifact-root', dir])

  assert.equal(summary.total, 0)
  assert.equal(summary.failed, 0)
  assert.deepEqual(summary.errors, ['Config file not found'])
})

test('parse-report.mjs：--max-failures 限量并标记截断', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const report = makeReport()
  report.suites[1].specs.push({
    title: '另一个失败',
    file: 'tests/e2e/login.spec.ts',
    line: 40,
    tests: [{ status: 'unexpected', projectName: 'chromium', results: [{ status: 'failed', error: { message: 'boom' } }] }],
  })
  const reportPath = writeReport(dir, report)

  const summary = runScript('parse-report.mjs', [reportPath, '--max-failures', '1', '--artifact-root', dir])

  assert.equal(summary.failed, 2)
  assert.equal(summary.failedTests.length, 1)
  assert.equal(summary.truncated, true)
})

test('parse-report.mjs：证据落盘到 ae/playwright-verify/reports 与 ae/logs/playwright-verify', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const reportPath = writeReport(dir, makeReport())

  const summary = runScript('parse-report.mjs', [reportPath, '--artifact-root', dir])

  const reportsDir = join(dir, 'ae', 'playwright-verify', 'reports')
  const logsDir = join(dir, 'ae', 'logs', 'playwright-verify')
  assert.ok(existsSync(reportsDir), '报告目录应落在 ae/playwright-verify/reports/')
  assert.ok(existsSync(logsDir), '日志目录应落在 ae/logs/playwright-verify/')

  const reportFiles = readdirSync(reportsDir)
  assert.equal(reportFiles.length, 1)
  assert.match(reportFiles[0], /^parse-report-.*\.json$/)
  const saved = JSON.parse(readFileSync(join(reportsDir, reportFiles[0]), 'utf8'))
  assert.equal(saved.total, summary.total)
  assert.equal(saved.failed, summary.failed)

  const logFiles = readdirSync(logsDir)
  assert.equal(logFiles.length, 1)
  assert.match(logFiles[0], /-parse-report\.log$/)
  const logText = readFileSync(join(logsDir, logFiles[0]), 'utf8')
  assert.match(logText, /本轮报告摘要/)
  assert.ok(logText.includes(join(reportsDir, reportFiles[0])), '日志首行应记录本次摘要文件路径')
})

test('parse-report.mjs：--no-artifacts 不落盘', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-parse-')
  const reportPath = writeReport(dir, makeReport())

  runScript('parse-report.mjs', [reportPath, '--artifact-root', dir, '--no-artifacts'])

  assert.equal(existsSync(join(dir, 'ae')), false)
})

/* ------------------------------------------------------------------ *
 * check-env.mjs
 * ------------------------------------------------------------------ */

test('check-env.mjs：项目根缺失时预检不通过', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-env-')
  const missing = join(dir, 'not-a-project')

  const result = runScript('check-env.mjs', ['--root', missing, '--artifact-root', dir])

  assert.equal(result.ok, false)
  assert.equal(result.root, missing)

  const checks = checksByName(result)
  assert.equal(checks['playwright-dep'].ok, false)
  assert.equal(checks.config.ok, false)
  assert.equal(checks.node.ok, true)
  // 信息项不计入 ok
  assert.equal(checks['system-browser'].informational, true)
  assert.equal(checks['ae-config'].informational, true)
  assert.equal(checks['e2e-layout'].informational, true)
})

test('check-env.mjs：既有关键项按项目现状判定', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-env-')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'demo',
    devDependencies: { '@playwright/test': '^1.49.0' },
    scripts: { 'test:e2e': 'playwright test' },
  }), 'utf8')
  writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n', 'utf8')
  mkdirSync(join(dir, 'tests', 'e2e'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'e2e', 'smoke.spec.ts'), "test('冒烟', () => {})\n", 'utf8')

  const result = runScript('check-env.mjs', ['--root', dir, '--artifact-root', dir])

  const checks = checksByName(result)
  assert.equal(checks['playwright-dep'].ok, true)
  assert.equal(checks.config.ok, true)
  assert.match(checks['npm-scripts'].detail, /test:e2e=playwright test/)
  assert.match(checks['e2e-layout'].detail, /tests\/e2e\//)
  assert.match(checks['e2e-layout'].detail, /1 spec/)
  // 硬性项全部通过才 ok；browsers 取决于宿主是否装了浏览器包，不做断言
  const hardPassed = result.checks.filter(c => !c.informational).every(c => c.ok)
  assert.equal(result.ok, hardPassed)
})

test('check-env.mjs：读取 ae.jsonc 的 ae-playwright-verify 配置分片', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-env-')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf8')
  const configPath = join(dir, 'ae.jsonc')
  writeFileSync(configPath, [
    '{',
    '  // 项目级配置（JSONC 支持注释与尾随逗号）',
    '  "ae-playwright-verify": {',
    '    "baseUrl": "http://localhost:3000",',
    '    "browser": "chrome",',
    '    "testDir": "tests/e2e-custom",',
    '    "timeoutMs": 30000',
    '  },',
    '}',
    '',
  ].join('\n'), 'utf8')
  mkdirSync(join(dir, 'tests', 'e2e-custom'), { recursive: true })

  const result = runScript('check-env.mjs', ['--root', dir, '--artifact-root', dir], { env: { AE_CONFIG: configPath } })

  const checks = checksByName(result)
  assert.equal(checks['ae-config'].informational, true)
  assert.match(checks['ae-config'].detail, /baseUrl=http:\/\/localhost:3000/)
  assert.match(checks['ae-config'].detail, /browser=chrome/)
  assert.match(checks['ae-config'].detail, /testDir=tests\/e2e-custom/)
  assert.match(checks['ae-config'].detail, /timeoutMs=30000/)
  // 配置声明的 testDir 纳入 e2e 目录勘察
  assert.match(checks['e2e-layout'].detail, /tests\/e2e-custom\//)
})

test('check-env.mjs：证据落盘到 ae/playwright-verify/reports 与 ae/logs/playwright-verify', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-env-')

  runScript('check-env.mjs', ['--root', dir, '--artifact-root', dir])

  const reportsDir = join(dir, 'ae', 'playwright-verify', 'reports')
  const logsDir = join(dir, 'ae', 'logs', 'playwright-verify')
  assert.ok(existsSync(reportsDir), '报告目录应落在 ae/playwright-verify/reports/')
  assert.ok(existsSync(logsDir), '日志目录应落在 ae/logs/playwright-verify/')

  const reportFiles = readdirSync(reportsDir)
  assert.equal(reportFiles.length, 1)
  assert.match(reportFiles[0], /^check-env-.*\.json$/)
  const saved = JSON.parse(readFileSync(join(reportsDir, reportFiles[0]), 'utf8'))
  assert.equal(typeof saved.ok, 'boolean')
  assert.ok(Array.isArray(saved.checks))

  const logFiles = readdirSync(logsDir)
  assert.equal(logFiles.length, 1)
  assert.match(logFiles[0], /-check-env\.log$/)
  const logText = readFileSync(join(logsDir, logFiles[0]), 'utf8')
  assert.match(logText, /本轮预检报告/)
})

test('check-env.mjs：--no-artifacts 不落盘', (t) => {
  const dir = makeWorkDir(t, 'ae-pwv-env-')

  runScript('check-env.mjs', ['--root', dir, '--artifact-root', dir, '--no-artifacts'])

  assert.equal(existsSync(join(dir, 'ae')), false)
})
