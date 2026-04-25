import {
  getPhaseOneEntries,
  getPhaseOnePoEntries,
  getPhaseOnePaEntries,
  getAllAgentDefinitions,
} from './ae-catalog.js'
import { buildCommandConfig } from './command-registration.js'
import { buildAgentConfig } from './agent-registration.js'
import { createRuntimeAssetManifestFromRoot } from './runtime-asset-manifest.js'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

export interface SkillEntry {
  name: string
  description: string
  argumentHint: string
  commandName: string
  defaultEntry: boolean
}

export interface CommandEntry {
  name: string
  description: string
  category: string
  baseCommand?: string
}

export interface AgentEntry {
  name: string
  stage: string
  description: string
}

function getRepoRoot(): string {
  const currentFile = new URL(import.meta.url).pathname
  const segments = currentFile.split(/[/\\]/)
  const srcIdx = segments.lastIndexOf('src')
  const distIdx = segments.lastIndexOf('dist')
  const servicesIdx = segments.lastIndexOf('services')
  const targetIdx = srcIdx !== -1 ? srcIdx : distIdx !== -1 ? distIdx : servicesIdx !== -1 ? servicesIdx - 1 : -1
  if (targetIdx === -1) {
    throw new Error('无法从 import.meta.url 解析项目根目录')
  }
  return segments.slice(0, targetIdx).join('/')
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

function buildAgentEntries(): AgentEntry[] {
  const manifest = createRuntimeAssetManifestFromRoot(getRepoRoot())
  const config = buildAgentConfig(manifest)
  const definitions = getAllAgentDefinitions()

  return definitions.map((def) => ({
    name: def.name,
    stage: def.stage,
    description: config[def.name]?.description || def.description,
  }))
}

export function skillToCommand(skillName: string): string {
  return skillName.replace(/^ae:/, 'ae-')
}

export function matchesQuery(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  return lowerText.includes(lowerQuery)
}

export interface HelpCatalog {
  skills: SkillEntry[]
  commands: CommandEntry[]
  agents: AgentEntry[]
}

export function buildHelpCatalog(repoRoot?: string): HelpCatalog {
  const root = repoRoot || getRepoRoot()
  const manifest = createRuntimeAssetManifestFromRoot(root)

  return {
    skills: buildSkillEntries(),
    commands: buildCommandEntries(manifest),
    agents: buildAgentEntries(),
  }
}

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

  return { skills, commands, agents }
}

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
    lines.push('| 技能 | 命令 | 说明 |')
    lines.push('|------|------|------|')

    for (const skill of catalog.skills) {
      const command = `/${skill.commandName}`
      lines.push(`| \`${skill.name}\` | \`${command}\` | ${skill.description} |`)
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
        stage === 'document-review'
          ? '文档审查'
          : stage === 'research'
            ? '研究'
            : stage === 'review'
              ? '代码审查'
              : stage === 'workflow'
                ? '工作流'
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

  const total = catalog.skills.length + catalog.commands.length + catalog.agents.length
  if (total === 0) {
    lines.push('未找到匹配的结果。')
    lines.push('')
  }

  return lines.join('\n')
}

export function generateHelpText(query?: string, repoRoot?: string): string {
  const catalog = buildHelpCatalog(repoRoot)
  const filtered = filterCatalog(catalog, query)
  return formatHelpCatalog(filtered, query)
}
