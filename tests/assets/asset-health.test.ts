import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'
import { getAssetModelRoutingEntries, getCommandModelScenario } from '../../src/services/asset-model-routing-catalog.js'
import { getAllAgentDefinitions, getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from '../../src/services/ae-catalog.js'
import { buildCommandConfig } from '../../src/services/command-registration.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'
import { getFrontmatterString, parseFrontmatter } from '../../src/utils/frontmatter.js'

interface ArgumentHintException {
  commandName: string
  field: 'argument-hint'
  reason: string
  expectedFrontmatter: string
}

const ARGUMENT_HINT_EXCEPTIONS: ArgumentHintException[] = [
  {
    commandName: `${COMMAND.PROMPT_OPTIMIZE}-auto`,
    field: 'argument-hint',
    reason: 'auto 命令通过命令模板固定注入 auto 参数，用户侧参数提示不重复显示 auto',
    expectedFrontmatter: '[auto] [提示词内容]',
  },
]

const VALID_AGENT_MODES = new Set(['primary', 'subagent', 'all'])

function readSkillFrontmatter(path: string): ReturnType<typeof parseFrontmatter>['data'] {
  const content = readFileSync(path, 'utf8')
  return parseFrontmatter(content).data
}

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath)
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : []
  })
}

function findPrimaryCommand(entries: ReturnType<typeof getPhaseOneEntries>, skillFile: string): string {
  const entriesForFile = entries.filter((entry) => entry.skillFile === skillFile)
  const directEntry = entriesForFile.find((entry) => entry.commandName === entry.skillName.replace(/^ae:/, 'ae-'))

  if (!directEntry) {
    throw new Error(`asset-health/skill-primary/skill-file/${skillFile}: 共享技能文件缺少显式主 entry`)
  }

  return directEntry.commandName
}

function listSkillDirectories(): string[] {
  return readdirSync(join(process.cwd(), 'src/assets/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(process.cwd(), 'src/assets/skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
}

function extractMarkdownCommandList(content: string, scenario: string, expectedCommand: string): string[] {
  const row = content
    .split('\n')
    .reverse()
    .find((line) => line.includes(`\`/${expectedCommand}\``) && line.includes(`\`${scenario}\``))
  if (!row) {
    throw new Error(`asset-health/docs-command-list/${expectedCommand}: 找不到文档表格行`)
  }

  return Array.from(row.matchAll(/`\/(ae-[^`]+)`/g)).map((match) => match[1])
}

function extractMarkdownSkillList(content: string): string[] {
  const row = content.split('\n').find((line) => line.startsWith('主要技能包括：'))
  if (!row) {
    throw new Error('asset-health/readme-skill-list: 找不到主要技能清单')
  }

  return Array.from(row.matchAll(/`(ae:[^`]+)`/g)).map((match) => match[1])
}

describe('资产健康巡检', () => {
  it('应该只基于 src 真源检查技能文件与 frontmatter 对齐', () => {
    const entries = getPhaseOneEntries()
    const commandConfig = buildCommandConfig('__missing_commands_dir__')

    for (const entry of entries) {
      const skillPath = join(process.cwd(), entry.skillFile)
      expect(existsSync(skillPath), `asset-health/skill-file/skill/${entry.skillName}: 缺少 ${entry.skillFile}`).toBe(true)
      expect(commandConfig[entry.commandName], `asset-health/command-registration/command/${entry.commandName}`).toBeDefined()

      const frontmatter = readSkillFrontmatter(skillPath)
      const primaryCommand = findPrimaryCommand(entries, entry.skillFile)
      if (entry.commandName !== primaryCommand) {
        const exception = ARGUMENT_HINT_EXCEPTIONS.find((item) => item.commandName === entry.commandName)
        if (exception) {
          expect(frontmatter[exception.field], `asset-health/skill-frontmatter/${exception.field}/${entry.commandName}: ${exception.reason}`).toBe(exception.expectedFrontmatter)
        }
        continue
      }

      expect(frontmatter.name, `asset-health/skill-frontmatter/name/skill/${entry.skillName}`).toBe(entry.skillName)
      expect(frontmatter['argument-hint'], `asset-health/skill-frontmatter/argument-hint/skill/${entry.skillName}`).toBe(entry.argumentHint)
    }
  })

  it('应该保持命令变体在注册与 help catalog 真源中可发现', () => {
    const commandConfig = buildCommandConfig('__missing_commands_dir__')
    const commandNames = [
      ...getPhaseOneEntries().map((entry) => entry.commandName),
      ...getPhaseOnePoEntries().map((entry) => entry.commandName),
      ...getPhaseOnePaEntries().map((entry) => entry.commandName),
    ]

    for (const commandName of commandNames) {
      expect(commandConfig[commandName], `asset-health/help-command/command/${commandName}: 命令不可发现`).toBeDefined()
    }

    expect(commandConfig[`${COMMAND.SAVE_EXPERIENCE}-po`], 'asset-health/prompt-variant/command/ae-save-experience-po').toBeUndefined()
    expect(commandConfig[`${COMMAND.SAVE_EXPERIENCE}-pa`], 'asset-health/prompt-variant/command/ae-save-experience-pa').toBeUndefined()
    expect(commandConfig[`${COMMAND.SKILL_FROM_SESSION}-po`], 'asset-health/prompt-variant/command/ae-skill-from-session-po').toBeUndefined()
    expect(commandConfig[`${COMMAND.SKILL_FROM_SESSION}-pa`], 'asset-health/prompt-variant/command/ae-skill-from-session-pa').toBeUndefined()
  })

  it('应该保持代理定义与 src/assets/agents 文件一致', () => {
    for (const agent of getAllAgentDefinitions()) {
      const agentPath = join(process.cwd(), agent.path)
      expect(existsSync(agentPath), `asset-health/agent-file/agent/${agent.name}: 缺少 ${agent.path}`).toBe(true)

      const frontmatter = parseFrontmatter(readFileSync(agentPath, 'utf8')).data
      expect(frontmatter.name, `asset-health/agent-frontmatter/name/agent/${agent.name}`).toBe(agent.name)
      expect(frontmatter.description, `asset-health/agent-frontmatter/description/agent/${agent.name}`).toBeTruthy()
      const mode = getFrontmatterString(frontmatter, 'mode')
      expect(mode && VALID_AGENT_MODES.has(mode), `asset-health/agent-frontmatter/mode/agent/${agent.name}`).toBe(true)
    }
  })

  it('技能目录不应该使用单数 script 资源目录', () => {
    for (const skillDir of listSkillDirectories()) {
      const fullDir = join(process.cwd(), 'src/assets/skills', skillDir)
      const entries = readdirSync(fullDir, { withFileTypes: true })
      for (const entry of entries) {
        expect(
          entry.isDirectory() && entry.name === 'script',
          `asset-health/skill-dir-entry/${skillDir}/${entry.name}: 脚本资源目录应使用 scripts/`,
        ).toBe(false)
      }
    }
  })

  it('ae-sql 资源引用应该同步到 scripts 目录', () => {
    const skillPath = 'src/assets/skills/ae-sql/SKILL.md'
    const skillText = readFileSync(skillPath, 'utf8')
    const markdownFiles = listMarkdownFiles('src/assets/skills/ae-sql')
    const gitignore = readFileSync('.gitignore', 'utf8')

    for (const file of markdownFiles) {
      const text = readFileSync(file, 'utf8')
      expect(text, `asset-health/ae-sql-script-reference/${file}`).not.toContain('script/')
      expect(text, `asset-health/ae-sql-script-reference/${file}`).not.toContain('script\\')
    }
    expect(gitignore).not.toContain('skills/ae-sql/script/')
    expect(gitignore).not.toContain('skills\\ae-sql\\script\\')
    expect(skillText).toContain('scripts/jre/')
    expect(skillText).toContain('scripts/drivers/')
    expect(gitignore).toContain('src/assets/skills/ae-sql/scripts/jre/')
    expect(gitignore).toContain('src/assets/skills/ae-sql/scripts/drivers/*.jar')
    expect(existsSync('src/assets/skills/ae-sql/scripts/sql-tool-1.0.0.jar')).toBe(true)
    expect(existsSync('src/assets/skills/ae-sql/scripts/drivers/.gitkeep')).toBe(true)
  })

  it('应该只注册 ae:save-experience 经验沉淀入口', () => {
    const entries = getPhaseOneEntries()
    const saveExperience = entries.find((entry) => entry.skillName === SKILL.SAVE_EXPERIENCE)
    const routingEntry = getAssetModelRoutingEntries().find((entry) => entry.name === COMMAND.SAVE_EXPERIENCE)

    expect(saveExperience?.commandName).toBe(COMMAND.SAVE_EXPERIENCE)
    expect(entries.map((entry) => entry.commandName)).not.toContain('ae-save-rules')
    expect(getAssetModelRoutingEntries().map((entry) => entry.name)).not.toContain('ae-save-rules')
    expect(getCommandModelScenario(COMMAND.SAVE_EXPERIENCE)).toBe('standard')
    expect(getCommandModelScenario('ae-save-rules')).toBeUndefined()
    expect(routingEntry).toMatchObject({ type: 'command', name: COMMAND.SAVE_EXPERIENCE, scenario: 'standard' })
  })

  it('应该拒绝残留的 ae:save-rules 技能和磁盘命令', () => {
    const skillFiles = listMarkdownFiles(join(process.cwd(), 'src/assets/skills'))
    const skillNames = skillFiles.map((file) => parseFrontmatter(readFileSync(file, 'utf8')).data.name)
    const commandConfig = buildCommandConfig(join(process.cwd(), 'src/assets/commands'))
    const commandFiles = listMarkdownFiles(join(process.cwd(), 'src/assets/commands'))

    expect(skillFiles.some((file) => file.includes('ae-save-rules'))).toBe(false)
    expect(skillNames).not.toContain('ae:save-rules')
    expect(commandFiles.some((file) => file.endsWith('ae-save-rules.md'))).toBe(false)
    expect(commandConfig['ae-save-rules']).toBeUndefined()
  })

  it('应该拒绝残留的旧会话沉淀和资产纠偏入口', () => {
    const skillFiles = listMarkdownFiles(join(process.cwd(), 'src/assets/skills'))
    const skillNames = skillFiles.map((file) => parseFrontmatter(readFileSync(file, 'utf8')).data.name)
    const entries = getPhaseOneEntries()
    const commandConfig = buildCommandConfig(join(process.cwd(), 'src/assets/commands'))
    const helpText = generateHelpText(undefined, process.cwd())

    expect(existsSync(join(process.cwd(), 'src/assets/skills/ae-save-session-flow'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/assets/skills/ae-asset-debug'))).toBe(false)
    expect(skillFiles.some((file) => file.includes('ae-save-session-flow'))).toBe(false)
    expect(skillFiles.some((file) => file.includes('ae-asset-debug'))).toBe(false)
    expect(skillNames).not.toContain('ae:save-session-flow')
    expect(skillNames).not.toContain('ae:asset-debug')
    expect(entries.map((entry) => entry.skillName)).not.toContain('ae:save-session-flow')
    expect(entries.map((entry) => entry.skillName)).not.toContain('ae:asset-debug')
    expect(entries.map((entry) => entry.commandName)).not.toContain('ae-save-session-flow')
    expect(entries.map((entry) => entry.commandName)).not.toContain('ae-asset-debug')
    expect(commandConfig['ae-save-session-flow']).toBeUndefined()
    expect(commandConfig['ae-asset-debug']).toBeUndefined()
    expect(helpText).not.toContain('ae:save-session-flow')
    expect(helpText).not.toContain('/ae-save-session-flow')
    expect(helpText).not.toContain('ae:asset-debug')
    expect(helpText).not.toContain('/ae-asset-debug')
  })

  it('skill-from-session 文档应该固定统一入口的关键流程边界', () => {
    const text = readFileSync('src/assets/skills/ae-skill-from-session/SKILL.md', 'utf8')

    expect(text).toContain('普通会话沉淀')
    expect(text).toContain('资产纠偏沉淀')
    expect(text).toContain('默认处理项目级技能')
    expect(text).toContain('影响当前用户的所有 OpenCode 项目')
    expect(text).toContain('不得直接写入技能、命令、代理、规则、工具、hook、service、schema 或注册文件')
    expect(text).toContain('创建意图')
    expect(text).toContain('更新意图')
    expect(text).toContain('候选不唯一、调用链证据不足')
    expect(text).toContain('如果偏差不是资产问题，只输出诊断，不调用 `ae:skill-creator`')
    expect(text).toContain('准备转交给 `ae:skill-creator`')
  })

  it('README 资产快照应该与 src 真源和命令注册结果一致', () => {
    const readme = readFileSync('README.md', 'utf8')
    const commandConfig = buildCommandConfig(join(process.cwd(), 'src/assets/commands'))
    const documentedSkills = extractMarkdownSkillList(readme)
    const documentedSkillOmissions = new Set<string>([
      SKILL.DOCUMENT_REVIEW,
      SKILL.MERGE_BRANCH,
      SKILL.AGENT_CREATOR,
      SKILL.SKILL_CREATOR,
    ])
    const expectedSkills = Array.from(new Set(getPhaseOneEntries().map((entry) => entry.skillName)))
      .filter((skillName) => !documentedSkillOmissions.has(skillName))

    expect(readme).toContain(`| 技能 | 当前快照 ${listSkillDirectories().length} |`)
    expect(readme).toContain(`| 命令 | 当前快照 ${Object.keys(commandConfig).length} |`)
    expect(documentedSkills).toEqual(expectedSkills)
    expect(documentedSkills).toContain(SKILL.SKILL_FROM_SESSION)
    expect(documentedSkills).not.toContain('ae:save-session-flow')
    expect(documentedSkills).not.toContain('ae:asset-debug')
  })

  it('builtin-config 命令场景文档应该与模型路由 catalog 一致', () => {
    const content = readFileSync('docs/builtin-config.md', 'utf8')
    const scenarios = [
      [MODEL_SCENARIO.STANDARD, COMMAND.IDEATE],
      [MODEL_SCENARIO.DEEP, COMMAND.DOCUMENT_REVIEW],
      [MODEL_SCENARIO.QUICK, COMMAND.PROMPT_OPTIMIZE],
      [MODEL_SCENARIO.VISION, COMMAND.TEST_BROWSER],
    ] as const

    for (const [scenario, representativeCommand] of scenarios) {
      const documentedCommands = extractMarkdownCommandList(content, scenario, representativeCommand)
      const expectedCommands = getAssetModelRoutingEntries()
        .filter((entry) => entry.type === 'command' && entry.scenario === scenario)
        .map((entry) => entry.name)

      expect(documentedCommands).toEqual(expectedCommands)
    }

    expect(extractMarkdownCommandList(content, MODEL_SCENARIO.STANDARD, COMMAND.IDEATE)).toContain(COMMAND.SKILL_FROM_SESSION)
    expect(content).not.toContain('/ae-save-session-flow')
    expect(content).not.toContain('/ae-asset-debug')
  })

  it('真实帮助输出应该显示 save-experience 且不显示旧 save-rules 入口', () => {
    const text = generateHelpText(undefined, process.cwd())

    expect(text).toContain('ae:save-experience')
    expect(text).toContain('/ae-save-experience')
    expect(text).toContain('| command | `ae-save-experience` | `standard` | direct |')
    expect(text).not.toContain('ae:save-rules')
    expect(text).not.toContain('/ae-save-rules')
  })

  it('agent-creator 文档应该固定更新流程安全边界', () => {
    const text = readFileSync('src/assets/skills/ae-agent-creator/SKILL.md', 'utf8')
    const conventions = readFileSync('src/assets/skills/ae-agent-creator/references/opencode-agent-conventions.md', 'utf8')
    const permissions = readFileSync('src/assets/skills/ae-agent-creator/references/permission-patterns.md', 'utf8')

    expect(text).toContain('读取旧文件')
    expect(text).toContain('项目级影子代理')
    expect(text).toContain('默认不创建或重写命令')
    expect(conventions).toContain('同名候选')
    expect(conventions).toContain('敏感字段或正文指令变化')
    expect(permissions).toContain('正文新增、删除或重写 destructive Git')
  })
})
