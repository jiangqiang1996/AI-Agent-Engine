import {
  getPhaseOneEntries,
  getAllAgentDefinitions,
} from './ae-catalog.js'
import { buildCommandConfig } from './command-registration.js'
import { buildAgentConfig } from './agent-registration.js'
import { getAssetModelRoutingEntries, type AssetModelRoutingEntry } from './asset-model-routing-catalog.js'
import { createRuntimeAssetManifest, createRuntimeAssetManifestFromRoot, type RuntimeAssetManifest } from './runtime-asset-manifest.js'

/** 技能条目，包含名称、描述、参数提示和关联命令。 */
export interface SkillEntry {
  name: string
  description: string
  argumentHint: string
  commandName: string
}

/** 命令条目，包含名称、描述和分类。 */
export interface CommandEntry {
  name: string
  description: string
  category: string
}

/** 代理条目，包含名称、阶段和描述。 */
export interface AgentEntry {
  name: string
  stage: string
  description: string
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
    })
  }

  return entries
}

function buildCommandEntries(manifest: RuntimeAssetManifest): CommandEntry[] {
  const config = buildCommandConfig(manifest.commandsDir)

  const entries: CommandEntry[] = []

  for (const [name, cmd] of Object.entries(config)) {
    entries.push({
      name,
      description: cmd.description || '',
      category: '基础命令',
    })
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
      matchesQuery(c.category, q),
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
      const stageLabel = STAGE_LABELS[stage] || stage
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

/** 详情条目类型 */
export type DetailEntryType = 'skill' | 'command' | 'agent' | 'modelRoute'

/** 详情条目，包含主条目信息和关联元素。 */
export interface DetailEntry {
  type: DetailEntryType
  name: string
  description: string
  properties: Array<{ label: string; value: string }>
  related: Array<{ type: DetailEntryType; name: string; description: string }>
}

const STAGE_LABELS: Record<string, string> = {
  research: '研究',
  review: '审查',
  workflow: '工作流',
  domain: '域代理',
}

/** 根据精确名称在帮助目录中查找详情条目，聚合关联元素。 */
export function resolveDetail(catalog: HelpCatalog, name: string): DetailEntry | null {
  const normalized = normalizeLookupName(name)

  const skill = catalog.skills.find(
    (s) => s.name === normalized || s.commandName === normalized,
  )
  if (skill) {
    return buildSkillDetail(catalog, skill)
  }

  const command = catalog.commands.find((c) => c.name === normalized)
  if (command) {
    return buildCommandDetail(catalog, command)
  }

  const agent = catalog.agents.find((a) => a.name === normalized)
  if (agent) {
    return buildAgentDetail(catalog, agent)
  }

  const route = catalog.modelRoutes?.find(
    (r) => r.name === normalized,
  )
  if (route) {
    return buildModelRouteDetail(catalog, route)
  }

  return null
}

function normalizeLookupName(name: string): string {
  let result = name.trim()
  if (result.startsWith('/')) result = result.slice(1)
  if (result.startsWith('@')) result = result.slice(1)
  return result
}

function buildSkillDetail(catalog: HelpCatalog, skill: SkillEntry): DetailEntry {
  const related: DetailEntry['related'] = []

  const commands = catalog.commands.filter(
    (c) => c.name === skill.commandName,
  )
  for (const cmd of commands) {
    related.push({ type: 'command', name: cmd.name, description: cmd.description })
  }

  const routes = catalog.modelRoutes?.filter((r) => r.name === skill.commandName)
  if (routes) {
    for (const route of routes) {
      related.push({ type: 'modelRoute', name: route.name, description: route.reason })
    }
  }

  return {
    type: 'skill',
    name: skill.name,
    description: skill.description,
    properties: [
      { label: '命令', value: `/${skill.commandName}` },
      { label: '参数', value: skill.argumentHint || '无' },
    ],
    related,
  }
}

function buildCommandDetail(catalog: HelpCatalog, command: CommandEntry): DetailEntry {
  const related: DetailEntry['related'] = []

  const skill = catalog.skills.find((s) => s.commandName === command.name)
  if (skill) {
    related.push({ type: 'skill', name: skill.name, description: skill.description })
  }

  const routes = catalog.modelRoutes?.filter((r) => r.name === command.name)
  if (routes) {
    for (const route of routes) {
      related.push({ type: 'modelRoute', name: route.name, description: route.reason })
    }
  }

  const properties: Array<{ label: string; value: string }> = [
    { label: '命令', value: `/${command.name}` },
    { label: '分类', value: command.category },
  ]

  return {
    type: 'command',
    name: command.name,
    description: command.description,
    properties,
    related,
  }
}

function buildAgentDetail(catalog: HelpCatalog, agent: AgentEntry): DetailEntry {
  const routes = catalog.modelRoutes?.filter((r) => r.name === agent.name)
  const related: DetailEntry['related'] = []
  if (routes) {
    for (const route of routes) {
      related.push({ type: 'modelRoute', name: route.name, description: route.reason })
    }
  }

  return {
    type: 'agent',
    name: agent.name,
    description: agent.description,
    properties: [
      { label: '调用方式', value: `@${agent.name}` },
      { label: '阶段', value: STAGE_LABELS[agent.stage] || agent.stage },
    ],
    related,
  }
}

function buildModelRouteDetail(
  catalog: HelpCatalog,
  route: AssetModelRoutingEntry,
): DetailEntry {
  const related: DetailEntry['related'] = []

  if (route.type === 'command') {
    const skill = catalog.skills.find((s) => s.commandName === route.name)
    if (skill) {
      related.push({ type: 'skill', name: skill.name, description: skill.description })
    }
    const cmd = catalog.commands.find((c) => c.name === route.name)
    if (cmd) {
      related.push({ type: 'command', name: cmd.name, description: cmd.description })
    }
  } else if (route.type === 'agent') {
    const agent = catalog.agents.find((a) => a.name === route.name)
    if (agent) {
      related.push({ type: 'agent', name: agent.name, description: agent.description })
    }
  }

  return {
    type: 'modelRoute',
    name: route.name,
    description: route.reason,
    properties: [
      { label: '类型', value: route.type === 'command' ? '命令' : '代理' },
      { label: '场景', value: route.scenario ?? '继承默认' },
      { label: '应用方式', value: route.applyMode === 'direct' ? '直接声明' : '继承默认' },
    ],
    related,
  }
}

const DETAIL_TYPE_LABELS: Record<DetailEntryType, string> = {
  skill: '技能',
  command: '命令',
  agent: '代理',
  modelRoute: '模型路由',
}

/** 将详情条目格式化为 Markdown 文本。 */
export function formatDetailEntry(entry: DetailEntry): string {
  const lines: string[] = []
  const typeLabel = DETAIL_TYPE_LABELS[entry.type]

  lines.push(`# ${typeLabel}：${entry.name}`)
  lines.push('')
  lines.push(entry.description)
  lines.push('')

  for (const prop of entry.properties) {
    lines.push(`- **${prop.label}**：${prop.value}`)
  }
  lines.push('')

  if (entry.related.length > 0) {
    lines.push('## 关联')
    lines.push('')
    for (const rel of entry.related) {
      const relLabel = DETAIL_TYPE_LABELS[rel.type]
      const namePrefix = rel.type === 'command' ? '/' : rel.type === 'agent' ? '@' : ''
      lines.push(`- **${relLabel}** \`${namePrefix}${rel.name}\` — ${rel.description}`)
    }
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

  if (query && query.trim() !== '') {
    const detail = resolveDetail(catalog, query.trim())
    if (detail) {
      return formatDetailEntry(detail)
    }
  }

  const filtered = filterCatalog(catalog, query)
  return formatHelpCatalog(filtered, query)
}
