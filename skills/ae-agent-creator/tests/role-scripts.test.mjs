import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INIT_SCRIPT = join(SKILL_DIR, 'scripts', 'init_role.mjs')
const VALIDATE_SCRIPT = join(SKILL_DIR, 'scripts', 'quick_validate.mjs')

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ae-role-test-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function run(script, args) {
  return execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })
}

function runExpectFailure(script, args) {
  try {
    execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  throw new Error('命令本应失败但成功了')
}

test('init_role 生成包含五个固定段落的角色卡', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['security-reviewer', '--output', dir, '--title', '安全设计审查者'])
    const card = join(dir, 'references', 'roles', 'security-reviewer.md')
    assert.ok(existsSync(card), '角色卡应写到 references/roles/<role>.md')
    const text = readFileSync(card, 'utf8')
    assert.match(text, /^# 角色：安全设计审查者/)
    for (const section of ['职责', '触发条件', '输入契约', '输出契约', '工作流']) {
      assert.ok(text.includes(`## ${section}`), `缺少段落 ${section}`)
    }
  })
})

test('init_role 拒绝覆盖既有角色卡', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['reviewer', '--output', dir])
    const output = runExpectFailure(INIT_SCRIPT, ['reviewer', '--output', dir])
    assert.match(output, /拒绝覆盖/)
  })
})

test('init_role 拒绝非法角色名', () => {
  withTempDir((dir) => {
    const output = runExpectFailure(INIT_SCRIPT, ['Bad_Name', '--output', dir])
    assert.match(output, /kebab-case/)
  })
})

test('quick_validate 校验通过规范角色卡', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['reviewer', '--output', dir])
    const output = run(VALIDATE_SCRIPT, [dir])
    assert.match(output, /校验通过/)
  })
})

test('quick_validate 检出缺失段落', () => {
  withTempDir((dir) => {
    const roles = join(dir, 'references', 'roles')
    mkdirSync(roles, { recursive: true })
    writeFileSync(
      join(roles, 'broken.md'),
      ['# 角色：坏卡', '', '## 职责', '', '- 负责：x', '', '## 触发条件', '', '- 派发：x', ''].join('\n'),
      'utf8',
    )
    const output = runExpectFailure(VALIDATE_SCRIPT, [dir])
    assert.match(output, /缺少段落: ## 输出契约/)
  })
})

test('quick_validate 检出宿主专属语法', () => {
  withTempDir((dir) => {
    const roles = join(dir, 'references', 'roles')
    mkdirSync(roles, { recursive: true })
    writeFileSync(
      join(roles, 'host.md'),
      [
        '# 角色：宿主卡',
        '',
        '## 职责',
        '',
        '- 负责：使用宿主专属名 opencode',
        '',
        '## 触发条件',
        '',
        '- 派发：x',
        '',
        '## 输入契约',
        '',
        '- 输入：x',
        '',
        '## 输出契约',
        '',
        '- 输出：x',
        '',
        '## 工作流',
        '',
        '1. x',
        '',
      ].join('\n'),
      'utf8',
    )
    const output = runExpectFailure(VALIDATE_SCRIPT, [dir])
    assert.match(output, /宿主专属/)
  })
})
