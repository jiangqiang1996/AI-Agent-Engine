import { access, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const initScript = path.resolve('src/assets/skills/ae-agent-creator/scripts/init_agent.mjs')
const validateScript = path.resolve('src/assets/skills/ae-agent-creator/scripts/quick_validate.mjs')
const validAgentContent = '---\ndescription: ok\nmode: subagent\n---\n# Role\n\n## Workflow\n'

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'agent-creator-test-'))
}

async function runNode(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
  })
}

async function expectNodeFail(args: string[], env: NodeJS.ProcessEnv = {}) {
  try {
    await runNode(args, env)
  } catch (error) {
    return error as { stderr?: string; stdout?: string }
  }

  throw new Error('命令应失败但成功了')
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

describe('ae-agent-creator 脚本', () => {
  it('应该默认创建项目级代理，并可创建同级命令', async () => {
    const root = await tempDir()

    await runNode([initScript, 'test-agent', '--project-root', root])
    await runNode([initScript, 'test-command-agent', '--command', '--project-root', root])

    const agent = await readFile(path.join(root, '.opencode/agents/test-agent.md'), 'utf8')
    const command = await readFile(path.join(root, '.opencode/commands/test-command-agent.md'), 'utf8')

    expect(agent).toContain('mode: subagent')
    expect(command).toContain('agent: test-command-agent')
    expect(command).toContain('$ARGUMENTS')
    await runNode([validateScript, path.join(root, '.opencode/agents/test-agent.md')])
  })

  it('应该写入自定义 description 并正确转义 YAML 标量', async () => {
    const root = await tempDir()
    const description = '审查 "高风险" 变更与边界'

    await runNode([
      initScript,
      'described-agent',
      '--command',
      '--description',
      description,
      '--project-root',
      root,
    ])

    const agent = await readFile(path.join(root, '.opencode/agents/described-agent.md'), 'utf8')
    const command = await readFile(path.join(root, '.opencode/commands/described-agent.md'), 'utf8')
    expect(agent).toContain(`description: ${JSON.stringify(description)}`)
    expect(command).toContain(`description: ${JSON.stringify(description)}`)
    await runNode([validateScript, path.join(root, '.opencode/agents/described-agent.md')])
  })

  it('应该用隔离用户目录创建全局代理和命令', async () => {
    const root = await tempDir()
    const home = path.join(root, 'home')
    await mkdir(home)
    const env = process.platform === 'win32'
      ? {
          USERPROFILE: home,
          HOMEDRIVE: path.parse(home).root.replace(/\\$/, ''),
          HOMEPATH: home.slice(path.parse(home).root.length - 1),
        }
      : { HOME: home }

    await runNode([initScript, 'global-agent', '--global', '--command'], env)

    const agentPath = path.join(home, '.config/opencode/agents/global-agent.md')
    const command = await readFile(path.join(home, '.config/opencode/commands/global-agent.md'), 'utf8')

    expect(command).toContain('agent: global-agent')
    await runNode([validateScript, agentPath])
  })

  it('应该支持显式 mode 并拒绝非法 mode', async () => {
    const root = await tempDir()

    await runNode([initScript, 'primary-agent', '--mode', 'primary', '--project-root', root])
    await runNode([initScript, 'all-agent', '--mode', 'all', '--project-root', root])
    const failure = await expectNodeFail([initScript, 'bad-mode-agent', '--mode', 'invalid', '--project-root', root])

    const primary = await readFile(path.join(root, '.opencode/agents/primary-agent.md'), 'utf8')
    const all = await readFile(path.join(root, '.opencode/agents/all-agent.md'), 'utf8')
    expect(primary).toContain('mode: primary')
    expect(primary).not.toContain('hidden: false')
    expect(all).toContain('mode: all')
    expect(all).not.toContain('hidden: false')
    expect(failure.stderr).toContain('--mode 只能是')
  })

  it('应该拒绝非法名称、已存在文件和高风险 project-root', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.opencode/agents'), { recursive: true })
    await writeFile(path.join(root, '.opencode/agents/existing-agent.md'), 'already exists')

    await expectNodeFail([initScript, 'Bad_Name', '--project-root', root])
    await expectNodeFail([initScript, 'existing-agent', '--project-root', root])
    const rootFailure = await expectNodeFail([initScript, 'root-agent', '--project-root', path.parse(root).root])
    const missingFailure = await expectNodeFail([
      initScript,
      'missing-agent',
      '--project-root',
      path.join(root, 'missing'),
    ])

    expect(rootFailure.stderr).toContain('根目录')
    expect(missingFailure.stderr).toContain('不存在')
  })

  it('应该拒绝错误的 CLI 参数输入', async () => {
    const root = await tempDir()

    const missingName = await expectNodeFail([initScript, '--project-root', root])
    const unknownFlag = await expectNodeFail([initScript, 'bad-args-agent', '--unknown', '--project-root', root])
    const duplicateName = await expectNodeFail([initScript, 'first-agent', 'second-agent', '--project-root', root])
    const missingFlagValue = await expectNodeFail([initScript, 'missing-value-agent', '--description'])

    expect(missingName.stderr).toContain('缺少代理名称')
    expect(unknownFlag.stderr).toContain('不支持的参数')
    expect(duplicateName.stderr).toContain('只能提供一个代理名称')
    expect(missingFlagValue.stderr).toContain('--description 需要提供值')
  })

  it('应该在 command 已存在时不留下半创建 agent', async () => {
    const root = await tempDir()
    await mkdir(path.join(root, '.opencode/commands'), { recursive: true })
    await writeFile(path.join(root, '.opencode/commands/half-agent.md'), 'already exists')

    await expectNodeFail([initScript, 'half-agent', '--command', '--project-root', root])

    expect(await exists(path.join(root, '.opencode/agents/half-agent.md'))).toBe(false)
  })

  it('应该拒绝项目级父目录符号链接', async () => {
    const root = await tempDir()
    const outside = await tempDir()
    await mkdir(path.join(root, '.opencode'), { recursive: true })
    await symlink(
      outside,
      path.join(root, '.opencode/agents'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    const failure = await expectNodeFail([initScript, 'linked-agent', '--project-root', root])

    expect(failure.stderr).toContain('符号链接')
  })

  it('应该拒绝全局父目录符号链接', async () => {
    const root = await tempDir()
    const home = path.join(root, 'home')
    const outside = await tempDir()
    await mkdir(path.join(home, '.config'), { recursive: true })
    await symlink(
      outside,
      path.join(home, '.config/opencode'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const env = process.platform === 'win32'
      ? {
          USERPROFILE: home,
          HOMEDRIVE: path.parse(home).root.replace(/\\$/, ''),
          HOMEPATH: home.slice(path.parse(home).root.length - 1),
        }
      : { HOME: home }

    const failure = await expectNodeFail([initScript, 'linked-global-agent', '--global'], env)

    expect(failure.stderr).toContain('符号链接')
  })

  it('应该拒绝全局中间目录符号链接', async () => {
    const root = await tempDir()
    const home = path.join(root, 'home')
    const outside = await tempDir()
    await mkdir(path.join(home, '.config/opencode'), { recursive: true })
    await symlink(
      outside,
      path.join(home, '.config/opencode/agents'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const env = process.platform === 'win32'
      ? {
          USERPROFILE: home,
          HOMEDRIVE: path.parse(home).root.replace(/\$/, ''),
          HOMEPATH: home.slice(path.parse(home).root.length - 1),
        }
      : { HOME: home }

    const failure = await expectNodeFail([initScript, 'linked-global-child-agent', '--global'], env)

    expect(failure.stderr).toContain('符号链接')
  })

  it('quick_validate 应该覆盖合法和错误样例', async () => {
    const root = await tempDir()
    const agents = path.join(root, '.opencode/agents')
    const validAgents = path.join(root, 'valid-agents')
    const commands = path.join(root, '.opencode/commands')
    await mkdir(agents, { recursive: true })
    await mkdir(validAgents, { recursive: true })
    await mkdir(commands, { recursive: true })

    await writeFile(path.join(agents, 'valid-agent.md'), validAgentContent)
    await writeFile(path.join(validAgents, 'valid-agent.md'), validAgentContent)
    await writeFile(path.join(agents, 'missing-description.md'), '---\nmode: subagent\n---\n# Role\n\n## Workflow\n')
    await writeFile(path.join(agents, 'missing-mode.md'), '---\ndescription: ok\n---\n# Role\n\n## Workflow\n')
    await writeFile(path.join(agents, 'invalid-mode.md'), '---\ndescription: ok\nmode: invalid\n---\n# Role\n\n## Workflow\n')
    await writeFile(path.join(agents, 'missing-frontmatter.md'), '# Role\n\n## Workflow\n')
    await writeFile(
      path.join(agents, 'hidden-primary.md'),
      '---\ndescription: ok\nmode: primary\nhidden: true\n---\n# Role\n\n## Workflow\n',
    )
    await writeFile(
      path.join(agents, 'old-steps.md'),
      '---\ndescription: ok\nmode: subagent\nmaxSteps: 3\n---\n# Role\n\n## Workflow\n',
    )
    await writeFile(path.join(agents, 'empty-body.md'), '---\ndescription: ok\nmode: subagent\n---\n')
    await writeFile(path.join(agents, 'missing-workflow.md'), '---\ndescription: ok\nmode: subagent\n---\n普通说明\n')
    await writeFile(path.join(agents, 'bad-command.md'), validAgentContent)
    await writeFile(
      path.join(commands, 'bad-command.md'),
      '---\ndescription: bad\nagent: other-agent\n---\nmissing args\n',
    )
    await writeFile(path.join(agents, 'single-quoted-command.md'), validAgentContent)
    await writeFile(
      path.join(commands, 'single-quoted-command.md'),
      "---\ndescription: ok\nagent: 'single-quoted-command'\n---\n$ARGUMENTS\n",
    )
    await writeFile(
      path.join(agents, 'full-frontmatter.md'),
      [
        '---',
        'description: ok',
        'mode: subagent',
        'temperature: 0.1',
        'top_p: 0.8',
        'steps: 3',
        'disable: false',
        'hidden: true',
        'color: accent',
        'tools:',
        '  write: false',
        'permission:',
        '  bash:',
        '    "*": ask',
        '---',
        '# Role',
        '',
        '## Workflow',
      ].join('\n'),
    )

    await runNode([validateScript, path.join(agents, 'valid-agent.md')])
    await runNode([validateScript, path.join(agents, 'single-quoted-command.md')])
    await runNode([validateScript, path.join(agents, 'full-frontmatter.md')])
    await runNode([validateScript, validAgents])

    const invalidCases = new Map([
      ['missing-description', '缺少 description'],
      ['missing-mode', '缺少 mode'],
      ['invalid-mode', 'mode 只能是 primary、subagent 或 all'],
      ['missing-frontmatter', '缺少 frontmatter'],
      ['hidden-primary', 'hidden 只适用于'],
      ['old-steps', 'maxSteps'],
      ['empty-body', '正文为空'],
      ['missing-workflow', '正文缺少基本角色或工作流说明'],
      ['bad-command', '同名命令缺少 agent'],
    ])
    for (const [name, message] of invalidCases) {
      const failure = await expectNodeFail([validateScript, path.join(agents, `${name}.md`)])
      expect(failure.stderr).toContain(message)
    }

    const badCommandFailure = await expectNodeFail([validateScript, path.join(agents, 'bad-command.md')])
    expect(badCommandFailure.stderr).toContain('同名命令正文缺少 $ARGUMENTS')
  })

  it('quick_validate 应该拒绝不含代理文件的目录', async () => {
    const root = await tempDir()

    const failure = await expectNodeFail([validateScript, root])

    expect(failure.stderr).toContain('未找到代理 Markdown 文件')
  })
})
