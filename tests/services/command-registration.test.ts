import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from '../../src/services/ae-catalog.js'
import {
  buildCommandConfig,
  mergeBuiltinAndUserCommands,
} from '../../src/services/command-registration.js'
import { createModelScenarioRoutingContext } from '../../src/services/model-scenario-routing-service.js'
import { parseFrontmatter } from '../../src/utils/frontmatter.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-command-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('command-registration', () => {
  it('应该按排除列表跳过不适合提示词优化包装的命令变体', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poEntries = getPhaseOnePoEntries()
    const paEntries = getPhaseOnePaEntries()

    for (const skillName of PROMPT_OPTIMIZE_VARIANT_EXCLUDED_SKILLS) {
      const commandName = skillName.replace(/^ae:/, 'ae-')

      expect(poEntries.some((entry) => entry.commandName === `${commandName}${PO_SUFFIX}`)).toBe(false)
      expect(paEntries.some((entry) => entry.commandName === `${commandName}${PA_SUFFIX}`)).toBe(false)
      expect(config[`${commandName}${PO_SUFFIX}`]).toBeUndefined()
      expect(config[`${commandName}${PA_SUFFIX}`]).toBeUndefined()
    }
  })

  it('应该为 ae:refactor 生成基础命令和提示词优化命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poCommand = `${COMMAND.REFACTOR}${PO_SUFFIX}`
    const paCommand = `${COMMAND.REFACTOR}${PA_SUFFIX}`

    expect(config[COMMAND.REFACTOR]).toBeDefined()
    expect(config[COMMAND.REFACTOR]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
    expect(config[poCommand]).toBeDefined()
    expect(config[poCommand]?.template).toContain(`先使用 \`${SKILL.PROMPT_OPTIMIZE}\` 技能优化以下用户输入`)
    expect(config[poCommand]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
    expect(config[paCommand]).toBeDefined()
    expect(config[paCommand]?.template).toContain(`先使用 \`${SKILL.PROMPT_OPTIMIZE}\` 技能以 auto 模式优化以下用户输入`)
    expect(config[paCommand]?.template).toContain('跳过确认直接提交')
    expect(config[paCommand]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
  })

  it('应该为 ae:swagger-parser 只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poCommand = `${COMMAND.SWAGGER_PARSER}${PO_SUFFIX}`
    const paCommand = `${COMMAND.SWAGGER_PARSER}${PA_SUFFIX}`

    expect(config[COMMAND.SWAGGER_PARSER]).toBeDefined()
    expect(config[COMMAND.SWAGGER_PARSER]?.template).toContain(SKILL.SWAGGER_PARSER)
    expect(config[poCommand]).toBeUndefined()
    expect(config[paCommand]).toBeUndefined()
  })

  it('应该为 ae:test-browser 命令保留 setup 前置顺序且不生成提示词优化变体', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poCommand = `${COMMAND.TEST_BROWSER}${PO_SUFFIX}`
    const paCommand = `${COMMAND.TEST_BROWSER}${PA_SUFFIX}`

    const baseTemplate = config[COMMAND.TEST_BROWSER]?.template ?? ''
    expect(baseTemplate).toContain(`先使用 \`${SKILL.SETUP}\` 技能完成 agent-browser 环境检查`)
    expect(baseTemplate).toContain('未完成 setup 前不得执行任何 agent-browser 命令')
    expect(baseTemplate.indexOf(SKILL.SETUP)).toBeLessThan(baseTemplate.indexOf(SKILL.TEST_BROWSER))

    expect(config[poCommand]).toBeUndefined()
    expect(config[paCommand]).toBeUndefined()
  })

  it('应该为 ae:save-session-flow 只生成基础命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poCommand = `${COMMAND.SAVE_SESSION_FLOW}${PO_SUFFIX}`
    const paCommand = `${COMMAND.SAVE_SESSION_FLOW}${PA_SUFFIX}`

    expect(config[COMMAND.SAVE_SESSION_FLOW]).toBeDefined()
    expect(config[COMMAND.SAVE_SESSION_FLOW]?.template).toContain(`使用 \`${SKILL.SAVE_SESSION_FLOW}\` 技能处理这次请求`)
    expect(config[poCommand]).toBeUndefined()
    expect(config[paCommand]).toBeUndefined()
  })

  it('应该保持 ae:swagger-parser catalog 与 SKILL.md frontmatter 名称一致', () => {
    const skillContent = readFileSync('src/assets/skills/ae-swagger-parser/SKILL.md', 'utf8')

    expect(skillContent).toContain(`name: ${SKILL.SWAGGER_PARSER}`)
  })

  it('应该保持 ae:asset-debug catalog 与 SKILL.md frontmatter 一致', () => {
    const skillContent = readFileSync('src/assets/skills/ae-asset-debug/SKILL.md', 'utf8')
    const frontmatter = parseFrontmatter(skillContent).data
    const catalogEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.ASSET_DEBUG)

    expect(catalogEntry).toBeDefined()
    expect(frontmatter.name).toBe(catalogEntry?.skillName)
    expect(frontmatter.description).toBe(catalogEntry?.description)
    expect(frontmatter['argument-hint']).toBe(catalogEntry?.argumentHint)
  })

  it('应该保持 ae:save-session-flow catalog 与 SKILL.md frontmatter 一致', () => {
    const skillContent = readFileSync('src/assets/skills/ae-save-session-flow/SKILL.md', 'utf8')
    const frontmatter = parseFrontmatter(skillContent).data
    const catalogEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.SAVE_SESSION_FLOW)

    expect(catalogEntry).toBeDefined()
    expect(frontmatter.name).toBe(catalogEntry?.skillName)
    expect(frontmatter.description).toBe(catalogEntry?.description)
    expect(frontmatter['argument-hint']).toBe(catalogEntry?.argumentHint)
  })

  it('应该保持 ae:setup 和 ae:test-browser catalog 与 SKILL.md frontmatter 语义一致', () => {
    const setupContent = readFileSync('src/assets/skills/ae-setup/SKILL.md', 'utf8')
    const testBrowserContent = readFileSync('src/assets/skills/ae-test-browser/SKILL.md', 'utf8')
    const setupFrontmatter = parseFrontmatter(setupContent).data
    const testBrowserFrontmatter = parseFrontmatter(testBrowserContent).data
    const setupEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.SETUP)
    const testBrowserEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.TEST_BROWSER)

    expect(setupFrontmatter.description).toContain('AE 浏览器能力')
    expect(setupEntry?.description).toContain('AE 浏览器能力')
    expect(testBrowserFrontmatter.description).toContain('agent-browser')
    expect(testBrowserEntry?.description).toContain('先完成 ae:setup')
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

  it('应该根据模型场景为内置 command 注入 model', () => {
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildCommandConfig('__missing_commands_dir__', routingContext)

    expect(config[COMMAND.PLAN]?.model).toBe('provider/deep')
  })

  it('零配置时内置 command 注册结果不写入 model', () => {
    const routingContext = createModelScenarioRoutingContext(new Map())

    const config = buildCommandConfig('__missing_commands_dir__', routingContext)

    expect(config[COMMAND.PLAN]?.model).toBeUndefined()
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
      join(commandsDir, `${COMMAND.PLAN}.md`),
      ['---', 'description: custom plan', 'model: provider/custom-plan', '---', 'custom plan template'].join('\n'),
    )
    const routingContext = createModelScenarioRoutingContext(new Map([
      ['deep', { scenario: 'deep', model: 'provider/deep', layer: '项目级', path: '/repo/.opencode/ae.jsonc' }],
    ]))

    const config = buildCommandConfig(commandsDir, routingContext)

    expect(config[COMMAND.PLAN]).toEqual({
      template: 'custom plan template',
      description: 'custom plan',
      model: 'provider/custom-plan',
    })
  })

  it('用户同名 command model 应最终覆盖场景注入 model', () => {
    const merged = mergeBuiltinAndUserCommands(
      {
        [COMMAND.PLAN]: {
          template: 'builtin template',
          description: 'builtin description',
          model: 'provider/deep',
        },
      },
      {
        [COMMAND.PLAN]: {
          template: 'user template',
          description: 'user description',
          model: 'user/model',
        },
      },
    )

    expect(merged[COMMAND.PLAN]?.model).toBe('user/model')
  })
})
