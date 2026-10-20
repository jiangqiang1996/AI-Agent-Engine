import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(SKILL_DIR, 'scripts', 'scope-analyze.mjs')

function run(args) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
}

test('代码文件触发代码审查角色', () => {
  const out = JSON.parse(run(['--files', 'src/app.ts,src/util.ts', '--mode', 'changes']))
  assert.ok(out.roles.includes('ocr-reviewer'))
  assert.equal(out.stats.codeFiles, 2)
  assert.equal(out.stats.docFiles, 0)
})

test('文档文件触发文档审查角色', () => {
  const out = JSON.parse(run(['--files', 'README.md', '--mode', 'full']))
  assert.ok(out.roles.includes('document-reviewer'))
  assert.equal(out.stats.docFiles, 1)
})

test('设计文档按文件名匹配维度并激活对应角色', () => {
  const out = JSON.parse(run(['--files', 'ae/design/user-auth-2026-01-01/security.md,ae/design/user-auth-2026-01-01/api.md']))
  assert.ok(out.roles.includes('security-design-reviewer'))
  assert.ok(out.roles.includes('api-design-reviewer'))
  assert.ok(out.dimensions.includes('security'))
  assert.ok(out.dimensions.includes('api'))
})

test('排除二进制与锁文件', () => {
  const out = JSON.parse(run(['--files', 'a.png,b.lock,package-lock.json,c.ts']))
  assert.equal(out.stats.excludedFiles, 3)
  assert.ok(!out.reviewFiles.includes('a.png'))
})

test('未显式给 goals 时自动推断审查目标', () => {
  const out = JSON.parse(run(['--files', 'src/a.ts', '--mode', 'changes']))
  assert.ok(out.goals.length > 0)
  assert.match(out.goals, /变更/)
  assert.ok(out.roles.includes('goal-alignment-reviewer'))
})

test('显式 goals 时透传且仍激活目标对齐角色', () => {
  const out = JSON.parse(run(['--files', 'src/a.ts', '--goals', '只检查空指针']))
  assert.equal(out.goals, '只检查空指针')
  assert.ok(out.roles.includes('goal-alignment-reviewer'))
})

test('每个角色都产出可用的提示词与角色卡路径', () => {
  const out = JSON.parse(run(['--files', 'src/a.ts,README.md']))
  assert.ok(out.tasks.length > 0)
  for (const task of out.tasks) {
    assert.ok(task.prompt.length > 0)
    assert.match(task.roleCard, /^references\/roles\//)
  }
})

test('非设计文档需要额外做维度内容检查', () => {
  const out = JSON.parse(run(['--files', 'docs/guide.md']))
  assert.equal(out.manualDimensionCheck, true)
})
