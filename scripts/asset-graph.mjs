import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

function safeId(name) {
  return name.replace(/[:/.]/g, '_').replace(/^-/, '_')
}

function dirToSkillName(dir) {
  return dir.replace(/^ae-/, 'ae:')
}

function skillKeyToName(key) {
  return 'ae:' + key.toLowerCase().replace(/_/g, '-')
}

function extractRecoveryFallbacks(sourceText) {
  const funcMatch = sourceText.match(/function fallbackSkillForPhase[\s\S]*?\n\}/)
  if (!funcMatch) return []

  const funcBody = funcMatch[0]
  const results = []
  let currentCases = []

  for (const line of funcBody.split('\n')) {
    const caseMatch = line.match(/case\s+'(\w+)':/)
    if (caseMatch) {
      currentCases.push(caseMatch[1])
      continue
    }
    const returnMatch = line.match(/return\s+SKILL\.(\w+)/)
    if (returnMatch) {
      const target = skillKeyToName(returnMatch[1])
      for (const phase of currentCases) {
        results.push({ from: phase, to: target })
      }
      currentCases = []
    }
  }

  return results
}

function bfsReachable(nodes, edges, startIds, edgeFilter) {
  const adj = new Map()
  const filteredEdges = edgeFilter ? edges.filter(edgeFilter) : edges

  for (const edge of filteredEdges) {
    const neighbors = adj.get(edge.from) || []
    neighbors.push(edge.to)
    adj.set(edge.from, neighbors)
  }

  const visited = new Set()
  const queue = [...startIds]
  while (queue.length > 0) {
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)
    const neighbors = adj.get(current) || []
    for (const n of neighbors) {
      if (!visited.has(n)) queue.push(n)
    }
  }

  return visited
}

export async function collectData() {
  const distDir = join(repoRoot, 'dist', 'src')
  if (!existsSync(distDir)) {
    throw new Error('编译产物不存在，请先运行 npm run build')
  }

  const assetSchema = await import(pathToFileURL(join(distDir, 'schemas', 'ae-asset-schema.js')).href)
  const catalogMod = await import(pathToFileURL(join(distDir, 'services', 'ae-catalog.js')).href)
  const reviewCatalogMod = await import(pathToFileURL(join(distDir, 'services', 'review-catalog.js')).href)
  const frontmatterMod = await import(pathToFileURL(join(distDir, 'utils', 'frontmatter.js')).href)

  const { SKILL, COMMAND, AGENT, TOOL, skillDir } = assetSchema
  const { getPhaseOneEntries, getRequiredAgents, getGildedAgents } = catalogMod
  const { REVIEW_MATRIX } = reviewCatalogMod
  const { parseFrontmatter } = frontmatterMod

  const skillsInConstants = Object.values(SKILL)
  const agentsInConstants = Object.values(AGENT)
  const toolsInConstants = Object.values(TOOL)

  const phaseOneEntries = getPhaseOneEntries()
  const requiredAgents = getRequiredAgents()
  const gildedAgents = getGildedAgents()
  const allAgents = [...requiredAgents, ...gildedAgents]

  const skillsDir = join(repoRoot, 'src', 'assets', 'skills')
  const skillsOnDisk = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((f) => {
        try { return statSync(join(skillsDir, f)).isDirectory() } catch { return false }
      })
    : []

  const agentsDir = join(repoRoot, 'src', 'assets', 'agents')
  const agentsOnDisk = []
  if (existsSync(agentsDir)) {
    for (const stage of readdirSync(agentsDir)) {
      const stageDir = join(agentsDir, stage)
      try {
        if (!statSync(stageDir).isDirectory()) continue
      } catch { continue }
      for (const file of readdirSync(stageDir)) {
        if (file.endsWith('.md')) agentsOnDisk.push(basename(file, '.md'))
      }
    }
  }

  const commandsDir = join(repoRoot, 'src', 'assets', 'commands')
  const commandsOnDisk = existsSync(commandsDir)
    ? readdirSync(commandsDir).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md'))
    : []

  const skillFrontmatters = new Map()
  const skillSlugsOnDisk = []
  for (const slug of skillsOnDisk) {
    const skillFile = join(skillsDir, slug, 'SKILL.md')
    if (existsSync(skillFile)) {
      const content = readFileSync(skillFile, 'utf8')
      const { data } = parseFrontmatter(content)
      skillFrontmatters.set(slug, data)
      skillSlugsOnDisk.push(slug)
    }
  }

  const recoverySourcePath = join(repoRoot, 'src', 'services', 'recovery-service.ts')
  const recoverySource = existsSync(recoverySourcePath) ? readFileSync(recoverySourcePath, 'utf8') : ''
  const recoveryFallbacks = extractRecoveryFallbacks(recoverySource)

  const deprecatedEntries = phaseOneEntries.filter((e) => e.customTemplate)

  const skillToCommands = new Map()
  for (const entry of phaseOneEntries) {
    const cmds = skillToCommands.get(entry.skillName) || []
    cmds.push(entry.commandName)
    skillToCommands.set(entry.skillName, cmds)
  }
  const duplicateEntries = [...skillToCommands.entries()]
    .filter(([, cmds]) => cmds.length > 1)
    .map(([skill, cmds]) => ({ skillName: skill, commands: cmds }))

  const toolToSkill = {
    [TOOL.AE_RECOVERY]: SKILL.LFG,
    [TOOL.AE_REVIEW_CONTRACT]: SKILL.REVIEW,
    [TOOL.AE_HANDOFF]: SKILL.HANDOFF,
    [TOOL.AE_PROMPT_OPTIMIZE]: SKILL.PROMPT_OPTIMIZE,
    [TOOL.AE_HELP]: SKILL.HELP,
  }

  const nodes = []
  const edges = []

  nodes.push({ id: safeId(SKILL.LFG), label: '/ae-lfg ⭐ 默认入口', type: 'entry', rawName: SKILL.LFG })

  for (const skillName of skillsInConstants) {
    const isDeprecated = deprecatedEntries.some((e) => e.skillName === skillName)
    nodes.push({
      id: safeId(skillName),
      label: skillName + (isDeprecated ? ' ⚠️' : ''),
      type: 'skill',
      rawName: skillName,
      meta: { deprecated: isDeprecated ? 'true' : 'false' },
    })
  }

  for (const entry of phaseOneEntries) {
    const cmdId = safeId('cmd:' + entry.commandName)
    const isDeprecated = !!entry.customTemplate
    nodes.push({
      id: cmdId,
      label: '/' + entry.commandName + (isDeprecated ? ' ⚠️' : ''),
      type: 'command',
      rawName: entry.commandName,
    })
    edges.push({
      from: cmdId,
      to: safeId(entry.skillName),
      edgeType: 'command→skill',
      label: '',
      style: 'solid',
    })
  }

  const poCount = phaseOneEntries.filter((e) => e.skillName !== SKILL.PROMPT_OPTIMIZE).length
  nodes.push({
    id: safeId('po-pa-summary'),
    label: `*-po / *-pa (${poCount}+${poCount})`,
    type: 'command',
    rawName: 'po-pa-summary',
  })

  for (const cmdName of commandsOnDisk) {
    nodes.push({
      id: safeId('disk:' + cmdName),
      label: '/' + cmdName + ' 📄',
      type: 'command',
      rawName: cmdName,
      meta: { source: 'filesystem' },
    })
  }

  for (const agent of allAgents) {
    nodes.push({
      id: safeId(agent.name),
      label: agent.name + (agent.tier === 'gilded' ? ' ⚡' : ''),
      type: 'agent',
      rawName: agent.name,
      meta: { tier: agent.tier, stage: agent.stage },
    })
  }

  for (const toolName of toolsInConstants) {
    nodes.push({
      id: safeId('tool:' + toolName),
      label: toolName,
      type: 'tool',
      rawName: toolName,
    })
  }

  edges.push({ from: safeId(SKILL.LFG), to: safeId(SKILL.IDEATE), edgeType: 'phase→next-skill', label: 'optional-pre-step', style: 'solid' })
  edges.push({ from: safeId(SKILL.LFG), to: safeId(SKILL.BRAINSTORM), edgeType: 'phase→next-skill', label: '', style: 'solid' })
  edges.push({ from: safeId(SKILL.IDEATE), to: safeId(SKILL.BRAINSTORM), edgeType: 'phase→next-skill', label: 'optional', style: 'solid' })
  edges.push({ from: safeId(SKILL.BRAINSTORM), to: safeId(SKILL.PLAN), edgeType: 'phase→next-skill', label: '', style: 'solid' })
  edges.push({ from: safeId(SKILL.PLAN), to: safeId(SKILL.REFACTOR), edgeType: 'phase→next-skill', label: 'variant', style: 'solid' })
  edges.push({ from: safeId(SKILL.PLAN), to: safeId(SKILL.WORK), edgeType: 'phase→next-skill', label: '', style: 'solid' })
  edges.push({ from: safeId(SKILL.WORK), to: safeId(SKILL.REVIEW), edgeType: 'phase→next-skill', label: '', style: 'solid' })

  const phaseToSkill = { brainstorm: SKILL.BRAINSTORM, lfg: SKILL.LFG, plan: SKILL.PLAN, work: SKILL.WORK, review: SKILL.REVIEW }
  for (const fb of recoveryFallbacks) {
    const fromSkill = phaseToSkill[fb.from]
    if (!fromSkill || fromSkill === fb.to) continue
    edges.push({
      from: safeId(fromSkill),
      to: safeId(fb.to),
      edgeType: 'phase→fallback-skill',
      label: 'fallback',
      style: 'dashed',
    })
  }

  for (const entry of deprecatedEntries) {
    const redirectMatch = entry.customTemplate.match(/使用\s+`([^`]+)`\s+技能/)
    if (redirectMatch) {
      edges.push({
        from: safeId(entry.skillName),
        to: safeId(redirectMatch[1]),
        edgeType: 'deprecated→redirect',
        label: 'deprecated →',
        style: 'dashed',
      })
    }
  }

  for (const [toolName, skillName] of Object.entries(toolToSkill)) {
    edges.push({
      from: safeId(skillName),
      to: safeId('tool:' + toolName),
      edgeType: 'skill→tool',
      label: '',
      style: 'solid',
    })
  }

  for (const entry of REVIEW_MATRIX) {
    const agentNode = nodes.find((n) => n.rawName === entry.name && n.type === 'agent')
    if (!agentNode) continue

    if (entry.alwaysOn) {
      edges.push({
        from: safeId(SKILL.REVIEW),
        to: safeId(entry.name),
        edgeType: 'review-agent→condition',
        label: 'alwaysOn',
        style: 'solid',
      })
    } else {
      const conditions = (entry.conditionGroups || []).map((group) =>
        group.map((p) => p.field).join('+'),
      )
      edges.push({
        from: safeId(SKILL.REVIEW),
        to: safeId(entry.name),
        edgeType: 'review-agent→condition',
        label: conditions.join(' | '),
        style: 'dashed',
      })
    }
  }

  return {
    nodes,
    edges,
    skillsInConstants,
    skillsOnDisk,
    skillSlugsOnDisk,
    skillFrontmatters,
    commandsFromCatalog: phaseOneEntries.map((e) => e.commandName),
    commandsOnDisk,
    agentsInConstants,
    agentsOnDisk,
    agentsInCatalog: allAgents.map((a) => ({ name: a.name, tier: a.tier, stage: a.stage, description: a.description })),
    agentsInReviewMatrix: REVIEW_MATRIX.map((e) => ({
      name: e.name,
      domain: e.domain,
      alwaysOn: e.alwaysOn,
      conditionGroups: e.conditionGroups,
      description: e.description,
    })),
    toolsInConstants,
    recoveryFallbacks,
    deprecatedEntries: deprecatedEntries.map((e) => ({
      skillName: e.skillName,
      commandName: e.commandName,
      redirect: e.customTemplate,
    })),
    duplicateEntries,
    phaseOneEntries,
    toolToSkill,
    SKILL,
    COMMAND,
    AGENT,
    TOOL,
    REVIEW_MATRIX,
  }
}

export function computeRisks(data) {
  const {
    nodes, edges,
    skillsInConstants, skillsOnDisk, skillSlugsOnDisk,
    commandsFromCatalog, commandsOnDisk,
    agentsInConstants, agentsOnDisk,
    toolsInConstants,
    deprecatedEntries, duplicateEntries,
    agentsInReviewMatrix, agentsInCatalog,
    SKILL,
  } = data

  const risks = []

  const entryNodeIds = nodes
    .filter((n) => n.type === 'entry' || n.type === 'command')
    .map((n) => n.id)

  const allReachable = bfsReachable(nodes, edges, entryNodeIds)
  const guaranteedReachable = bfsReachable(nodes, edges, entryNodeIds, (e) => e.style === 'solid')

  const skillNamesInConstants = new Set(skillsInConstants)
  const toolNamesSet = new Set(toolsInConstants)

  const unreachableGuaranteed = nodes.filter(
    (n) => !allReachable.has(n.id) && n.type !== 'entry' && n.type !== 'command',
  )
  const unreachableConditional = nodes.filter(
    (n) => allReachable.has(n.id) && !guaranteedReachable.has(n.id) && n.type !== 'entry' && n.type !== 'command',
  )

  const unreachableItems = []
  for (const node of unreachableGuaranteed) {
    if (node.type === 'agent') {
      const agentCatalog = agentsInCatalog.find((a) => a.name === node.rawName)
      if (agentCatalog) {
        const isNonReviewAgent = !agentsInReviewMatrix.find((e) => e.name === node.rawName)
        if (isNonReviewAgent) {
          unreachableItems.push({
            name: node.rawName,
            detail: `非审查域代理，无结构化工作流路径 (stage: ${agentCatalog.stage})，依赖 LLM 运行时按需调用`,
            sources: ['节点集', '边集', 'BFS 遍历', 'REVIEW_MATRIX', 'ae-catalog.ts'],
            fixAction: '确认是否为预期；如需结构化可达，添加 skill→agent 边',
          })
          continue
        }
      }
    }
    unreachableItems.push({
      name: node.rawName,
      detail: `无结构化路径可达 (type: ${node.type})`,
      sources: ['节点集', '边集', 'BFS 遍历'],
      fixAction: '检查是否应删除或添加引用',
    })
  }
  for (const node of unreachableConditional) {
    if (node.type === 'agent' && agentsInReviewMatrix.find((e) => e.name === node.rawName && !e.alwaysOn)) {
      continue
    }
    unreachableItems.push({
      name: node.rawName,
      detail: `仅条件/弱引用可达 (type: ${node.type})`,
      sources: ['节点集', '边集', 'BFS 遍历'],
      fixAction: '确认条件路径是否为预期',
    })
  }
  risks.push({
    category: 'unreachable',
    status: unreachableItems.length > 0 ? 'found' : 'not-found-covered',
    items: unreachableItems,
    sources: ['节点集', '边集', 'BFS 遍历（含/不含条件边）'],
  })

  const skillSlugsFromConstants = skillsInConstants.map((s) => s.replace(/^ae:/, 'ae-'))
  const brokenRefItems = []

  for (let i = 0; i < skillsInConstants.length; i++) {
    const slug = skillSlugsFromConstants[i]
    if (!skillsOnDisk.includes(slug)) {
      brokenRefItems.push({
        name: skillsInConstants[i],
        detail: `常量中声明但磁盘目录不存在: src/assets/skills/${slug}/`,
        sources: ['SKILL 常量', '文件系统目录扫描'],
        fixAction: '创建目录和 SKILL.md，或从常量中移除',
      })
    } else if (!skillSlugsOnDisk.includes(slug)) {
      brokenRefItems.push({
        name: skillsInConstants[i],
        detail: `目录存在但缺少 SKILL.md: src/assets/skills/${slug}/`,
        sources: ['SKILL 常量', '文件系统目录扫描'],
        fixAction: '创建 SKILL.md 或清理空目录',
      })
    }
  }

  for (const slug of skillsOnDisk) {
    const skillName = dirToSkillName(slug)
    if (!skillsInConstants.includes(skillName)) {
      brokenRefItems.push({
        name: slug,
        detail: `磁盘目录存在但常量中未声明 (orphan-directory)`,
        sources: ['文件系统目录扫描', 'SKILL 常量'],
        fixAction: '在 SKILL 常量中注册，或删除该目录',
      })
    }
  }

  for (const agentName of agentsInConstants) {
    if (!agentsOnDisk.includes(agentName)) {
      brokenRefItems.push({
        name: agentName,
        detail: `AGENT 常量中声明但磁盘文件不存在: src/assets/agents/*/${agentName}.md`,
        sources: ['AGENT 常量', '文件系统扫描'],
        fixAction: '创建 agent .md 文件，或从常量中移除',
      })
    }
  }

  for (const agentName of agentsOnDisk) {
    if (!agentsInConstants.includes(agentName)) {
      brokenRefItems.push({
        name: agentName,
        detail: `磁盘 agent 文件存在但常量中未声明`,
        sources: ['文件系统扫描', 'AGENT 常量'],
        fixAction: '在 AGENT 常量中注册，或删除该文件',
      })
    }
  }

  risks.push({
    category: 'broken-ref',
    status: brokenRefItems.length > 0 ? 'found' : 'not-found-covered',
    items: brokenRefItems,
    sources: ['SKILL/AGENT 常量', 'PHASE_ONE_ENTRIES', '文件系统目录扫描'],
  })

  const duplicateItems = []
  const deprecatedSkillNames = new Set(deprecatedEntries.map((e) => e.skillName))
  for (const dup of duplicateEntries) {
    if (deprecatedSkillNames.has(dup.skillName)) continue
    duplicateItems.push({
      name: dup.skillName,
      detail: `多个命令指向同一技能: ${dup.commands.join(', ')}`,
      sources: ['PHASE_ONE_ENTRIES (ae-catalog.ts)'],
      fixAction: '评估是否应标注为 deprecated 并指向唯一入口',
    })
  }
  risks.push({
    category: 'duplicate-entry',
    status: duplicateItems.length > 0 ? 'found' : 'not-found-covered',
    items: duplicateItems,
    sources: ['PHASE_ONE_ENTRIES (ae-catalog.ts)'],
  })

  const deprecatedItems = []
  for (const entry of deprecatedEntries) {
    const redirectMatch = entry.redirect.match(/使用\s+`([^`]+)`\s+技能/)
    const redirectTo = redirectMatch ? redirectMatch[1] : '(unknown)'
    deprecatedItems.push({
      name: entry.skillName,
      detail: `customTemplate 重定向 → ${redirectTo}`,
      sources: ['PHASE_ONE_ENTRIES customTemplate (ae-catalog.ts)'],
      fixAction: '评估是否移除注册或更新引用',
    })
  }
  risks.push({
    category: 'deprecated',
    status: deprecatedItems.length > 0 ? 'found' : 'not-found-covered',
    items: deprecatedItems,
    sources: ['PHASE_ONE_ENTRIES customTemplate (ae-catalog.ts)', 'SKILL.md frontmatter (deprecated 字段)'],
  })

  const lowReachItems = []
  const reviewMatrixNames = new Set(agentsInReviewMatrix.map((e) => e.name))

  for (const entry of agentsInReviewMatrix) {
    if (!entry.alwaysOn) {
      const conditions = (entry.conditionGroups || []).map((group) =>
        group.map((p) => p.field).join('+'),
      )
      lowReachItems.push({
        name: entry.name,
        detail: `条件激活 (domain: ${entry.domain}): ${conditions.join(' | ')}`,
        sources: ['REVIEW_MATRIX (review-catalog.ts)'],
        fixAction: '确认是否为期望的低频激活',
      })
    }
  }

  for (const agent of agentsInCatalog) {
    if (agent.tier === 'gilded') {
      lowReachItems.push({
        name: agent.name,
        detail: `gilded 层级 (stage: ${agent.stage})`,
        sources: ['GILDED_AGENTS (ae-catalog.ts)'],
        fixAction: '确认是否为期望的低频代理',
      })
    }
  }

  risks.push({
    category: 'low-reach',
    status: lowReachItems.length > 0 ? 'found' : 'not-found-covered',
    items: lowReachItems,
    sources: ['REVIEW_MATRIX alwaysOn (review-catalog.ts)', 'GILDED_AGENTS tier (ae-catalog.ts)'],
  })

  return { risks }
}

export function renderMermaid(data) {
  const { nodes, edges, SKILL, REVIEW_MATRIX, agentsInCatalog } = data

  const mainFlowSkills = [SKILL.IDEATE, SKILL.BRAINSTORM, SKILL.PLAN, SKILL.REFACTOR, SKILL.WORK, SKILL.REVIEW]
  const auxSkills = Object.values(SKILL).filter((s) => !mainFlowSkills.includes(s) && s !== SKILL.LFG)
  const toolNames = Object.values(data.TOOL)

  let diagram1 = 'graph LR\n'
  diagram1 += '  subgraph entry_main["入口与主流程"]\n'
  diagram1 += `    ${safeId(SKILL.LFG)}["/ae-lfg ⭐ 默认入口"]\n`
  for (const s of mainFlowSkills) {
    const isDeprecated = data.deprecatedEntries.some((e) => e.skillName === s)
    diagram1 += `    ${safeId(s)}["${s}${isDeprecated ? ' ⚠️' : ''}"]\n`
  }
  for (const t of toolNames) {
    diagram1 += `    ${safeId('tool:' + t)}["🔧 ${t}"]\n`
  }
  diagram1 += '  end\n\n'

  diagram1 += '  subgraph aux_skills["辅助技能"]\n'
  for (const s of auxSkills) {
    const isDeprecated = data.deprecatedEntries.some((e) => e.skillName === s)
    diagram1 += `    ${safeId(s)}["${s}${isDeprecated ? ' ⚠️' : ''}"]\n`
  }
  diagram1 += '  end\n\n'

  const mainFlowEdges = edges.filter((e) =>
    e.edgeType === 'phase→next-skill' ||
    e.edgeType === 'phase→fallback-skill' ||
    e.edgeType === 'deprecated→redirect' ||
    e.edgeType === 'skill→tool',
  )
  for (const e of mainFlowEdges) {
    const arrow = e.style === 'dashed' ? '-.->' : '-->'
    const label = e.label ? `|"${e.label}"|` : ''
    diagram1 += `  ${e.from} ${arrow}${label} ${e.to}\n`
  }

  const deprecatedSkills = data.deprecatedEntries.map((e) => e.skillName)
  for (const s of deprecatedSkills) {
    diagram1 += `  style ${safeId(s)} stroke-dasharray: 5 5\n`
  }

  let diagram2 = 'graph LR\n'
  diagram2 += '  subgraph phase_one_cmds["Phase One 命令"]\n'
  for (const entry of data.phaseOneEntries) {
    const isDeprecated = !!entry.customTemplate
    const redirectMatch = entry.customTemplate?.match(/使用\s+`([^`]+)`\s+技能/)
    const targetLabel = isDeprecated && redirectMatch ? ` → ${redirectMatch[1]}` : ` → ${entry.skillName}`
    diagram2 += `    ${safeId('cmd:' + entry.commandName)}["/${entry.commandName}${targetLabel}${isDeprecated ? ' ⚠️' : ''}"]\n`
  }
  diagram2 += '  end\n\n'

  const poCount = data.phaseOneEntries.filter((e) => e.skillName !== SKILL.PROMPT_OPTIMIZE).length
  diagram2 += `  ${safeId('po-pa-summary')}["*-po / *-pa 派生命令 (${poCount}+${poCount})"]\n`
  for (const cmdName of data.commandsOnDisk) {
    diagram2 += `  ${safeId('disk:' + cmdName)}["/${cmdName} 📄 source:filesystem"]\n`
  }

  const docReviewCmd = data.phaseOneEntries.find((e) => e.skillName === SKILL.DOCUMENT_REVIEW)
  const reviewCmd = data.phaseOneEntries.find((e) => e.commandName === SKILL.REVIEW.replace(/^ae:/, 'ae-'))
  if (docReviewCmd && reviewCmd) {
    diagram2 += `\n  ${safeId('cmd:' + docReviewCmd.commandName)} -.->|"deprecated"| ${safeId('cmd:' + reviewCmd.commandName)}\n`
  }

  let diagram3 = 'graph TB\n'
  diagram3 += `  ${safeId(SKILL.REVIEW)}["ae:review"]\n\n`

  const codeAlways = data.agentsInReviewMatrix.filter((e) => e.domain === 'code' && e.alwaysOn)
  const codeConditional = data.agentsInReviewMatrix.filter((e) => e.domain === 'code' && !e.alwaysOn)
  const docAlways = data.agentsInReviewMatrix.filter((e) => e.domain === 'document' && e.alwaysOn)
  const docConditional = data.agentsInReviewMatrix.filter((e) => e.domain === 'document' && !e.alwaysOn)
  const bothDomain = data.agentsInReviewMatrix.filter((e) => e.domain === 'both')
  const reviewMatrixNames = new Set(data.agentsInReviewMatrix.map((e) => e.name))
  const otherAgents = data.agentsInCatalog.filter((a) => !reviewMatrixNames.has(a.name))

  function renderAgentSubgraph(parentId, title, agents, isAlwaysOn) {
    let out = `  subgraph ${safeId('sg:' + title)}["${title}"]\n`
    for (const agent of agents) {
      const tierTag = agent.tier === 'gilded' ? ' ⚡' : ''
      const condTag = !isAlwaysOn && agent.conditionGroups
        ? ` 🔀${agent.conditionGroups.map((g) => g.map((p) => p.field).join('+')).join('|')}`
        : ''
      out += `    ${safeId(agent.name)}["${agent.name}${tierTag}${condTag}"]\n`
    }
    out += '  end\n'

    for (const agent of agents) {
      const arrow = isAlwaysOn ? '-->' : '-.->'
      const label = isAlwaysOn ? '|"alwaysOn"|' : ''
      out += `  ${parentId} ${arrow}${label} ${safeId(agent.name)}\n`
    }
    out += '\n'
    return out
  }

  if (codeAlways.length > 0) {
    diagram3 += renderAgentSubgraph(safeId(SKILL.REVIEW), '代码域 - 常驻', codeAlways, true)
  }
  if (codeConditional.length > 0) {
    diagram3 += renderAgentSubgraph(safeId(SKILL.REVIEW), '代码域 - 条件激活', codeConditional, false)
  }
  if (docAlways.length > 0) {
    diagram3 += renderAgentSubgraph(safeId(SKILL.REVIEW), '文档域 - 常驻', docAlways, true)
  }
  if (docConditional.length > 0) {
    diagram3 += renderAgentSubgraph(safeId(SKILL.REVIEW), '文档域 - 条件激活', docConditional, false)
  }
  if (bothDomain.length > 0) {
    diagram3 += renderAgentSubgraph(safeId(SKILL.REVIEW), '双域 (both)', bothDomain, false)
  }

  if (otherAgents.length > 0) {
    diagram3 += '  subgraph other_agents["其他代理 (非 REVIEW_MATRIX)"]\n'
    for (const agent of otherAgents) {
      const tierTag = agent.tier === 'gilded' ? ' ⚡gilded' : ''
      diagram3 += `    ${safeId(agent.name)}["${agent.name}${tierTag} (${agent.stage})"]\n`
    }
    diagram3 += '  end\n'
  }

  return { diagram1, diagram2, diagram3 }
}

export function renderDiagnostics(risks, data) {
  const { agentsInCatalog, agentsInReviewMatrix, recoveryFallbacks } = data
  const now = new Date().toISOString()

  let out = ''

  out += '## 4. 风险诊断\n\n'
  for (const risk of risks.risks) {
    const statusLabel = {
      found: '🔴 发现',
      'not-found-covered': '🟢 未发现（已覆盖）',
      'not-found-partial': '🟡 未发现（部分覆盖）',
      'not-covered': '⚪ 未覆盖',
    }
    out += `### 4.${risks.risks.indexOf(risk) + 1} ${risk.category}${risk.category === 'unreachable' ? '（不可达资产）' : ''}${risk.category === 'broken-ref' ? '（引用断裂）' : ''}${risk.category === 'duplicate-entry' ? '（重复入口）' : ''}${risk.category === 'deprecated' ? '（已废弃）' : ''}${risk.category === 'low-reach' ? '（低触达率）' : ''}\n\n`
    out += `**状态:** ${statusLabel[risk.status] || risk.status}\n\n`

    if (risk.items.length > 0) {
      out += '| 条目 | 详情 | 已检查数据源 | 推荐修复 |\n'
      out += '|------|------|-------------|----------|\n'
      for (const item of risk.items) {
        out += `| ${item.name} | ${item.detail} | ${item.sources.join(', ')} | ${item.fixAction} |\n`
      }
    } else {
      out += '无发现。\n'
    }
    out += `\n**已检查数据源:** ${risk.sources.join(', ')}\n\n`
  }

  out += '## 5. 代理可达性表\n\n'
  out += '| 代理名 | 域 | 触达方式 | 入口路径摘要 |\n'
  out += '|--------|-----|---------|-------------|\n'

  const reviewMatrixMap = new Map(agentsInReviewMatrix.map((e) => [e.name, e]))
  for (const agent of agentsInCatalog) {
    const rmEntry = reviewMatrixMap.get(agent.name)
    let domain = agent.stage
    let reach = agent.tier === 'gilded' ? 'low-reach (gilded)' : 'runtime 可用'
    let path = agent.tier === 'gilded' ? 'LLM 运行时按需调用' : ''

    if (rmEntry) {
      domain = rmEntry.domain
      if (rmEntry.alwaysOn) {
        reach = 'alwaysOn'
        path = 'ae:review → (alwaysOn)'
      } else {
        reach = 'conditional'
        const conds = (rmEntry.conditionGroups || []).map((g) => g.map((p) => p.field).join('+')).join(' | ')
        path = `ae:review → (条件: ${conds})`
      }
    } else if (agent.tier === 'required') {
      path = 'LLM 运行时按需调用 (非结构化边)'
    }

    out += `| ${agent.name} | ${domain} | ${reach} | ${path} |\n`
  }
  out += '\n'

  out += '## 6. 覆盖边界\n\n'
  out += '### 已覆盖数据源\n\n'
  out += '- SKILL / COMMAND / AGENT / TOOL 常量 (`ae-asset-schema.ts`)\n'
  out += '- PHASE_ONE_ENTRIES (`ae-catalog.ts`)\n'
  out += '- REVIEW_MATRIX (`review-catalog.ts`)\n'
  out += '- SKILL.md frontmatter（name, description 等字段）\n'
  out += '- 文件系统目录扫描（skills/, agents/, commands/）\n'
  out += '- recovery-service.ts 源码文本提取（`fallbackSkillForPhase`）⚠️ 手动同步点\n\n'
  out += '### 未覆盖数据源\n\n'
  out += '- SKILL.md 正文中的 `ae:*` / `@agent` 引用\n'
  out += '- Agent prompt 正文中的技能/工具引用\n'
  out += '- README 等自由文本引用\n\n'
  out += '> **未覆盖 ≠ 确认安全** — 以上未覆盖数据源中可能存在额外的引用关系。\n\n'

  out += '## 7. 鲜度声明\n\n'
  out += `- **生成时间:** ${now}\n`
  out += `- **已扫描目录:** \`src/assets/skills/\`, \`src/assets/agents/\`, \`src/assets/commands/\`, \`src/services/recovery-service.ts\`\n`
  out += '- **更新命令:** `npm run asset-graph`\n\n'

  out += '## 8. 演进建议\n\n'
  out += '- **CI 门禁:** 在 CI 中运行 `npm run asset-graph` 并检查风险条目\n'
  out += '- **自诊断命令:** 将风险摘要集成到 `/ae-help` 输出\n'
  out += '- **自然语言弱证据扩展:** 解析 SKILL.md 正文中的 `ae:*` 和 `@agent` 引用作为弱边\n'
  out += '- **recovery 映射自动化:** 导出 `fallbackSkillForPhase` 消除源码文本提取的手动同步点\n'

  return out
}

export async function generateAssetGraph() {
  const data = await collectData()
  const risks = computeRisks(data)
  const mermaid = renderMermaid(data)
  const diagnostics = renderDiagnostics(risks, data)

  const doc = [
    '# 资产可达性图谱\n',
    `> 本文档由 \`npm run asset-graph\` 自动生成。上次生成：${new Date().toISOString()}\n`,
    '## 1. 入口与主流程\n',
    '```mermaid',
    mermaid.diagram1,
    '```\n',
    '## 2. 命令与技能映射\n',
    '```mermaid',
    mermaid.diagram2,
    '```\n',
    '## 3. 审查代理\n',
    '```mermaid',
    mermaid.diagram3,
    '```\n',
    diagnostics,
  ].join('\n')

  const outputDir = join(repoRoot, 'docs', 'ae')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = join(outputDir, 'asset-graph.md')
  writeFileSync(outputPath, doc, 'utf8')

  return { outputPath, riskSummary: risks.risks.map((r) => ({ category: r.category, status: r.status, count: r.items.length })) }
}

const isMainModule = process.argv[1] && resolve(process.argv[1].replace(/\\/g, '/')) === resolve(fileURLToPath(import.meta.url).replace(/\\/g, '/'))
if (isMainModule) {
  generateAssetGraph()
    .then((result) => {
      console.log(`✅ 资产可达性图谱已生成: ${result.outputPath}`)
      for (const r of result.riskSummary) {
        console.log(`  ${r.category}: ${r.status} (${r.count} 条)`)
      }
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
