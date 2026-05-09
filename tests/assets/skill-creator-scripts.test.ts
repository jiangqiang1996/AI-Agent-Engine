import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

const INIT_SCRIPT = join(process.cwd(), 'src/assets/skills/ae-skill-creator/scripts/init_skill.mjs')
const VALIDATE_SCRIPT = join(process.cwd(), 'src/assets/skills/ae-skill-creator/scripts/quick_validate.mjs')
const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'skill-creator-'))
  tempDirs.push(dir)
  return dir
}

function runNode(args: string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('skill-creator 脚本', () => {
  it('应该默认创建项目级技能和同级命令', () => {
    const projectRoot = createTempDir()
    const home = createTempDir()

    const init = runNode([INIT_SCRIPT, 'test-skill', '--description', '测试技能', '--project-root', projectRoot, '--home', home])
    expect(init.status, init.stderr).toBe(0)

    const skillFile = join(projectRoot, '.opencode/skills/test-skill/SKILL.md')
    const commandFile = join(projectRoot, '.opencode/commands/test-skill.md')
    expect(readFileSync(skillFile, 'utf8')).toContain('name: test-skill')
    expect(readFileSync(commandFile, 'utf8')).toContain('$ARGUMENTS')
    expect(existsSync(join(home, '.config/opencode/skills/test-skill'))).toBe(false)

    const validate = runNode([VALIDATE_SCRIPT, join(projectRoot, '.opencode/skills/test-skill'), '--with-command'])
    expect(validate.status, validate.stderr).toBe(0)
  })

  it('应该在隔离 home 中创建全局级技能和命令', () => {
    const projectRoot = createTempDir()
    const home = createTempDir()

    const init = runNode([INIT_SCRIPT, 'global-skill', '--global', '--home', home, '--project-root', projectRoot])
    expect(init.status, init.stderr).toBe(0)

    const skillDir = join(home, '.config/opencode/skills/global-skill')
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('name: global-skill')
    expect(readFileSync(join(home, '.config/opencode/commands/global-skill.md'), 'utf8')).toContain('global-skill')
    expect(existsSync(join(projectRoot, '.opencode/skills/global-skill'))).toBe(false)

    const validate = runNode([VALIDATE_SCRIPT, skillDir, '--with-command'])
    expect(validate.status, validate.stderr).toBe(0)
  })

  it('不应该创建旧兼容路径', () => {
    const projectRoot = createTempDir()

    const init = runNode([INIT_SCRIPT, 'test-skill', '--project-root', projectRoot])

    expect(init.status, init.stderr).toBe(0)
    expect(existsSync(join(projectRoot, '.claude/skills/test-skill'))).toBe(false)
    expect(existsSync(join(projectRoot, '.agents/skills/test-skill'))).toBe(false)
  })

  it('应该支持只创建技能而不创建命令', () => {
    const projectRoot = createTempDir()

    const init = runNode([INIT_SCRIPT, 'test-skill', '--no-command', '--project-root', projectRoot])
    expect(init.status, init.stderr).toBe(0)

    const skillDir = join(projectRoot, '.opencode/skills/test-skill')
    expect(readFileSync(join(skillDir, 'SKILL.md'), 'utf8')).toContain('name: test-skill')
    expect(existsSync(join(projectRoot, '.opencode/commands/test-skill.md'))).toBe(false)

    const validate = runNode([VALIDATE_SCRIPT, skillDir])
    expect(validate.status, validate.stderr).toBe(0)
  })

  it('应该支持只创建命令并写入自包含流程', () => {
    const projectRoot = createTempDir()

    const init = runNode([
      INIT_SCRIPT,
      'test-command',
      '--command-only',
      '--description',
      '测试命令',
      '--project-root',
      projectRoot,
    ])
    expect(init.status, init.stderr).toBe(0)

    const commandFile = join(projectRoot, '.opencode/commands/test-command.md')
    const commandContent = readFileSync(commandFile, 'utf8')
    expect(commandContent).toContain('description: "测试命令"')
    expect(commandContent).toContain('不要尝试加载同名技能')
    expect(commandContent).toContain('$ARGUMENTS')
    expect(existsSync(join(projectRoot, '.opencode/skills/test-command/SKILL.md'))).toBe(false)

    const validate = runNode([VALIDATE_SCRIPT, '--command-file', commandFile])
    expect(validate.status, validate.stderr).toBe(0)
  })

  it('quick_validate 应该允许 OpenCode 支持的 skill 和 command 可选 frontmatter', () => {
    const projectRoot = createTempDir()
    const skillDir = join(projectRoot, '.opencode/skills/test-skill')
    const commandDir = join(projectRoot, '.opencode/commands')
    mkdirSync(skillDir, { recursive: true })
    mkdirSync(commandDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: test-skill',
        'description: 测试技能',
        'license: MIT',
        'compatibility: opencode',
        'metadata:',
        '  audience: maintainer',
        '---',
        '# 技能说明',
      ].join('\n'),
    )
    writeFileSync(
      join(commandDir, 'test-skill.md'),
      ['---', 'description: 测试命令', 'agent: plan', 'subtask: true', 'model: provider/model', '---', '$ARGUMENTS'].join('\n'),
    )

    const validate = runNode([VALIDATE_SCRIPT, skillDir, '--with-command'])

    expect(validate.status, validate.stderr).toBe(0)
  })

  it('应该拒绝同时传入只创建技能和只创建命令', () => {
    const projectRoot = createTempDir()

    const init = runNode([INIT_SCRIPT, 'test-skill', '--no-command', '--command-only', '--project-root', projectRoot])

    expect(init.status).not.toBe(0)
    expect(init.stderr).toContain('不能同时使用')
  })

  it('应该拒绝命令文件校验与技能目录校验参数混用', () => {
    const projectRoot = createTempDir()

    expect(runNode([INIT_SCRIPT, 'test-command', '--command-only', '--project-root', projectRoot]).status).toBe(0)
    const commandFile = join(projectRoot, '.opencode/commands/test-command.md')
    const mixedTarget = runNode([VALIDATE_SCRIPT, join(projectRoot, '.opencode/skills/test-command'), '--command-file', commandFile])
    const mixedWithCommand = runNode([VALIDATE_SCRIPT, '--command-file', commandFile, '--with-command'])

    expect(mixedTarget.status).not.toBe(0)
    expect(mixedTarget.stderr).toContain('不能同时使用')
    expect(mixedWithCommand.status).not.toBe(0)
    expect(mixedWithCommand.stderr).toContain('只能与 skill-dir 一起使用')
  })

  it('应该拒绝非法名称', () => {
    const projectRoot = createTempDir()

    const init = runNode([INIT_SCRIPT, 'Bad_Name', '--project-root', projectRoot])

    expect(init.status).not.toBe(0)
    expect(init.stderr).toContain('技能名必须')
  })

  it('应该拒绝覆盖已有技能文件', () => {
    const projectRoot = createTempDir()

    expect(runNode([INIT_SCRIPT, 'test-skill', '--project-root', projectRoot]).status).toBe(0)
    const conflict = runNode([INIT_SCRIPT, 'test-skill', '--project-root', projectRoot])

    expect(conflict.status).not.toBe(0)
    expect(conflict.stderr).toContain('拒绝覆盖')
  })

  it('应该在已有命令文件冲突时拒绝创建半成品技能', () => {
    const projectRoot = createTempDir()
    const commandDir = join(projectRoot, '.opencode/commands')
    mkdirSync(commandDir, { recursive: true })
    writeFileSync(join(commandDir, 'test-skill.md'), 'existing', 'utf8')

    const conflict = runNode([INIT_SCRIPT, 'test-skill', '--project-root', projectRoot])

    expect(conflict.status).not.toBe(0)
    expect(conflict.stderr).toContain('拒绝覆盖')
    expect(existsSync(join(projectRoot, '.opencode/skills/test-skill/SKILL.md'))).toBe(false)
  })
})
