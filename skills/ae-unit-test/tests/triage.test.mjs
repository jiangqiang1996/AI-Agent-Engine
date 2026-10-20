import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'triage.mjs')

function run(args, options = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })
}

function failure(overrides = {}) {
  return {
    testLayer: 'unit',
    failureType: 'assertion',
    testName: 'case-1',
    stackTrace: 'at Object.<anonymous>',
    expected: '1',
    actual: '2',
    ...overrides,
  }
}

test('规则 1：stack 中有语法错误判定为测试代码问题', () => {
  const out = JSON.parse(run(['--json', JSON.stringify([failure({ stackTrace: 'ReferenceError: foo is not defined' })])]))
  assert.equal(out.rootCause, 'test')
  assert.equal(out.dispatchTarget, 'self-fix')
  assert.equal(out.rule, 1)
})

test('规则 2：全部测试失败判定为环境问题', () => {
  const out = JSON.parse(run(['--json', JSON.stringify([failure(), failure()]), '--total', '2']))
  assert.equal(out.rootCause, 'env')
  assert.equal(out.dispatchTarget, 'manual')
  assert.equal(out.rule, 2)
})

test('规则 4：没有真源时要求人工确认', () => {
  const out = JSON.parse(run(['--json', JSON.stringify([failure()])]))
  assert.equal(out.dispatchTarget, 'manual')
  assert.equal(out.rule, 4)
})

test('规则 3：有真源时输出需要语义诊断的上下文', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([failure()]),
    '--prd', 'ae/prd/demo/overview.md',
  ]))
  assert.equal(out.needsAgentDiagnosis, true)
  assert.equal(out.rule, 3)
  assert.equal(out.prdPath, 'ae/prd/demo/overview.md')
  assert.ok(out.instructions.length > 0)
})

test('输入缺少必填字段时返回退出码 1', () => {
  assert.throws(
    () => run(['--json', JSON.stringify([{ testLayer: 'unit' }])]),
    (error) => error.status === 1,
  )
})

test('非法 testLayer 被拒绝', () => {
  assert.throws(
    () => run(['--json', JSON.stringify([failure({ testLayer: 'integration' })])]),
    (error) => error.status === 1,
  )
})
