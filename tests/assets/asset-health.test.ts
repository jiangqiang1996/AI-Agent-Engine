import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { getAssetModelRoutingEntries, getCommandModelScenario } from '../../src/services/asset-model-routing-catalog.js'
import { getAllAgentDefinitions, getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from '../../src/services/ae-catalog.js'
import { buildCommandConfig } from '../../src/services/command-registration.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'
import { parseFrontmatter } from '../../src/utils/frontmatter.js'

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

function readSkillFrontmatter(path: string): Record<string, string> {
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
  })

  it('应该保持代理定义与 src/assets/agents 文件一致', () => {
    for (const agent of getAllAgentDefinitions()) {
      const agentPath = join(process.cwd(), agent.path)
      expect(existsSync(agentPath), `asset-health/agent-file/agent/${agent.name}: 缺少 ${agent.path}`).toBe(true)

      const frontmatter = parseFrontmatter(readFileSync(agentPath, 'utf8')).data
      expect(frontmatter.name, `asset-health/agent-frontmatter/name/agent/${agent.name}`).toBe(agent.name)
      expect(frontmatter.description, `asset-health/agent-frontmatter/description/agent/${agent.name}`).toBeTruthy()
    }
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
