import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

test('规则 4：没有基准文档时要求人工确认，根因标记为 unknown', () => {
  const out = JSON.parse(run(['--json', JSON.stringify([failure()])]))
  assert.equal(out.rootCause, 'unknown')
  assert.equal(out.dispatchTarget, 'manual')
  assert.equal(out.rule, 4)
})

test('规则 3：有基准文档时输出需要语义诊断的上下文', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([failure()]),
    '--requirement', 'docs/requirements.md',
  ]))
  assert.equal(out.needsAgentDiagnosis, true)
  assert.equal(out.rule, 3)
  assert.equal(out.requirementPath, 'docs/requirements.md')
  assert.ok(out.instructions.length > 0)
})

test('规则 3 的失败项带上完整的失败字段（含 stackTrace）', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([failure()]),
    '--requirement', 'docs/requirements.md',
  ]))
  assert.equal(out.failures[0].stackTrace, 'at Object.<anonymous>')
  assert.equal(out.failures[0].expected, '1')
  assert.equal(out.failures[0].actual, '2')
})

test('用例规格路径可单独提供', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([failure()]),
    '--case-spec', 'docs/test-cases.md',
  ]))
  assert.equal(out.needsAgentDiagnosis, true)
  assert.equal(out.caseSpecPath, 'docs/test-cases.md')
})

test('集成层标识合法', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([failure({ testLayer: 'integration' })]),
    '--requirement', 'docs/requirements.md',
  ]))
  assert.equal(out.needsAgentDiagnosis, true)
  assert.equal(out.failures[0].testLayer, 'integration')
})

test('--json 接受顶层对象形态（与 --input 一致）', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify({ failures: [failure()], requirementPath: 'docs/requirements.md' }),
  ]))
  assert.equal(out.needsAgentDiagnosis, true)
  assert.equal(out.requirementPath, 'docs/requirements.md')
})

test('带 BOM 的输入文件可被解析', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ae-triage-')), 'failures.json')
  writeFileSync(file, `\uFEFF${JSON.stringify([failure()])}`, 'utf8')
  const out = JSON.parse(run(['--input', file]))
  assert.equal(out.rule, 4)
})

test('stackTrace / expected / actual 缺省时按空串补齐', () => {
  const out = JSON.parse(run([
    '--json', JSON.stringify([{ testLayer: 'unit', failureType: 'assertion', testName: 'case-2' }]),
    '--requirement', 'docs/requirements.md',
  ]))
  assert.equal(out.failures[0].stackTrace, '')
  assert.equal(out.failures[0].expected, '')
  assert.equal(out.failures[0].actual, '')
})

test('输入缺少必填字段时返回退出码 1', () => {
  assert.throws(
    () => run(['--json', JSON.stringify([{ testLayer: 'unit' }])]),
    (error) => error.status === 1,
  )
})

test('非法 testLayer 被拒绝', () => {
  assert.throws(
    () => run(['--json', JSON.stringify([failure({ testLayer: 'api' })])]),
    (error) => error.status === 1,
  )
})
