import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'

import { parseFrontmatter } from '../utils/frontmatter.js'
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
    // catalog 是默认命令真源；仅当条目显式提供模板时才覆盖统一的技能调用包装。
    const template = entry.customTemplate
      ?? (isAutoPo
        ? `使用 \`${entry.skillName}\` 技能以 auto 模式处理这次请求（跳过确认直接提交），并沿用参数：\`auto $ARGUMENTS\`。`
        : `使用 \`${entry.skillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`)
    result[entry.commandName] = {
      template,
      description: entry.description,
    }
  }

  for (const entry of getPhaseOnePoEntries()) {
    const baseCommandName = entry.commandName.slice(0, -PO_SUFFIX.length)
    const baseSkillName = commandToSkill.get(baseCommandName as typeof entry.commandName) ?? ''
    const baseEntry = phaseOne.find((e) => e.commandName === baseCommandName)
    // -po 命令必须先优化用户输入，再把优化后的提示词交回原始命令模板执行。
    const baseTemplate = baseEntry?.customTemplate
      ?? `使用 \`${baseSkillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`
    result[entry.commandName] = {
      template: [
        `先使用 \`${entry.skillName}\` 技能优化以下用户输入，将优化结果作为最终提示词：`,
        '',
        '---',
        baseTemplate,
        '---',
      ].join('\n'),
      description: entry.description,
    }
  }

  for (const entry of getPhaseOnePaEntries()) {
    const baseCommandName = entry.commandName.slice(0, -PA_SUFFIX.length)
    const baseSkillName = commandToSkill.get(baseCommandName as typeof entry.commandName) ?? ''
    const baseEntry = phaseOne.find((e) => e.commandName === baseCommandName)
    // -pa 与 -po 使用同一条基础命令链路，只是固定启用 prompt-optimize 的 auto 模式。
    const baseTemplate = baseEntry?.customTemplate
      ?? `使用 \`${baseSkillName}\` 技能处理这次请求，并沿用参数：\`$ARGUMENTS\`。`
    result[entry.commandName] = {
      template: [
        `先使用 \`${entry.skillName}\` 技能以 auto 模式优化以下用户输入（跳过确认直接提交），将优化结果作为最终提示词：`,
        '',
        '---',
        baseTemplate,
        '---',
      ].join('\n'),
      description: entry.description,
    }
  }

  const fileCommands = loadCommandFiles(commandsDir)
  for (const [name, cmd] of fileCommands) {
    // 磁盘命令最后合并，允许运行时命令文件覆盖内置 catalog 以便本地调试和热修正。
    result[name] = cmd
  }

  return result
}

export function mergeBuiltinAndUserCommands(
  builtinCommands: NonNullable<Config['command']>,
  userCommands: Config['command'] | undefined,
): NonNullable<Config['command']> {
  return {
    ...builtinCommands,
    ...(userCommands ?? {}),
  }
}
