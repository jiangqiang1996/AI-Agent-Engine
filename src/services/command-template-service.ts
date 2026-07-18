import { getGlobalClient } from './client-holder.js'
import { buildCommandConfig } from './command-registration.js'
import { getPhaseOneEntries } from './ae-catalog.js'
import { createRuntimeAssetManifest } from './runtime-asset-manifest.js'

export type CommandTemplateSource = 'opencode-core' | 'ae-plugin' | 'user-defined' | 'unknown'

export interface ResolvedCommandTemplate {
  found: boolean
  commandName: string
  template?: string
  description?: string
  source?: CommandTemplateSource
  message?: string
}

const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

/**
 * 规范化命令名：去掉前导 `/`，trim 空白。
 */
export function normalizeCommandName(raw: string): string {
  return raw.trim().replace(/^\//, '')
}

/**
 * 解析参数数组（对齐 opencode parseArguments）。
 * 用 argsRegex 切分，去掉两端引号。
 */
function parseArguments(input: string): string[] {
  return (input.match(argsRegex) ?? []).map((arg) => arg.replace(quoteTrimRegex, ''))
}

/**
 * 把参数按 opencode evaluateArguments 逻辑替换到模板。
 *
 * 1. $N 位置占位符：最大编号吞掉剩余参数，缺失位置变空串
 * 2. $ARGUMENTS：替换为原始 input 字符串
 * 3. 兜底：模板既无 $N 也无 $ARGUMENTS 且 input 非空 → 末尾追加 \n\n + input
 */
export function evaluateArguments(template: string, input: string): string {
  const args = parseArguments(input)
  const placeholders = template.match(placeholderRegex) ?? []
  const last = Math.max(0, ...placeholders.map((item) => Number(item.slice(1))))
  const expanded = template.replaceAll(placeholderRegex, (_, index) => {
    const position = Number(index)
    if (position < 1) return ''
    const argIndex = position - 1
    if (argIndex >= args.length) return ''
    if (position === last) return args.slice(argIndex).join(' ')
    return args[argIndex]
  })
  const withArguments = expanded.replaceAll('$ARGUMENTS', input)
  if (placeholders.length === 0 && !template.includes('$ARGUMENTS') && input.trim()) {
    return `${withArguments}\n\n${input}`.trim()
  }
  return withArguments.trim()
}

/**
 * 从完整输入中分离命令名和参数。
 * 对齐 opencode CLI slashHead：第一个空白为界。
 * 返回 null 表示输入不是命令格式。
 */
export function splitCommandInput(rawInput: string): { commandName: string; arguments: string } | null {
  const text = rawInput.trimStart()
  if (!text.startsWith('/')) {
    return null
  }

  for (let i = 1; i < text.length; i++) {
    switch (text[i]) {
      case ' ':
      case '\t':
      case '\n':
        return { commandName: text.slice(1, i), arguments: text.slice(i + 1) }
    }
  }
  return { commandName: text.slice(1), arguments: '' }
}

/**
 * 判断命令名是否属于 AE 插件 catalog 内置命令。
 */
function isAeCatalogCommand(commandName: string): boolean {
  return getPhaseOneEntries().some((entry) => entry.commandName === commandName)
}

/**
 * 通过 opencode SDK client 获取全部命令列表（含核心命令、插件命令、用户命令）。
 * client 不可用时返回 null。
 */
async function fetchAllCommandsFromClient(): Promise<Array<{ name: string; template: string; description?: string }> | null> {
  const client = getGlobalClient()
  if (!client) {
    return null
  }

  try {
    const response = await client.command.list()
    return response.data?.map((cmd) => ({
      name: cmd.name,
      template: cmd.template,
      description: cmd.description,
    })) ?? null
  } catch {
    return null
  }
}

/**
 * 降级路径：仅从 AE 插件内置命令配置中查找。
 * 适用于 SDK client 不可用的异常场景。
 */
function resolveFromAeOnly(commandName: string): ResolvedCommandTemplate {
  let manifest
  try {
    manifest = createRuntimeAssetManifest(import.meta.url)
  } catch {
    return {
      found: false,
      commandName,
      message: `无法定位运行时资产目录，命令 "${commandName}" 模板获取失败。`,
    }
  }

  const commandConfig = buildCommandConfig(manifest.commandsDir)
  const cmd = commandConfig[commandName]
  if (!cmd) {
    return {
      found: false,
      commandName,
      message: `命令 "${commandName}" 不存在。`,
    }
  }

  return {
    found: true,
    commandName,
    template: cmd.template,
    description: cmd.description,
    source: 'ae-plugin',
  }
}

/**
 * 解析命令模板：优先通过 SDK client 获取全部命令，降级到 AE 内置命令。
 */
export async function resolveCommandTemplate(rawCommandName: string): Promise<ResolvedCommandTemplate> {
  const commandName = normalizeCommandName(rawCommandName)
  if (!commandName) {
    return {
      found: false,
      commandName,
      message: '命令名为空。',
    }
  }

  const allCommands = await fetchAllCommandsFromClient()

  if (allCommands) {
    const cmd = allCommands.find((c) => c.name === commandName)
    if (!cmd) {
      return {
        found: false,
        commandName,
        message: `命令 "${commandName}" 不存在。`,
      }
    }

    const source: CommandTemplateSource = isAeCatalogCommand(commandName) ? 'ae-plugin' : 'opencode-core'
    return {
      found: true,
      commandName,
      template: cmd.template,
      description: cmd.description,
      source,
    }
  }

  return resolveFromAeOnly(commandName)
}

/**
 * 接收完整输入（如 `/ae-work 实施计划`），判断是否为命令格式。
 * 如果是已知命令，获取模板并按 opencode evaluateArguments 逻辑替换参数，返回展开后的完整提示词。
 * 如果不是命令格式或命令不存在，原样返回输入。
 */
export async function evaluateCommandInput(rawInput: string): Promise<{
  expanded: boolean
  output: string
  commandName?: string
  source?: CommandTemplateSource
}> {
  const split = splitCommandInput(rawInput)
  if (!split) {
    return { expanded: false, output: rawInput }
  }

  const resolved = await resolveCommandTemplate(split.commandName)
  if (!resolved.found || !resolved.template) {
    return { expanded: false, output: rawInput }
  }

  const evaluated = evaluateArguments(resolved.template, split.arguments)
  return {
    expanded: true,
    output: evaluated,
    commandName: split.commandName,
    source: resolved.source,
  }
}
