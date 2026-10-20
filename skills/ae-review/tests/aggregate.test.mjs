import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'aggregate.mjs')

function run(args) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

test('union 策略合并发现并按标题去重', () => {
  const input = {
    results: [
      { status: 'success', output: '', evidence: ['e1'], findings: [{ severity: 'P2', title: '空指针风险' }] },
      { status: 'success', output: '', evidence: ['e2'], findings: [{ severity: 'P0', title: '空指针风险' }] },
    ],
    dispatchedAgents: ['a', 'b'],
  }
  const out = JSON.parse(run(['--strategy', 'union', '--json', JSON.stringify(input)]))
  assert.equal(out.findings.length, 1)
  assert.equal(out.findings[0].severity, 'P0', '同标题应保留最高严重级别')
  assert.deepEqual(out.dispatchManifest.dispatched, ['a', 'b'])
  assert.equal(out.status, 'success')
})

test('缺少 findings 时从输出文本正则兜底提取', () => {
  const input = {
    results: [
      { status: 'success', output: '发现如下问题：\n- 严重级别：P1\n- 标题：缺少参数校验', evidence: [] },
    ],
  }
  const out = JSON.parse(run(['--strategy', 'union', '--json', JSON.stringify(input)]))
  assert.equal(out.findings.length, 1)
  assert.equal(out.findings[0].severity, 'P1')
  assert.equal(out.findings[0].title, '缺少参数校验')
})

test('reduce 策略统计各状态数量', () => {
  const input = {
    results: [
      { status: 'success', output: 'a', evidence: [] },
      { status: 'partial', output: 'b', evidence: [] },
      { status: 'failed', output: 'c', evidence: [] },
    ],
  }
  const out = JSON.parse(run(['--strategy', 'reduce', '--json', JSON.stringify(input)]))
  assert.equal(out.status, 'failed')
  assert.match(out.summary, /1 成功/)
  assert.match(out.summary, /1 部分/)
  assert.match(out.summary, /1 失败/)
})

test('best-of 策略选择第一个成功结果', () => {
  const input = {
    results: [
      { status: 'failed', output: 'bad', evidence: [] },
      { status: 'success', output: 'good', evidence: ['x'] },
    ],
  }
  const out = JSON.parse(run(['--strategy', 'best-of', '--json', JSON.stringify(input)]))
  assert.equal(out.status, 'success')
  assert.equal(out.summary, 'good')
  assert.deepEqual(out.evidence, ['x'])
})

test('非法策略返回退出码 2', () => {
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, '--strategy', 'nope', '--json', '[]'], { encoding: 'utf8', stdio: 'pipe' }),
    (error) => error.status === 2,
  )
})

test('空输入返回退出码 1', () => {
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, '--strategy', 'union', '--json', '[]'], { encoding: 'utf8', stdio: 'pipe' }),
    (error) => error.status === 1,
  )
})
