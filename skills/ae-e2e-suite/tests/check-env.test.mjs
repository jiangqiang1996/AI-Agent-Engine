import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'check-env.mjs')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'e2e-suite-checkenv-'))
}

function parseStdout(result) {
  const line = result.stdout.trim().split('\n').filter(Boolean).pop()
  assert.ok(line, `脚本无 stdout 输出: ${result.stderr}`)
  return JSON.parse(line)
}

function findCheck(payload, name) {
  const item = payload.checks.find(c => c.name === name)
  assert.ok(item, `缺少检查项 ${name}: ${JSON.stringify(payload.checks.map(c => c.name))}`)
  return item
}

test('--root <路径> 空格写法被接受并生效', () => {
  const root = tempRoot()
  try {
    const r = run(['--root', root])
    assert.equal(r.status, 0, r.stderr)
    assert.equal(parseStdout(r).root, resolve(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--root=<路径> 等号写法被接受并生效', () => {
  const root = tempRoot()
  try {
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    assert.equal(parseStdout(r).root, resolve(root))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--config=<路径> 等号写法被接受并生效', () => {
  const root = tempRoot()
  try {
    const r = run([`--root=${root}`, '--config=playwright.custom.config.ts'])
    assert.equal(r.status, 0, r.stderr)
    const config = findCheck(parseStdout(r), 'config')
    assert.equal(config.ok, false)
    assert.ok(config.detail.includes('playwright.custom.config.ts'), config.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('--electron-entry=<路径> 等号写法被接受并生效', () => {
  const root = tempRoot()
  try {
    const r = run([`--root=${root}`, '--electron-entry=out/main/index.js'])
    assert.equal(r.status, 0, r.stderr)
    const entry = findCheck(parseStdout(r), 'electron-entry')
    assert.equal(entry.ok, false)
    assert.equal(entry.detail, resolve(root, 'out', 'main', 'index.js'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('未知参数（空格写法）被拒绝：exit 2 + 中文提示', () => {
  const r = run(['--bogus'])
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`)
  assert.ok(r.stderr.includes('未知参数'), r.stderr)
  assert.ok(r.stderr.includes('--bogus'), r.stderr)
})

test('未知参数（等号写法）被拒绝：exit 2 + 中文提示', () => {
  const r = run(['--bogus=1'])
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`)
  assert.ok(r.stderr.includes('未知参数'), r.stderr)
  assert.ok(r.stderr.includes('--bogus'), r.stderr)
})

test('选项缺取值被拒绝：exit 2 + 中文提示', () => {
  const r = run(['--root'])
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`)
  assert.ok(r.stderr.includes('缺少取值'), r.stderr)
})

test('--root=<空值> 被拒绝：exit 2', () => {
  const r = run(['--root='])
  assert.equal(r.status, 2, `stdout=${r.stdout} stderr=${r.stderr}`)
  assert.ok(r.stderr.includes('缺少取值'), r.stderr)
})

test('npm-scripts 信息项恒定存在：package.json 有测试脚本时列出脚本', () => {
  const root = tempRoot()
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'demo',
        scripts: { test: 'vitest run', 'test:e2e': 'playwright test', build: 'vite build' },
      }),
      'utf-8',
    )
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    const item = findCheck(parseStdout(r), 'npm-scripts')
    assert.equal(item.informational, true)
    assert.ok(item.detail.includes('test:e2e='), item.detail)
    assert.ok(item.detail.includes('test='), item.detail)
    assert.ok(!item.detail.includes('build='), item.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('npm-scripts 信息项恒定存在：package.json 缺失时给出缺失说明', () => {
  const root = tempRoot()
  try {
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    const item = findCheck(parseStdout(r), 'npm-scripts')
    assert.equal(item.informational, true)
    assert.ok(item.detail.includes('package.json 缺失'), item.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('npm-scripts 信息项恒定存在：package.json 解析失败时给出解析失败说明', () => {
  const root = tempRoot()
  try {
    writeFileSync(join(root, 'package.json'), '{ 这不是合法 JSON', 'utf-8')
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    const item = findCheck(parseStdout(r), 'npm-scripts')
    assert.equal(item.informational, true)
    assert.ok(item.detail.includes('package.json 解析失败'), item.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('npm-scripts 信息项恒定存在：package.json 无 scripts 时给出补齐提示', () => {
  const root = tempRoot()
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf-8')
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    const item = findCheck(parseStdout(r), 'npm-scripts')
    assert.equal(item.informational, true)
    assert.ok(item.detail.includes('无测试相关脚本'), item.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('信息项不计入 ok 判定，硬性项失败时 ok=false', () => {
  const root = tempRoot()
  try {
    const r = run([`--root=${root}`])
    assert.equal(r.status, 0, r.stderr)
    const payload = parseStdout(r)
    const informational = payload.checks.filter(c => c.informational).map(c => c.name)
    assert.ok(informational.includes('npm-scripts'), informational.join(','))
    assert.ok(informational.includes('e2e-layout'), informational.join(','))
    assert.ok(informational.includes('artifacts'), informational.join(','))
    // 空目录缺 Playwright 依赖与配置 → 硬性项失败
    assert.equal(payload.ok, false)
    assert.equal(findCheck(payload, 'playwright-dep').ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
