import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'write-proof.mjs')

/** 脚本在最终状态非 passed 时返回退出码 1，因此这里不抛异常。 */
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    ...options,
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function makeWorkspace() {
  return mkdtempSync(join(tmpdir(), 'ae-write-proof-'))
}

test('写入 metadata.json 并给出可复算的哈希', () => {
  const cwd = makeWorkspace()
  try {
    const output = '审查结论：passed\nstatusSummary: 未发现问题\n'
    const result = JSON.parse(run([
      '--run-id', 'run-001',
      '--status', 'passed',
      '--summary', '未发现问题',
    ], { cwd, input: output }).stdout)

    const metadata = JSON.parse(readFileSync(result.metadataPath, 'utf8'))
    assert.equal(metadata.reviewRunId, 'run-001')
    assert.equal(metadata.reviewStatus, 'passed')
    assert.equal(metadata.requestedStatus, 'passed')
    assert.match(metadata.reviewOutputHash, /^[0-9a-f]{64}$/)
    assert.ok(result.metadataPath.includes('ae'))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('存在阻断级发现时不允许标记为 passed', () => {
  const cwd = makeWorkspace()
  try {
    const output = [
      'status: passed',
      '- 严重级别：P0',
      '- 标题：任意命令执行',
    ].join('\n')
    const result = JSON.parse(run(['--run-id', 'run-002', '--status', 'passed'], { cwd, input: output }).stdout)
    assert.equal(result.reviewStatus, 'failed')
    const blocking = result.checks.find((check) => check.name === 'blocking-findings')
    assert.equal(blocking.passed, false)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('缺少 run-id 时返回退出码 1', () => {
  const cwd = makeWorkspace()
  try {
    const result = run(['--status', 'passed'], { cwd, input: 'status: passed' })
    assert.equal(result.status, 1)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('run-id 含非法字符时返回退出码 1', () => {
  const cwd = makeWorkspace()
  try {
    const result = run(['--run-id', '../escape', '--status', 'passed'], { cwd, input: 'status: passed' })
    assert.equal(result.status, 1)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
