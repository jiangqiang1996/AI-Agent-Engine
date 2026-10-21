import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'parse-report.mjs')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'e2e-suite-report-'))
}

function writeReport(dir, name, data, encoding = 'utf8') {
  const file = join(dir, name)
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  if (encoding === 'utf8-bom') {
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]))
  } else if (encoding === 'utf16le') {
    writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]))
  } else {
    writeFileSync(file, Buffer.from(text, 'utf8'))
  }
  return file
}

/** 构造 Playwright JSON reporter 形态的报告：failureCount 个失败用例 + passCount 个通过用例 */
function buildReport(failureCount, passCount = 0, extra = {}) {
  const specs = []
  for (let i = 0; i < failureCount; i++) {
    specs.push({
      title: `失败用例 ${i}`,
      file: `tests/e2e/spec-${i}.spec.ts`,
      line: i + 1,
      tests: [{
        status: 'unexpected',
        projectName: 'chromium',
        results: [{
          status: 'failed',
          error: { message: `断言失败 ${i}` },
          attachments: [{ name: 'screenshot', path: `shot-${i}.png`, contentType: 'image/png' }],
        }],
      }],
    })
  }
  for (let i = 0; i < passCount; i++) {
    specs.push({
      title: `通过用例 ${i}`,
      file: `tests/e2e/spec-ok-${i}.spec.ts`,
      line: i + 1,
      tests: [{ status: 'expected', projectName: 'chromium', results: [{ status: 'passed' }] }],
    })
  }
  return { suites: [{ title: 'suite', specs }], ...extra }
}

function parseStdout(result) {
  const line = result.stdout.trim().split('\n').filter(Boolean).pop()
  assert.ok(line, `脚本无 stdout 输出: ${result.stderr}`)
  return JSON.parse(line)
}

test('UTF-8（无 BOM）报告可解析', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(2, 1))
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.total, 3)
    assert.equal(out.failed, 2)
    assert.equal(out.passed, 1)
    assert.equal(out.failedTests.length, 2)
    assert.equal(out.failedTests[0].title, '失败用例 0 ｜ chromium')
    assert.equal(out.failedTests[0].file, 'tests/e2e/spec-0.spec.ts')
    assert.equal(out.failedTests[0].line, 1)
    assert.ok(out.failedTests[0].error.includes('断言失败 0'), out.failedTests[0].error)
    assert.deepEqual(out.failedTests[0].attachments, [
      { name: 'screenshot', path: 'shot-0.png', contentType: 'image/png' },
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('UTF-8 BOM 报告可解析（非 ASCII 标题不损坏）', () => {
  const dir = tempDir()
  try {
    const report = buildReport(1)
    report.suites[0].specs[0].title = '中文用例标题'
    const file = writeReport(dir, 'pw-report-bom.json', report, 'utf8-bom')
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.failed, 1)
    assert.ok(out.failedTests[0].title.includes('中文用例标题'), out.failedTests[0].title)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('UTF-16LE BOM 报告可解析（PowerShell 重定向兜底）', () => {
  const dir = tempDir()
  try {
    const report = buildReport(1)
    report.suites[0].specs[0].title = '中文用例标题'
    const file = writeReport(dir, 'pw-report-utf16.json', report, 'utf16le')
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.failed, 1)
    assert.ok(out.failedTests[0].title.includes('中文用例标题'), out.failedTests[0].title)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('报告文件缺失 → exit 2 + 中文提示', () => {
  const dir = tempDir()
  try {
    const r = run([join(dir, 'missing.json')])
    assert.equal(r.status, 2, `stdout=${r.stdout}`)
    assert.ok(r.stderr.includes('报告读取失败'), r.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('报告内容非合法 JSON → exit 2 + 中文提示', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'bad.json', '{ 非法 JSON')
    const r = run([file])
    assert.equal(r.status, 2, `stdout=${r.stdout}`)
    assert.ok(r.stderr.includes('报告读取失败'), r.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('缺少报告路径参数 → exit 2', () => {
  const r = run([])
  assert.equal(r.status, 2, `stdout=${r.stdout}`)
  assert.ok(r.stderr.includes('缺少报告路径参数'), r.stderr)
})

test('--max-failures 非法值 → exit 2', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(1))
    const r = run([file, '--max-failures', 'abc'])
    assert.equal(r.status, 2, `stdout=${r.stdout}`)
    assert.ok(r.stderr.includes('--max-failures'), r.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stats 段存在时以其为准（覆盖 walk 口径计数）', () => {
  const dir = tempDir()
  try {
    const report = buildReport(1, 1, { stats: { expected: 7, unexpected: 3, flaky: 1, skipped: 2 } })
    const file = writeReport(dir, 'pw-report.json', report)
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.passed, 7)
    assert.equal(out.failed, 3)
    assert.equal(out.flaky, 1)
    assert.equal(out.skipped, 2)
    assert.equal(out.total, 13)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('stats 缺失时按 walk 口径计数', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(2, 3))
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.total, 5)
    assert.equal(out.failed, 2)
    assert.equal(out.passed, 3)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('失败数恰好等于上限 → truncated=false', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(2))
    const r = run([file, '--max-failures', '2'])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.failed, 2)
    assert.equal(out.failedTests.length, 2)
    assert.equal(out.truncated, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('失败数超过上限 → truncated=true 且只保留前 N 项', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(5))
    const r = run([file, '--max-failures', '2'])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.failed, 5)
    assert.equal(out.failedTests.length, 2)
    assert.equal(out.truncated, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('失败数少于上限 → truncated=false', () => {
  const dir = tempDir()
  try {
    const file = writeReport(dir, 'pw-report.json', buildReport(1))
    const r = run([file, '--max-failures', '10'])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.failedTests.length, 1)
    assert.equal(out.truncated, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('根级 errors 非空时透出（运行未成功信号）', () => {
  const dir = tempDir()
  try {
    const report = buildReport(0, 1, { errors: [{ message: 'global setup 失败' }] })
    const file = writeReport(dir, 'pw-report.json', report)
    const r = run([file])
    assert.equal(r.status, 0, r.stderr)
    const out = parseStdout(r)
    assert.equal(out.errors.length, 1)
    assert.ok(out.errors[0].includes('global setup 失败'), out.errors[0])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
