import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INIT_SCRIPT = join(SKILL_DIR, 'scripts', 'init_skill.mjs')
const VALIDATE_SCRIPT = join(SKILL_DIR, 'scripts', 'quick_validate.mjs')

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ae-skill-test-'))
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

function writeSkill(dir, name, frontmatter, body = '# x\n\n正文\n') {
  const skillDir = join(dir, name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`, 'utf8')
  return skillDir
}

test('init_skill 生成 frontmatter 合规的技能骨架', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['--name', 'api-tester', '--description', '接口联调。Use for API integration testing.', '--output', dir])
    const skillDir = join(dir, 'api-tester')
    assert.ok(existsSync(join(skillDir, 'SKILL.md')), '应生成 SKILL.md')
    assert.ok(existsSync(join(skillDir, 'references')), '应创建 references 目录')
    assert.ok(existsSync(join(skillDir, 'scripts')), '应创建 scripts 目录')

    const text = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
    assert.match(text, /^---\nname: api-tester\n/)
    assert.match(text, /\nlicense: GPL-3\.0-or-later\n/)
    assert.match(text, /\nmetadata:\n {2}author: ae-skills\n {2}version: "1\.0\.0"\n/)
  })
})

test('init_skill 拒绝覆盖既有技能，--force 才允许覆盖', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['--name', 'api-tester', '--output', dir])
    const output = runExpectFailure(INIT_SCRIPT, ['--name', 'api-tester', '--output', dir])
    assert.match(output, /拒绝覆盖/)

    run(INIT_SCRIPT, ['--name', 'api-tester', '--output', dir, '--force'])
    assert.ok(existsSync(join(dir, 'api-tester', 'SKILL.md')))
  })
})

test('init_skill 拒绝非法技能名与非法输出路径', () => {
  withTempDir((dir) => {
    assert.match(runExpectFailure(INIT_SCRIPT, ['--name', 'Bad Name', '--output', dir]), /kebab-case/)

    const filePath = join(dir, 'not-a-dir')
    writeFileSync(filePath, 'x', 'utf8')
    assert.match(runExpectFailure(INIT_SCRIPT, ['--name', 'x', '--output', filePath]), /不是目录/)
  })
})

test('quick_validate 校验通过合规技能', () => {
  withTempDir((dir) => {
    run(INIT_SCRIPT, ['--name', 'api-tester', '--output', dir])
    const output = run(VALIDATE_SCRIPT, [join(dir, 'api-tester')])
    assert.match(output, /校验通过/)
  })
})

test('quick_validate 检出 name 与目录名不一致', () => {
  withTempDir((dir) => {
    const skillDir = writeSkill(dir, 'api-tester', 'name: other\ndescription: d')
    const output = runExpectFailure(VALIDATE_SCRIPT, [skillDir])
    assert.match(output, /与目录名/)
  })
})

test('quick_validate 检出非规范 frontmatter 字段', () => {
  withTempDir((dir) => {
    const skillDir = writeSkill(dir, 'api-tester', 'name: api-tester\ndescription: d\nversion: "1.0"')
    const output = runExpectFailure(VALIDATE_SCRIPT, [skillDir])
    assert.match(output, /非规范字段/)
  })
})

test('quick_validate 检出 metadata 非字符串值', () => {
  withTempDir((dir) => {
    const skillDir = writeSkill(dir, 'api-tester', 'name: api-tester\ndescription: d\nmetadata:\n  version: 1.0')
    const output = runExpectFailure(VALIDATE_SCRIPT, [skillDir])
    assert.match(output, /metadata\.version/)
  })
})

test('quick_validate 检出正文引用缺失文件', () => {
  withTempDir((dir) => {
    const skillDir = writeSkill(
      dir,
      'api-tester',
      'name: api-tester\ndescription: d',
      '# x\n\n参见 `references/missing.md`\n',
    )
    const output = runExpectFailure(VALIDATE_SCRIPT, [skillDir])
    assert.match(output, /正文引用的文件不存在/)
  })
})
