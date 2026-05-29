import {
  getPhaseOneEntries,
  getPhaseOnePoEntries,
  getPhaseOnePaEntries,
  getAllAgentDefinitions,
} from './ae-catalog.js'
import { buildCommandConfig } from './command-registration.js'
import { buildAgentConfig } from './agent-registration.js'
import { getAssetModelRoutingEntries, type AssetModelRoutingEntry } from './asset-model-routing-catalog.js'
import { createRuntimeAssetManifest } from './runtime-asset-manifest.js'
import { createRuntimeAssetManifestFromRoot } from './runtime-asset-manifest.js'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { resolvePluginRootFromModuleUrl } from '../utils/path-utils.js'

/** 技能条目，包含名称、描述、参数提示和关联命令。 */
export interface SkillEntry {
  name: string
  description: string
  argumentHint: string
  commandName: string
  defaultEntry: boolean
}

/** 命令条目，包含名称、描述、分类和可选的基础命令名。 */
export interface CommandEntry {
  name: string
  description: string
  category: string
  baseCommand?: string
}

/** 代理条目，包含名称、阶段和描述。 */
export interface AgentEntry {
  name: string
  stage: string
  description: string
}

function getRepoRoot(): string {
  return resolvePluginRootFromModuleUrl(import.meta.url)
}

function buildSkillEntries(): SkillEntry[] {
  const seen = new Set<string>()
  const entries: SkillEntry[] = []

  for (const e of getPhaseOneEntries()) {
    if (seen.has(e.skillName)) continue
    seen.add(e.skillName)
    entries.push({
      name: e.skillName,
      description: e.description,
      argumentHint: e.argumentHint || '',
      commandName: e.commandName,
      defaultEntry: e.defaultEntry,
    })
  }

  return entries
}

function buildCommandEntries(manifest: RuntimeAssetManifest): CommandEntry[] {
  const config = buildCommandConfig(manifest.commandsDir)
  const poEntries = getPhaseOnePoEntries()
  const paEntries = getPhaseOnePaEntries()
  const poNames = new Set(poEntries.map((e) => e.commandName))
  const paNames = new Set(paEntries.map((e) => e.commandName))

  const entries: CommandEntry[] = []

  for (const [name, cmd] of Object.entries(config)) {
    if (poNames.has(name)) {
      entries.push({
        name,
        description: cmd.description || '',
        category: '提示词优化',
        baseCommand: name.slice(0, -3),
      })
    } else if (paNames.has(name)) {
      entries.push({
        name,
        description: cmd.description || '',
        category: '提示词优化（自动）',
        baseCommand: name.slice(0, -3),
      })
    } else if (name.endsWith('-auto')) {
      entries.push({
        name,
        description: cmd.description || '',
        category: '基础命令',
        baseCommand: name.slice(0, -5),
      })
    } else {
      entries.push({
        name,
        description: cmd.description || '',
        category: '基础命令',
      })
    }
  }

  return entries
}

function buildAgentEntries(manifest: RuntimeAssetManifest): AgentEntry[] {
  const config = buildAgentConfig(manifest)
  const definitions = getAllAgentDefinitions()

  return definitions.map((def) => ({
    name: def.name,
    stage: def.stage,
    description: config[def.name]?.description || def.description,
  }))
}

/** 将技能名转换为命令名（`ae:` 前缀替换为 `ae-`）。 */
export function skillToCommand(skillName: string): string {
  return skillName.replace(/^ae:/, 'ae-')
}

/** 简单的子串匹配，用于帮助信息过滤。 */
export function matchesQuery(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  return lowerText.includes(lowerQuery)
}

/** 帮助目录，包含技能、命令、代理和模型路由条目。 */
export interface HelpCatalog {
  skills: SkillEntry[]
  commands: CommandEntry[]
  agents: AgentEntry[]
  modelRoutes?: AssetModelRoutingEntry[]
}

/**
 * 构建完整帮助目录，扫描技能 catalog、命令文件和代理定义。
 * 传入 `repoRoot` 时从指定仓库根目录定位资产，否则从模块 URL 推断。
 */
export function buildHelpCatalog(repoRoot?: string): HelpCatalog {
  const manifest = repoRoot ? createRuntimeAssetManifestFromRoot(repoRoot) : createRuntimeAssetManifest(import.meta.url)

  return {
    skills: buildSkillEntries(),
    commands: buildCommandEntries(manifest),
    agents: buildAgentEntries(manifest),
    modelRoutes: getAssetModelRoutingEntries(manifest),
  }
}

/** 按查询字符串过滤帮助目录，匹配名称、描述、命令名或分类。 */
export function filterCatalog(catalog: HelpCatalog, query?: string): HelpCatalog {
  if (!query || query.trim() === '') {
    return catalog
  }

  const q = query.trim()

  const skills = catalog.skills.filter(
    (s) => matchesQuery(s.name, q) || matchesQuery(s.description, q) || matchesQuery(s.commandName, q),
  )

  const commands = catalog.commands.filter(
    (c) =>
      matchesQuery(c.name, q) ||
      matchesQuery(c.description, q) ||
      matchesQuery(c.category, q) ||
      (c.baseCommand && matchesQuery(c.baseCommand, q)),
  )

  const agents = catalog.agents.filter(
    (a) => matchesQuery(a.name, q) || matchesQuery(a.description, q) || matchesQuery(a.stage, q),
  )

  const modelRoutes = catalog.modelRoutes?.filter(
    (route) =>
      matchesQuery(route.name, q) ||
      matchesQuery(route.type, q) ||
      matchesQuery(route.scenario ?? '', q) ||
      matchesQuery(route.applyMode, q) ||
      matchesQuery(route.reason, q),
  )

  return { skills, commands, agents, modelRoutes }
}

/** 将帮助目录格式化为 Markdown 表格，按技能、命令、代理和模型路由分组。 */
export function formatHelpCatalog(catalog: HelpCatalog, query?: string): string {
  const lines: string[] = []

  if (query) {
    lines.push(`# AE 帮助信息（过滤条件: "${query}"）`)
  } else {
    lines.push('# AE 帮助信息')
  }

  lines.push('')

  // 技能
  if (catalog.skills.length > 0) {
    lines.push('## 技能')
    lines.push('')
    lines.push('| 技能 | 命令 | 参数 | 说明 |')
    lines.push('|------|------|------|------|')

    for (const skill of catalog.skills) {
      const command = `/${skill.commandName}`
      const argumentHint = skill.argumentHint || '—'
      lines.push(
        `| \`${escapeMarkdownTableCell(skill.name)}\` | \`${escapeMarkdownTableCell(command)}\` | \`${escapeMarkdownTableCell(argumentHint)}\` | ${escapeMarkdownTableCell(skill.description)} |`,
      )
    }
    lines.push('')
  }

  // 命令别名
  if (catalog.commands.length > 0) {
    lines.push('## 命令')
    lines.push('')

    const commandsByCategory = new Map<string, CommandEntry[]>()
    for (const cmd of catalog.commands) {
      const list = commandsByCategory.get(cmd.category) || []
      list.push(cmd)
      commandsByCategory.set(cmd.category, list)
    }

    for (const [category, cmds] of commandsByCategory) {
      lines.push(`**${category}（${cmds.length}）**`)
      lines.push('')
      lines.push('| 命令 | 说明 |')
      lines.push('|------|------|')
      for (const cmd of cmds) {
        lines.push(`| \`/${cmd.name}\` | ${cmd.description} |`)
      }
      lines.push('')
    }
  }

  // 代理
  if (catalog.agents.length > 0) {
    lines.push('## 代理')
    lines.push('')
    lines.push('通过 `@<代理名>` 在会话中主动调用。')
    lines.push('')

    const agentsByStage = new Map<string, AgentEntry[]>()
    for (const agent of catalog.agents) {
      const list = agentsByStage.get(agent.stage) || []
      list.push(agent)
      agentsByStage.set(agent.stage, list)
    }

    for (const [stage, agents] of agentsByStage) {
      const stageLabel =
        stage === 'research'
          ? '研究'
          : stage === 'review'
            ? '审查'
            : stage === 'workflow'
              ? '工作流'
              : stage === 'domain'
                ? '域代理'
                : stage
      lines.push(`**${stageLabel}（${agents.length}）**`)
      lines.push('')
      lines.push('| 代理 | 说明 |')
      lines.push('|------|------|')
      for (const agent of agents) {
        lines.push(`| \`@${agent.name}\` | ${agent.description} |`)
      }
      lines.push('')
    }
  }

  if (catalog.modelRoutes && catalog.modelRoutes.length > 0) {
    lines.push('## 模型路由')
    lines.push('')
    lines.push('静态默认路由只说明内置命令声明的场景和 agent frontmatter 的模型引用；只有用户配置 `modelScenarios` 或资产直接声明真实模型后，注册期才会写入 `model`。')
    lines.push('')
    lines.push('| 类型 | 资产 | 场景 | 应用方式 | 说明 |')
    lines.push('|------|------|------|------|------|')
    for (const route of catalog.modelRoutes) {
      lines.push(
        `| ${route.type} | \`${escapeMarkdownTableCell(route.name)}\` | \`${route.scenario ?? '—'}\` | ${route.applyMode} | ${escapeMarkdownTableCell(route.reason)} |`,
      )
    }
    lines.push('')
  }

  const total = catalog.skills.length + catalog.commands.length + catalog.agents.length + (catalog.modelRoutes?.length ?? 0)
  if (total === 0) {
    lines.push('未找到匹配的结果。')
    lines.push('')
  }

  return lines.join('\n')
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** 构建帮助目录、过滤并格式化为 Markdown 文本的便捷入口。 */
export function generateHelpText(query?: string, repoRoot?: string): string {
  const catalog = buildHelpCatalog(repoRoot)
  const filtered = filterCatalog(catalog, query)
  return formatHelpCatalog(filtered, query)
}
