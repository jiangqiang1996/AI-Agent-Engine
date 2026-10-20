#!/usr/bin/env node
/**
 * ae-pdf 脚本单元测试
 *
 * 只覆盖「参数解析 / 错误路径」，不依赖 npm 依赖是否安装：
 * 即使 skills/ae-pdf/node_modules 不存在，本文件也必须全部通过。
 *
 * 运行：node --test skills/ae-pdf/tests/pdf.test.mjs
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const SKILL_DIR = path.resolve(TEST_DIR, '..')
const SCRIPT = path.join(SKILL_DIR, 'scripts', 'pdf.mjs')
const PACKAGE_JSON = path.join(SKILL_DIR, 'package.json')

const OPERATIONS = [
  'create',
  'merge',
  'split',
  'extract-text',
  'fill-form',
  'rotate-pages',
  'delete-pages',
  'add-watermark',
  'add-pages',
  'update-page',
  'to-markdown',
  'to-image',
]

/** 在临时目录里执行脚本，避免污染仓库 */
let workDir = ''

before(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'ae-pdf-test-'))
})

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true })
})

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: workDir,
    encoding: 'utf8',
    windowsHide: true,
  })
}

function parseStdoutJson(result) {
  assert.ok(result.stdout.trim().length > 0, 'stdout 应包含 JSON')
  return JSON.parse(result.stdout)
}

/* ------------------------------------------------------------------ *
 * 基础结构
 * ------------------------------------------------------------------ */

test('技能目录结构完整：SKILL.md / scripts/pdf.mjs / package.json', () => {
  assert.ok(existsSync(path.join(SKILL_DIR, 'SKILL.md')), '缺少 SKILL.md')
  assert.ok(existsSync(SCRIPT), '缺少 scripts/pdf.mjs')
  assert.ok(existsSync(PACKAGE_JSON), '缺少 package.json')
})

test('脚本语法合法', () => {
  const checked = spawnSync(process.execPath, ['--check', SCRIPT], { encoding: 'utf8' })
  assert.equal(checked.status, 0, `语法检查失败：${checked.stderr}`)
})

test('package.json 声明了脚本依赖与 setup 命令', () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.scripts?.setup, 'npm install --omit=dev')
  for (const dep of [
    'pdf-lib',
    '@pdf-lib/fontkit',
    'pdfjs-dist',
    '@napi-rs/canvas',
    'turndown',
    'mdast-util-from-markdown',
  ]) {
    assert.ok(pkg.dependencies?.[dep], `package.json 缺少依赖 ${dep}`)
  }
})

/* ------------------------------------------------------------------ *
 * --help
 * ------------------------------------------------------------------ */

test('--help 输出全部操作名并以 0 退出', () => {
  const result = run(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /用法：/)
  for (const operation of OPERATIONS) {
    assert.ok(result.stdout.includes(operation), `--help 未列出操作 ${operation}`)
  }
})

test('--help 列出关键参数', () => {
  const result = run(['--help'])
  for (const flag of [
    '--file',
    '--files',
    '--output',
    '--pages',
    '--elements',
    '--page-index',
    '--page-indices',
    '--fields',
    '--watermark',
    '--json',
  ]) {
    assert.ok(result.stdout.includes(flag), `--help 未列出参数 ${flag}`)
  }
})

/* ------------------------------------------------------------------ *
 * 错误路径
 * ------------------------------------------------------------------ */

test('未知操作时报错并列出可用操作', () => {
  const result = run(['not-an-operation'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /未知操作/)
  for (const operation of OPERATIONS) {
    assert.ok(result.stderr.includes(operation), `错误信息未列出操作 ${operation}`)
  }
})

test('缺少操作名时报错', () => {
  const result = run([])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少操作名/)
})

test('输入文件不存在时报错（且不因缺少依赖而中断）', () => {
  const missing = path.join(workDir, 'not-exist.pdf')
  const result = run(['extract-text', '--file', missing])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /文件不存在/)
  assert.ok(result.stderr.includes(missing), '错误信息应包含缺失文件路径')
  assert.doesNotMatch(result.stderr, /缺少依赖/, '参数校验不应触发依赖加载')
})

test('缺少必填 --file 时报错', () => {
  const result = run(['extract-text'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--file/)
})

test('未知参数时报错', () => {
  const result = run(['extract-text', '--file', 'x.pdf', '--not-a-flag', '1'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /未知参数/)
})

test('merge 缺少 --files 时报错', () => {
  const result = run(['merge'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--files/)
})

test('delete-pages 缺少 --page-indices 时报错', () => {
  const result = run(['delete-pages', '--file', 'x.pdf'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--page-indices/)
})

test('update-page 缺少 --page-index 时报错', () => {
  const result = run(['update-page', '--file', 'x.pdf', '--elements', '[]'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--page-index/)
})

test('多余的位置参数时报错', () => {
  const result = run(['extract-text', 'extra.pdf'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /多余参数/)
})

/* ------------------------------------------------------------------ *
 * 输出契约
 * ------------------------------------------------------------------ */

test('失败时 stdout 输出 ok:false 的 JSON', () => {
  const result = run(['not-an-operation', '--json'])
  assert.notEqual(result.status, 0)
  const payload = parseStdoutJson(result)
  assert.equal(payload.ok, false)
  assert.equal(payload.operation, 'not-an-operation')
  assert.ok(typeof payload.error === 'string' && payload.error.length > 0)
})

test('失败时不输出堆栈（只有可读的错误信息）', () => {
  const result = run(['extract-text', '--file', path.join(workDir, 'missing.pdf')])
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stderr, /at .*\(.*:\d+:\d+\)/, 'stderr 不应包含调用栈')
  assert.doesNotMatch(result.stderr, /\s+at\s/, 'stderr 不应包含调用栈行')
})
