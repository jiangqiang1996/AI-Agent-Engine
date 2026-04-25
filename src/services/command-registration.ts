import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import type { TuiCommand } from '@opencode-ai/plugin/tui'

import { parseFrontmatter } from '../utils/frontmatter.js'
import { getArgumentContracts } from './argument-contract.js'
import { getPhaseOneEntries, getPhaseOnePoEntries, getPhaseOnePaEntries } from './ae-catalog.js'
import { COMMAND, AUTO_SUFFIX, PO_SUFFIX, PA_SUFFIX } from '../schemas/ae-asset-schema.js'

interface LoadedCommand {
  template: string
  description: string
}

export function loadCommandFiles(commandsDir: string): Map<string, LoadedCommand> {
  const result = new Map<string, LoadedCommand>()
  let files: string[]

  try {
    files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'))
  } catch {
    return result
  }

  for (const file of files) {
    const name = basename(file, '.md')
    const content = readFileSync(join(commandsDir, file), 'utf8')
    const parsed = parseFrontmatter(content)

    result.set(name, {
      template: parsed.body.trim() || `$ARGUMENTS`,
      description: parsed.data.description || '',
    })
  }

  return result
}

export function buildCommandConfig(commandsDir: string): NonNullable<Config['command']> {
  const result: NonNullable<Config['command']> = {}
  const phaseOne = getPhaseOneEntries()
  const commandToSkill = new Map(phaseOne.map((e) => [e.commandName, e.skillName]))

  const promptOptimizeAutoCommand = `${COMMAND.PROMPT_OPTIMIZE}${AUTO_SUFFIX}`

  for (const entry of phaseOne) {
    const isAutoPo = entry.commandName === promptOptimizeAutoCommand
    const template = isAutoPo
      ? `使用 \`${entry.skillName}\` 技能以 auto 模式处理这次请求（跳过确认直接提交），并沿用参数：\`auto $ARGUMENTS\`。`
      : `使用 \`${entry.skillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`
    result[entry.commandName] = {
      template,
      description: entry.description,
    }
  }

  for (const entry of getPhaseOnePoEntries()) {
    const baseCommandName = entry.commandName.slice(0, -PO_SUFFIX.length)
    const baseSkillName = commandToSkill.get(baseCommandName as typeof entry.commandName) ?? ''
    result[entry.commandName] = {
      template: [
        `先使用 \`${entry.skillName}\` 技能优化以下用户输入，将优化结果作为最终提示词：`,
        '',
        '---',
        `使用 \`${baseSkillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
        '---',
      ].join('\n'),
      description: entry.description,
    }
  }

  for (const entry of getPhaseOnePaEntries()) {
    const baseCommandName = entry.commandName.slice(0, -PA_SUFFIX.length)
    const baseSkillName = commandToSkill.get(baseCommandName as typeof entry.commandName) ?? ''
    result[entry.commandName] = {
      template: [
        `先使用 \`${entry.skillName}\` 技能以 auto 模式优化以下用户输入（跳过确认直接提交），将优化结果作为最终提示词：`,
        '',
        '---',
        `使用 \`${baseSkillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
        '---',
      ].join('\n'),
      description: entry.description,
    }
  }

  const fileCommands = loadCommandFiles(commandsDir)
  for (const [name, cmd] of fileCommands) {
    result[name] = cmd
  }

  return result
}

export function createTuiCommands(
  trigger?: (value: string) => void,
  commandsDir?: string,
): TuiCommand[] {
  const contracts = getArgumentContracts()
  const phaseOne = getPhaseOneEntries()
  const poEntries = getPhaseOnePoEntries()
  const paEntries = getPhaseOnePaEntries()
  const allCatalogEntries = [...phaseOne, ...poEntries, ...paEntries]
  const catalogNames: ReadonlySet<string> = new Set(allCatalogEntries.map((e) => e.commandName))
  const fileCommands = commandsDir ? loadCommandFiles(commandsDir) : new Map<string, LoadedCommand>()

  const tuiCommands: TuiCommand[] = phaseOne.map((entry) => {
    const contract = contracts.find((item) => item.commandName === entry.commandName)
    const fileOverride = fileCommands.get(entry.commandName)
    const description = fileOverride
      ? fileOverride.description
      : [entry.description, contract?.argumentHint].filter(Boolean).join(' | ')

    return {
      title: entry.commandName,
      value: `/${entry.commandName}`,
      description,
      category: entry.defaultEntry ? 'AE 默认入口' : 'AE 工作流',
      suggested: entry.defaultEntry,
      slash: {
        name: entry.commandName,
      },
      onSelect: trigger ? () => trigger(`/${entry.commandName}`) : undefined,
    } satisfies TuiCommand
  })

  for (const entry of poEntries) {
    const contract = contracts.find((item) => item.commandName === entry.commandName)
    tuiCommands.push({
      title: entry.commandName,
      value: `/${entry.commandName}`,
      description: [entry.description, contract?.argumentHint].filter(Boolean).join(' | '),
      category: 'AE 提示词优化',
      slash: { name: entry.commandName },
      onSelect: trigger ? () => trigger(`/${entry.commandName}`) : undefined,
    } satisfies TuiCommand)
  }

  for (const entry of paEntries) {
    const contract = contracts.find((item) => item.commandName === entry.commandName)
    tuiCommands.push({
      title: entry.commandName,
      value: `/${entry.commandName}`,
      description: [entry.description, contract?.argumentHint].filter(Boolean).join(' | '),
      category: 'AE 提示词优化（自动）',
      slash: { name: entry.commandName },
      onSelect: trigger ? () => trigger(`/${entry.commandName}`) : undefined,
    } satisfies TuiCommand)
  }

  for (const [name, cmd] of fileCommands) {
    if (catalogNames.has(name)) continue
    tuiCommands.push({
      title: name,
      value: `/${name}`,
      description: cmd.description,
      category: 'AE 自定义命令',
      slash: { name },
      onSelect: trigger ? () => trigger(`/${name}`) : undefined,
    } satisfies TuiCommand)
  }

  return tuiCommands
}
