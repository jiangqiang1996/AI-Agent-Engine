import type { TaskIntent } from '../schemas/orchestration-protocol.js'
import {
  AGENT,
  type DomainCallRequest,
  type SpecialistDef,
  type SpecialistResult,
  type DomainExecutionResult,
  type DomainFinding,
} from '../schemas/ae-asset-schema.js'
import { getDomainCatalog } from './domain-catalog-service.js'
import { selectReviewers, type ReviewSelectionInput, type ReviewKind, type ReviewSceneType, type ReviewTargetType } from './review-selector.js'

export type CoordinationStrategy = 'parallel' | 'pipeline' | 'parallel-then-sequential' | 'conditional'

export type AggregationStrategy = 'union' | 'merge' | 'best-of' | 'reduce'

export interface CoordinationConfig {
  strategy: CoordinationStrategy
  aggregation: AggregationStrategy
}

const DOMAIN_COORDINATION: Record<string, CoordinationConfig> = {
  review: { strategy: 'parallel', aggregation: 'union' },
  development: { strategy: 'parallel-then-sequential', aggregation: 'merge' },
}

const DOMAIN_AGENT_BASE_MAP: Record<string, string> = {
  review: AGENT.REVIEW_DOMAIN,
  general: AGENT.REVIEW_DOMAIN,
  development: AGENT.DEVELOPMENT_DOMAIN,
}

export function getDomainAgentName(domain: string): string {
  const base = DOMAIN_AGENT_BASE_MAP[domain] ?? AGENT.REVIEW_DOMAIN
  return `@${base}`
}

export const DOMAIN_AGENT_NAMES = new Set([
  AGENT.REVIEW_DOMAIN,
  AGENT.DEVELOPMENT_DOMAIN,
  `@${AGENT.REVIEW_DOMAIN}`,
  `@${AGENT.DEVELOPMENT_DOMAIN}`,
])

export function selectSpecialists(
  domain: string,
  taskIntent: TaskIntent,
  domainContext: DomainCallRequest['domainContext'] = {},
): SpecialistDef[] {
  const catalogDomain = domain === 'general' ? 'review' : domain
  const catalogs = getDomainCatalog(catalogDomain)
  if (catalogs.length === 0) return []

  const catalog = catalogs[0]

  if (catalogDomain === 'review') {
    return selectReviewSpecialists(catalog.specialists, taskIntent, domainContext)
  }

  const selected: SpecialistDef[] = []

  for (const specialist of catalog.specialists) {
    if (isAlwaysOn(specialist, catalogDomain, domainContext)) {
      selected.push(specialist)
      continue
    }

    if (matchesCriteria(specialist, taskIntent, domainContext, catalogDomain)) {
      selected.push(specialist)
    }
  }

  if (catalogDomain === 'development' && selected.length === 0) {
    const debugFix = catalog.specialists.find((s) => s.name === AGENT.DEBUG_FIX)
    if (debugFix) {
      selected.push({ ...debugFix, selectionCriteria: `${debugFix.selectionCriteria}（兜底选中）` })
    }
  }

  return selected
}

function selectReviewSpecialists(
  specialists: SpecialistDef[],
  taskIntent: TaskIntent,
  domainContext: DomainCallRequest['domainContext'],
): SpecialistDef[] {
  const reviewerNames = new Set(selectReviewers(toReviewSelectionInput(taskIntent, domainContext)))
  return specialists.filter((specialist) => reviewerNames.has(specialist.name))
}

function toReviewSelectionInput(
  taskIntent: TaskIntent,
  domainContext: DomainCallRequest['domainContext'],
): ReviewSelectionInput & { dispatchedFlags: Record<string, boolean> } {
  const rawKind = domainContext.normalizedKind ?? domainContext.kind ?? domainContext.reviewType ?? domainContext.domain ?? taskIntent.domain
  const documentType = normalizeDocumentType(domainContext.documentType ?? domainContext.kind ?? domainContext.reviewType)
  const reviewScenes = normalizeStringList<ReviewSceneType>(
    domainContext.reviewScenes ?? domainContext.scenes,
    ['code', 'requirements', 'design', 'prototype', 'test-case', 'config', 'asset', 'general-document'],
  )
  const targetTypes = normalizeStringList<ReviewTargetType>(
    domainContext.targetTypes ?? domainContext.targets,
    ['code', 'requirements', 'design', 'prototype', 'test-case', 'config', 'asset', 'document'],
  )

  const flagEntries: [string, unknown][] = [
    ['hasSecurity', domainContext.hasSecurity ?? domainContext.has_security],
    ['hasPerformance', domainContext.hasPerformance ?? domainContext.has_performance],
    ['hasApi', domainContext.hasApi ?? domainContext.has_api],
    ['hasReliability', domainContext.hasReliability ?? domainContext.has_reliability],
    ['hasCli', domainContext.hasCli ?? domainContext.has_cli],
    ['hasTooling', domainContext.hasTooling ?? domainContext.has_tooling],
    ['hasAgentConfig', domainContext.hasAgentConfig ?? domainContext.has_agent_config],
    ['hasPrMetadata', domainContext.hasPrMetadata ?? domainContext.has_pr_metadata],
    ['hasTypescript', domainContext.hasTypescript ?? domainContext.has_typescript],
    ['hasMigrations', domainContext.hasMigrations ?? domainContext.has_migrations],
    ['hasConfig', domainContext.hasConfig ?? domainContext.has_config],
    ['hasInfra', domainContext.hasInfra ?? domainContext.has_infra],
    ['hasDatabase', domainContext.hasDatabase ?? domainContext.has_database],
    ['hasScript', domainContext.hasScript ?? domainContext.has_script],
    ['hasUi', domainContext.hasUi ?? domainContext.has_ui],
    ['hasProductClaim', domainContext.hasProductClaim ?? domainContext.has_product_claim],
    ['hasArchitectureDecision', domainContext.hasArchitectureDecision ?? domainContext.has_architecture_decision],
    ['isHighRiskDomain', domainContext.isHighRiskDomain ?? domainContext.is_high_risk_domain],
    ['hasNewAbstraction', domainContext.hasNewAbstraction ?? domainContext.has_new_abstraction],
    ['hasUpstream', domainContext.hasUpstream ?? domainContext.has_upstream],
    ['hasGoalAlignment', domainContext.hasGoalAlignment ?? domainContext.has_goal_alignment],
    ['hasDesignContract', domainContext.hasDesignContract ?? domainContext.has_design_contract],
    ['hasEvidenceClaim', domainContext.hasEvidenceClaim ?? domainContext.has_evidence_claim],
  ]

  const flagMap = new Map(flagEntries)
  const dispatchedFlags: Record<string, boolean> = {}
  for (const [key, value] of flagEntries) {
    dispatchedFlags[key] = typeof value === 'boolean'
  }

  const kind: ReviewKind =
    rawKind === 'code'
      ? 'code'
      : rawKind === 'general' || rawKind === 'mixed' || rawKind === 'hybrid'
        ? 'general'
        : 'document'

  const hasMixedTargets =
    getBoolean(domainContext.hasMixedTargets ?? domainContext.has_mixed_targets) ||
    kind === 'general' ||
    (targetTypes?.length ?? 0) >= 2

  return {
    kind,
    documentType,
    reviewScenes,
    targetTypes,
    hasMixedTargets,
    hasEvidenceClaim: getBoolean(flagMap.get('hasEvidenceClaim')),
    changedLineCount: getNumber(domainContext.changedLineCount ?? domainContext.changed_lines),
    hasSecurity: getBoolean(flagMap.get('hasSecurity')),
    hasPerformance: getBoolean(flagMap.get('hasPerformance')),
    hasApi: getBoolean(flagMap.get('hasApi')),
    hasReliability: getBoolean(flagMap.get('hasReliability')),
    hasCli: getBoolean(flagMap.get('hasCli')),
    hasTooling: getBoolean(flagMap.get('hasTooling')),
    hasAgentConfig: getBoolean(flagMap.get('hasAgentConfig')),
    hasPrMetadata: getBoolean(flagMap.get('hasPrMetadata')),
    hasTypescript: getBoolean(flagMap.get('hasTypescript')),
    hasMigrations: getBoolean(flagMap.get('hasMigrations')),
    hasConfig: getBoolean(flagMap.get('hasConfig')),
    hasInfra: getBoolean(flagMap.get('hasInfra')),
    hasDatabase: getBoolean(flagMap.get('hasDatabase')),
    hasScript: getBoolean(flagMap.get('hasScript')),
    hasUi: getBoolean(flagMap.get('hasUi')),
    hasProductClaim: getBoolean(flagMap.get('hasProductClaim')),
    requirementCount: getNumber(domainContext.requirementCount ?? domainContext.requirement_count),
    hasArchitectureDecision: getBoolean(flagMap.get('hasArchitectureDecision')),
    isHighRiskDomain: getBoolean(flagMap.get('isHighRiskDomain')),
    hasNewAbstraction: getBoolean(flagMap.get('hasNewAbstraction')),
    hasUpstream: getBoolean(flagMap.get('hasUpstream')),
    hasGoalAlignment: getBoolean(flagMap.get('hasGoalAlignment')),
    hasDesignContract: getBoolean(flagMap.get('hasDesignContract')),
    dispatchedFlags,
  }
}

function normalizeDocumentType(value: unknown): ReviewSelectionInput['documentType'] {
  if (
    value === 'requirements' ||
    value === 'test' ||
    value === 'general' ||
    value === 'design'
  ) {
    return value
  }

  if (value === 'document') {
    return 'general'
  }

  return undefined
}

function normalizeStringList<T extends string>(value: unknown, allowed: T[]): T[] | undefined {
  if (!value) return undefined
  const raw: string[] = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : typeof value === 'string'
      ? value.split(',')
      : []
  const parts = raw.map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0)
  if (parts.length === 0) return undefined
  const filtered = parts.filter((p): p is T => (allowed as string[]).includes(p))
  return filtered.length > 0 ? filtered : undefined
}

function getBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return false
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function isAlwaysOn(
  specialist: SpecialistDef,
  domain: string,
  domainContext: DomainCallRequest['domainContext'],
): boolean {
  if (domain === 'development' && domainContext.defaultToAll === true) {
    return true
  }

  return false
}

function matchesCriteria(
  specialist: SpecialistDef,
  taskIntent: TaskIntent,
  domainContext: DomainCallRequest['domainContext'],
  domain: string,
): boolean {
  const intentLower = taskIntent.intent.toLowerCase()
  const constraintsLower = taskIntent.constraints.map((c) => c.toLowerCase())
  const contextText = Object.values(domainContext)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())
  const allText = [intentLower, ...constraintsLower, taskIntent.rawInput.toLowerCase(), ...contextText].join(' ')

  const criteriaLower = specialist.selectionCriteria.toLowerCase()
  const capabilityTerms = specialist.capabilities.map((c) => c.toLowerCase())

  for (const term of capabilityTerms) {
    if (allText.includes(term)) return true
  }

  if (criteriaLower.includes('安全') && allText.includes('安全')) return true
  if (criteriaLower.includes('api') && allText.includes('api')) return true
  if (criteriaLower.includes('性能') && allText.includes('性能')) return true
  if (criteriaLower.includes('架构') && allText.includes('架构')) return true
  if (criteriaLower.includes('ui') && (allText.includes('ui') || allText.includes('界面'))) return true
  if (criteriaLower.includes('迁移') && allText.includes('迁移')) return true
  if (specialist.name === AGENT.FRONTEND_DEV && domainContext.hasUi === true) return true
  if (specialist.name === AGENT.BACKEND_DEV && (domainContext.hasApi === true || domainContext.hasDatabase === true)) {
    return true
  }

  return false
}

export function getCoordinationStrategy(domain: string): CoordinationConfig {
  return DOMAIN_COORDINATION[domain] ?? { strategy: 'parallel', aggregation: 'merge' }
}

export function aggregateResults(
  strategy: AggregationStrategy,
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainExecutionResult {
  switch (strategy) {
    case 'union':
      return aggregateUnion(results, structuredFindings)
    case 'merge':
      return aggregateMerge(results, structuredFindings)
    case 'best-of':
      return aggregateBestOf(results, structuredFindings)
    case 'reduce':
      return aggregateReduce(results, structuredFindings)
    default:
      return aggregateMerge(results, structuredFindings)
  }
}

function aggregateUnion(
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainExecutionResult {
  const uniqueFindings = collectFindings(results, structuredFindings)
  const allEvidence = [...new Set(results.flatMap((r) => r.evidence))]
  const hasPartial = results.some((r) => r.status === 'partial')
  const hasFailed = results.some((r) => r.status === 'failed')

  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: `聚合 ${results.length} 个专精代理结果，发现 ${uniqueFindings.length} 个问题`,
    evidence: allEvidence,
    artifacts: [],
    findings: uniqueFindings.length > 0 ? uniqueFindings : undefined,
  }
}

function extractFindingsFromText(text: string): DomainFinding[] {
  const findings: DomainFinding[] = []
  const findingMatch = text.match(/严重级别[：:]\s*([A-Za-z0-9_]+)[\s\S]*?标题[：:]\s*(.+)/g)
  if (findingMatch) {
    for (const fm of findingMatch) {
      const severityMatch = fm.match(/严重级别[：:]\s*([A-Za-z0-9_]+)/)
      const titleMatch = fm.match(/标题[：:]\s*(.+)/)
      if (severityMatch && titleMatch) {
        findings.push({
          severity: severityMatch[1],
          title: titleMatch[1].trim(),
        })
      }
    }
  }
  return findings
}

function collectFindings(
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainFinding[] {
  const validatedFindings = structuredFindings && structuredFindings.length === results.length
    ? structuredFindings
    : undefined
  const allFindings: DomainFinding[] = []
  for (let i = 0; i < results.length; i++) {
    const preParsed = validatedFindings?.[i]
    if (preParsed && preParsed.length > 0) {
      allFindings.push(...preParsed)
    } else {
      allFindings.push(...extractFindingsFromText(results[i].output))
    }
  }
  return deduplicateFindings(allFindings)
}

function aggregateMerge(
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainExecutionResult {
  const allEvidence: string[] = []
  const allArtifacts: string[] = []
  let hasPartial = false
  let hasFailed = false
  const summaries: string[] = []

  for (const result of results) {
    if (result.status === 'partial') hasPartial = true
    if (result.status === 'failed') hasFailed = true
    summaries.push(result.output.substring(0, 200))
    allEvidence.push(...result.evidence)
  }

  const findings = collectFindings(results, structuredFindings)

  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: summaries.join('\n\n'),
    evidence: [...new Set(allEvidence)],
    artifacts: allArtifacts,
    findings: findings.length > 0 ? findings : undefined,
  }
}

function aggregateBestOf(
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainExecutionResult {
  const successResults = results.filter((r) => r.status === 'success')
  const best = successResults[0] ?? results[0]

  if (!best) {
    return {
      status: 'failed',
      summary: '无可用结果',
      evidence: [],
      artifacts: [],
    }
  }

  const bestIndex = results.indexOf(best)
  const validStructuredFindings = structuredFindings && structuredFindings.length === results.length
    ? structuredFindings
    : undefined
  const bestFindings = validStructuredFindings?.[bestIndex] && validStructuredFindings[bestIndex].length > 0
    ? validStructuredFindings[bestIndex]
    : extractFindingsFromText(best.output)

  return {
    status: best.status,
    summary: best.output,
    evidence: best.evidence,
    artifacts: [],
    findings: bestFindings.length > 0 ? deduplicateFindings(bestFindings) : undefined,
  }
}

function aggregateReduce(
  results: SpecialistResult[],
  structuredFindings?: DomainFinding[][],
): DomainExecutionResult {
  const successCount = results.filter((r) => r.status === 'success').length
  const partialCount = results.filter((r) => r.status === 'partial').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  const findings = collectFindings(results, structuredFindings)

  return {
    status: failedCount > 0 ? 'failed' : partialCount > 0 ? 'partial' : 'success',
    summary: `总计 ${results.length} 个专精: ${successCount} 成功, ${partialCount} 部分, ${failedCount} 失败`,
    evidence: results.flatMap((r) => r.evidence),
    artifacts: [],
    findings: findings.length > 0 ? findings : undefined,
  }
}

const SEVERITY_ORDER: Record<string, number> = {
  P0: 4, P1: 3, P2: 2, P3: 1,
  critical: 4, high: 3, medium: 2, low: 1,
}

function deduplicateFindings(findings: DomainFinding[]): DomainFinding[] {
  const best = new Map<string, DomainFinding>()
  for (const f of findings) {
    const titleNorm = f.title.toLowerCase().trim().replace(/\s+/g, ' ')
    const existing = best.get(titleNorm)
    if (!existing || (SEVERITY_ORDER[f.severity] ?? 0) > (SEVERITY_ORDER[existing.severity] ?? 0)) {
      best.set(titleNorm, f)
    }
  }
  return [...best.values()]
}
