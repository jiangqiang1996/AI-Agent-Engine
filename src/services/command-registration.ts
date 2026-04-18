import { readFileSync } from 'node:fs'
import { Effect } from 'effect'

import type { Config } from '@opencode-ai/plugin'
import type { TuiCommand } from '@opencode-ai/plugin/tui'

import { parseFrontmatter } from '../utils/frontmatter.js'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { getArgumentContracts } from './argument-contract.js'
import { getPhaseOneEntries } from './ae-catalog.js'

export function buildCommandConfig(manifest: RuntimeAssetManifest): NonNullable<Config['command']> {
  const result: NonNullable<Config['command']> = {}

  for (const entry of getPhaseOneEntries()) {
    const source = manifest.runtimeCommandFiles.find((file) => file.source.replaceAll('\\', '/').endsWith(entry.commandFile))
    let template = `使用 \`${entry.skillName}\` 继续处理这次请求，并沿用参数：\`$ARGUMENTS\`。`
    let description = entry.description

    try {
      const content = Effect.runSync(
        Effect.try({
          try: () => readFileSync(source?.source ?? `${manifest.repoRoot}/${entry.commandFile}`, 'utf8'),
          catch: (error) => (error instanceof Error ? error : new Error(String(error))),
        }),
      )
      const parsed = parseFrontmatter(content)
      template = parsed.body.trim() || template
      description = parsed.data.description || description
    } catch {
      // 命令文件缺失时保留最小可用模板，不让单文件故障阻断整个插件启动。
    }

    result[entry.commandName] = {
      template,
      description,
    }
  }

  return result
}

export function createTuiCommands(trigger?: (value: string) => void): TuiCommand[] {
  const contracts = getArgumentContracts()

  return getPhaseOneEntries().map((entry) => {
    const contract = contracts.find((item) => item.commandName === entry.commandName)
    const description = [entry.description, contract?.argumentHint].filter(Boolean).join(' | ')

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
}
