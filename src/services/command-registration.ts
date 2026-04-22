import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'
import type { TuiCommand } from '@opencode-ai/plugin/tui'

import { parseFrontmatter } from '../utils/frontmatter.js'
import { getArgumentContracts } from './argument-contract.js'
import { getPhaseOneEntries } from './ae-catalog.js'

interface LoadedCommand {
  template: string
  description: string
}

function loadCommandFiles(commandsDir: string): Map<string, LoadedCommand> {
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

  for (const entry of getPhaseOneEntries()) {
    result[entry.commandName] = {
      template: `使用 \`${entry.skillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`,
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
  const catalogNames: ReadonlySet<string> = new Set(getPhaseOneEntries().map((e) => e.commandName))
  const fileCommands = commandsDir ? loadCommandFiles(commandsDir) : new Map<string, LoadedCommand>()

  const tuiCommands: TuiCommand[] = getPhaseOneEntries().map((entry) => {
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
