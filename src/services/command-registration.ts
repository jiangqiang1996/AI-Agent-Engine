import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import type { Config } from '@opencode-ai/plugin'

import { getFrontmatterString, parseFrontmatter } from '../utils/frontmatter.js'
import { getPhaseOneEntries } from './ae-catalog.js'
import { getCommandModelScenario } from './asset-model-routing-catalog.js'
import type { ModelScenarioRoutingContext } from './model-scenario-routing-service.js'
import { getModelByScenario, resolveModelReference } from './model-scenario-routing-service.js'
import { getOpencodeGlobalConfigDir } from './opencode-path-service.js'

const ARGUMENTS_PLACEHOLDER = '$ARGUMENTS'

interface LoadedCommand {
  template: string
  description?: string
  model?: string
  modelReference?: string
  [key: string]: unknown
}

/**
 * 从磁盘命令目录加载 `.md` 命令文件，解析 frontmatter 和模板。
 * 目录不存在或不可读时返回空 Map。
 */
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

    const command: LoadedCommand = {
      ...parsed.data,
      template: parsed.body.trim() || ARGUMENTS_PLACEHOLDER,
    }
    if (typeof command.description !== 'string') {
      delete command.description
    }
    const model = getFrontmatterString(parsed.data, 'model')
    if (model) {
      command.modelReference = model
    }

    result.set(name, command)
  }

  return result
}

function applyCommandModel(
  command: LoadedCommand,
  commandName: string,
  routingContext?: ModelScenarioRoutingContext,
): LoadedCommand {
  if (command.modelReference) {
    const resolvedModel = resolveModelReference(routingContext, command.modelReference)
    const { modelReference: _modelReference, ...commandWithoutReference } = command
    return resolvedModel ? { ...commandWithoutReference, model: resolvedModel } : commandWithoutReference
  }

  const scenario = getCommandModelScenario(commandName)
  if (!routingContext || !scenario) {
    return command
  }

  const model = getModelByScenario(routingContext, scenario)
  return model ? { ...command, model } : command
}

/**
 * 构建完整命令配置，合并内置 catalog 命令和磁盘命令文件。
 * 磁盘命令最后合并，允许本地调试覆盖内置定义。
 */
export function buildCommandConfig(
  commandsDir: string,
  routingContext?: ModelScenarioRoutingContext,
): NonNullable<Config['command']> {
  const result: NonNullable<Config['command']> = {}
  const phaseOne = getPhaseOneEntries()

  for (const entry of phaseOne) {
    // catalog 是默认命令真源；仅当条目显式提供模板时才覆盖统一的技能调用包装。
    const template = entry.customTemplate
      ?? `使用 \`${entry.skillName}\` 技能处理这次请求，并沿用参数：\`${ARGUMENTS_PLACEHOLDER}\`。`
    result[entry.commandName] = applyCommandModel({
      template,
      description: entry.description,
    }, entry.commandName, routingContext)
  }

  const fileCommands = loadCommandFiles(commandsDir)
  for (const [name, cmd] of fileCommands) {
    // 磁盘命令最后合并，允许运行时命令文件覆盖内置 catalog 以便本地调试和热修正。
    result[name] = applyCommandModel(cmd, name, routingContext)
  }

  return result
}

/** 合并内置命令与用户命令，用户命令优先。 */
export function mergeBuiltinAndUserCommands(
  builtinCommands: NonNullable<Config['command']>,
  userCommands: Config['command'] | undefined,
): NonNullable<Config['command']> {
  return {
    ...builtinCommands,
    ...(userCommands ?? {}),
  }
}

/** 合并动态命令与已有命令，根据优先级决定谁覆盖谁。 */
export function mergeDynamicCommands(
  dynamicCommands: NonNullable<Config['command']>,
  existingCommands: Config['command'] | undefined,
  dynamicHasPriority: boolean,
): NonNullable<Config['command']> {
  return dynamicHasPriority
    ? {
      ...(existingCommands ?? {}),
      ...dynamicCommands,
    }
    : mergeBuiltinAndUserCommands(dynamicCommands, existingCommands)
}

/**
 * 合并项目级和全局命令目录中的命令文件覆盖。
 * 扫描 `~/.opencode/commands/` 和 `.opencode/commands/` 两个目录。
 */
export function mergeProjectCommandOverrides(
  commands: NonNullable<Config['command']>,
  worktree: string,
  routingContext?: ModelScenarioRoutingContext,
): NonNullable<Config['command']> {
  const result: NonNullable<Config['command']> = { ...commands }
  const directCommandDirs = [
    join(getOpencodeGlobalConfigDir(), 'commands'),
    join(worktree, '.opencode', 'commands'),
  ]

  for (const commandsDir of directCommandDirs) {
    const directCommands = loadCommandFiles(commandsDir)
    for (const [name, command] of directCommands) {
      result[name] = applyCommandModel(command, name, routingContext)
    }
  }

  return result
}
