import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'
import {
  buildCommandConfig,
  mergeDynamicCommands,
  mergeBuiltinAndUserCommands,
  mergeProjectCommandOverrides,
} from '../../src/services/command-registration.js'
import { createModelScenarioRoutingContext } from '../../src/services/model-scenario-routing-service.js'
import { parseFrontmatter } from '../../src/utils/frontmatter.js'

const tempRoots: string[] = []
const COMMIT_COMMAND = 'ae-commit'
const WORK_CONTINUE_COMMAND = 'ae-work-continue'

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-command-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function isolateHome(root: string): void {
  vi.stubEnv('HOME', root)
  vi.stubEnv('USERPROFILE', root)
}

describe('command-registration', () => {
  it('应该为 ae:design 生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config[COMMAND.DESIGN]).toBeDefined()
    expect(config[COMMAND.DESIGN]?.template).toContain(`使用 \`${SKILL.DESIGN}\` 技能处理这次请求`)
  })

  it('应该从磁盘命令注册 worktree 续执行命令', () => {
    const config = buildCommandConfig(join(process.cwd(), 'src/assets/commands'))

    expect(getPhaseOneEntries().map((entry) => entry.commandName)).not.toContain(WORK_CONTINUE_COMMAND)
    expect(config[WORK_CONTINUE_COMMAND]).toBeDefined()
    expect(config[WORK_CONTINUE_COMMAND]?.template).toContain('ae/handoffs/*-worktree-handoff.md')
    expect(config[WORK_CONTINUE_COMMAND]?.template).toContain('如果找到多个交接文件')
    expect(config[WORK_CONTINUE_COMMAND]?.template).toContain('不得按裸提示词处理')
  })

  it('不应该再注册旧文档互转命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config['ae-doc-humanize']).toBeUndefined()
    expect(config['ae-doc-structure']).toBeUndefined()
  })

  it('应该为工具型和结构化输入命令只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    for (const [skillName, commandName] of [
      [SKILL.AGENT_CREATOR, COMMAND.AGENT_CREATOR],
      [SKILL.WORK_REPORT, COMMAND.WORK_REPORT],
      [SKILL.GRAPH_BUILD, COMMAND.GRAPH_BUILD],
      [SKILL.GRAPH_QUERY, COMMAND.GRAPH_QUERY],
    ] as const) {
      expect(config[commandName]?.template).toContain(`使用 \`${skillName}\` 技能处理这次请求`)
    }
  })

  it('应该为 ae:task-loop 生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config[COMMAND.TASK_LOOP]).toBeDefined()
    expect(config[COMMAND.TASK_LOOP]?.template).toContain(`使用 \`${SKILL.TASK_LOOP}\` 技能处理这次请求`)
  })

  it('应该为 ae:swagger-parser 只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config[COMMAND.SWAGGER_PARSER]).toBeDefined()
    expect(config[COMMAND.SWAGGER_PARSER]?.template).toContain(SKILL.SWAGGER_PARSER)
  })

  it('应该为 ae:web-forge 命令保留 chrome-devtools 环境门禁顺序', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    const baseTemplate = config[COMMAND.WEB_FORGE]?.template ?? ''
    expect(baseTemplate).toContain(`先使用 \`${SKILL.CHROME_DEVTOOLS} action=register mode=autoConnect\` 技能完成浏览器 MCP 动态注册`)
    expect(baseTemplate).toContain('未完成 MCP 注册前不得执行任何浏览器控制命令')
    expect(baseTemplate.indexOf(SKILL.CHROME_DEVTOOLS)).toBeLessThan(baseTemplate.indexOf(SKILL.WEB_FORGE))
  })

  it('应该为 ae:skill-creator 只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config[COMMAND.SKILL_CREATOR]).toBeDefined()
    expect(config[COMMAND.SKILL_CREATOR]?.template).toContain(`使用 \`${SKILL.SKILL_CREATOR}\` 技能处理这次请求`)
    expect(config['ae-save-session-flow']).toBeUndefined()
    expect(config['ae-asset-debug']).toBeUndefined()
  })

  it('应该为 ae:save-experience 只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')

    expect(config[COMMAND.SAVE_EXPERIENCE]).toBeDefined()
    expect(config[COMMAND.SAVE_EXPERIENCE]?.template).toContain(`使用 \`${SKILL.SAVE_EXPERIENCE}\` 技能处理这次请求`)
  })

  it('应该保持 ae:swagger-parser catalog 与 SKILL.md frontmatter 名称一致', () => {
    const skillContent = readFileSync('src/assets/skills/ae-swagger-parser/SKILL.md', 'utf8')

    expect(skillContent).toContain(`name: ${SKILL.SWAGGER_PARSER}`)
  })

  it('应该保持 ae:skill-creator catalog 与 SKILL.md frontmatter 一致', () => {
    const skillContent = readFileSync('src/assets/skills/ae-skill-creator/SKILL.md', 'utf8')
    const frontmatter = parseFrontmatter(skillContent).data
    const catalogEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.SKILL_CREATOR)

    expect(catalogEntry).toBeDefined()
    expect(frontmatter.name).toBe(catalogEntry?.skillName)
    expect(frontmatter.description).toContain('创建或更新')
    expect(frontmatter['argument-hint']).toBe(catalogEntry?.argumentHint)
  })

  it('应该保持 ae:chrome-devtools 和 ae:web-forge catalog 与 SKILL.md frontmatter 语义一致', () => {
    const chromeDevtoolsContent = readFileSync('src/assets/skills/ae-chrome-devtools/SKILL.md', 'utf8')
    const webForgeContent = readFileSync('src/assets/skills/ae-web-forge/SKILL.md', 'utf8')
    const chromeDevtoolsFrontmatter = parseFrontmatter(chromeDevtoolsContent).data
    const webForgeFrontmatter = parseFrontmatter(webForgeContent).data
    const chromeDevtoolsEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.CHROME_DEVTOOLS)
    const webForgeEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.WEB_FORGE)

    expect(chromeDevtoolsFrontmatter.description).toContain('chrome-devtools')
    expect(chromeDevtoolsEntry?.description).toContain('chrome-devtools-mcp')
    expect(webForgeFrontmatter.description).toContain('前端开发')
    expect(webForgeEntry?.description).toContain('@ui-architect')
  })

  it('用户同名命令应覆盖插件内置命令', () => {
    const merged = mergeBuiltinAndUserCommands(
      {
        'ae-demo': {
          template: 'builtin template',
          description: 'builtin description',
        },
      },
      {
        'ae-demo': {
          template: 'user template',
          description: 'user description',
        },
        'ae-user-only': {
          template: 'user only',
          description: 'user only description',
        },
      },
    )

    expect(merged['ae-demo']?.template).toBe('user template')
    expect(merged['ae-demo']?.description).toBe('user description')
    expect(merged['ae-user-only']?.template).toBe('user only')
  })

  it('项目级动态命令应该覆盖已有同名动态命令', () => {
    const merged = mergeDynamicCommands(
      {
        'ae-demo': {
          template: 'project dynamic template',
          description: 'project dynamic description',
        },
      },
      {
        'ae-demo': {
          template: 'global dynamic template',
          description: 'global dynamic description',
        },
        'global-only': {
          template: 'global only',
        },
      },
      true,
    )

    expect(merged['ae-demo']).toEqual({
      template: 'project dynamic template',
      description: 'project dynamic description',
    })
    expect(merged['global-only']?.template).toBe('global only')
  })

  it('应该根据模型场景为内置 command 注入 model', () => {
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildCommandConfig('__missing_commands_dir__', routingContext)

    expect(config[COMMAND.DESIGN]?.model).toBe('provider/deep')
  })

  it('零配置时内置 command 注册结果不写入 model', () => {
    const routingContext = createModelScenarioRoutingContext(new Map())

    const config = buildCommandConfig('__missing_commands_dir__', routingContext)

    expect(config[COMMAND.DESIGN]?.model).toBeUndefined()
    expect(routingContext.unresolvedReferences).toEqual([])
  })

  it('应该将磁盘命令 frontmatter model 变量解析为 modelScenarios 中的模型', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, 'custom.md'),
      ['---', 'description: custom command', 'model: $quick', '---', 'custom template'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['quick', { scenario: 'quick', model: 'provider/quick', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildCommandConfig(commandsDir, routingContext)

    expect(config.custom?.model).toBe('provider/quick')
  })

  it('应该保留磁盘命令支持的 frontmatter 配置', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, 'custom.md'),
      ['---', 'description: custom command', 'agent: plan', 'subtask: true', 'model: provider/custom', '---', 'custom template'].join('\n'),
    )

    const config = buildCommandConfig(commandsDir)

    expect(config.custom).toEqual({
      template: 'custom template',
      description: 'custom command',
      agent: 'plan',
      subtask: true,
      model: 'provider/custom',
    })
  })

  it('应该保留磁盘命令显式禁用子任务配置', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, 'custom.md'),
      ['---', 'description: custom command', 'subtask: false', '---', 'custom template'].join('\n'),
    )

    const config = buildCommandConfig(commandsDir)

    expect(config.custom?.subtask).toBe(false)
  })

  it('缺少 description 的磁盘命令不应该写入空字符串字段', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(join(commandsDir, 'custom.md'), ['---', 'agent: plan', '---', 'custom template'].join('\n'))

    const config = buildCommandConfig(commandsDir)

    expect(config.custom).toEqual({
      template: 'custom template',
      agent: 'plan',
    })
  })

  it('磁盘命令 frontmatter 自定义模型变量未配置时应该原样透传', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, 'custom.md'),
      ['---', 'description: custom command', 'model: $missing', '---', 'custom template'].join('\n'),
    )

    const config = buildCommandConfig(commandsDir, createModelScenarioRoutingContext(new Map()))

    expect(config.custom?.model).toBe('$missing')
  })

  it('磁盘命令重写内置命令时应该用 frontmatter model 覆盖默认路由', () => {
    const root = createTempRoot()
    const commandsDir = join(root, 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, `${COMMAND.DESIGN}.md`),
      ['---', 'description: custom plan', 'model: provider/custom-plan', '---', 'custom plan template'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildCommandConfig(commandsDir, routingContext)

    expect(config[COMMAND.DESIGN]).toEqual({
      template: 'custom plan template',
      description: 'custom plan',
      model: 'provider/custom-plan',
    })
  })

  it('用户同名 command model 应最终覆盖场景注入 model', () => {
    const merged = mergeBuiltinAndUserCommands(
      {
        [COMMAND.DESIGN]: {
          template: 'builtin template',
          description: 'builtin description',
          model: 'provider/deep',
        },
      },
      {
        [COMMAND.DESIGN]: {
          template: 'user template',
          description: 'user description',
          model: 'user/model',
        },
      },
    )

    expect(merged[COMMAND.DESIGN]?.model).toBe('user/model')
  })

  it('项目级命令应该最终覆盖已有同名用户命令', () => {
    const root = createTempRoot()
    isolateHome(createTempRoot())
    const commandsDir = join(root, '.opencode', 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, `${COMMIT_COMMAND}.md`),
      ['---', 'description: project commit', '---', 'project commit template'].join('\n'),
    )

    const merged = mergeProjectCommandOverrides({
      [COMMIT_COMMAND]: {
        template: 'global commit template',
        description: 'global commit',
      },
      'other-command': {
        template: 'other template',
        description: 'other description',
      },
    }, root)

    expect(merged[COMMIT_COMMAND]).toEqual({
      template: 'project commit template',
      description: 'project commit',
    })
    expect(merged['other-command']).toEqual({
      template: 'other template',
      description: 'other description',
    })
  })

  it('项目级命令最终覆盖时应该解析 frontmatter model 变量', () => {
    const root = createTempRoot()
    isolateHome(createTempRoot())
    const commandsDir = join(root, '.opencode', 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(
      join(commandsDir, `${COMMIT_COMMAND}.md`),
      ['---', 'description: project commit', 'model: $quick', '---', 'project commit template'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['quick', { scenario: 'quick', model: 'provider/quick', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const merged = mergeProjectCommandOverrides({
      [COMMIT_COMMAND]: {
        template: 'global commit template',
        description: 'global commit',
      },
    }, root, routingContext)

    expect(merged[COMMIT_COMMAND]).toEqual({
      template: 'project commit template',
      description: 'project commit',
      model: 'provider/quick',
    })
  })

  it('全局直接命令应该覆盖项目级动态命令', () => {
    const root = createTempRoot()
    const home = createTempRoot()
    isolateHome(home)
    const globalCommandsDir = join(home, '.config', 'opencode', 'commands')
    mkdirSync(globalCommandsDir, { recursive: true })
    writeFileSync(
      join(globalCommandsDir, `${COMMIT_COMMAND}.md`),
      ['---', 'description: global direct commit', '---', 'global direct template'].join('\n'),
    )

    const merged = mergeProjectCommandOverrides({
      [COMMIT_COMMAND]: {
        template: 'project dynamic template',
        description: 'project dynamic commit',
      },
    }, root)

    expect(merged[COMMIT_COMMAND]).toEqual({
      template: 'global direct template',
      description: 'global direct commit',
    })
  })

  it('项目级直接命令应该覆盖全局直接命令', () => {
    const root = createTempRoot()
    const home = createTempRoot()
    isolateHome(home)
    const globalCommandsDir = join(home, '.config', 'opencode', 'commands')
    const projectCommandsDir = join(root, '.opencode', 'commands')
    mkdirSync(globalCommandsDir, { recursive: true })
    mkdirSync(projectCommandsDir, { recursive: true })
    writeFileSync(
      join(globalCommandsDir, `${COMMIT_COMMAND}.md`),
      ['---', 'description: global direct commit', '---', 'global direct template'].join('\n'),
    )
    writeFileSync(
      join(projectCommandsDir, `${COMMIT_COMMAND}.md`),
      ['---', 'description: project direct commit', '---', 'project direct template'].join('\n'),
    )

    const merged = mergeProjectCommandOverrides({
      [COMMIT_COMMAND]: {
        template: 'project dynamic template',
        description: 'project dynamic commit',
      },
    }, root)

    expect(merged[COMMIT_COMMAND]).toEqual({
      template: 'project direct template',
      description: 'project direct commit',
    })
  })
})
