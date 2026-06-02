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
import { selectReviewers, type ReviewSelectionInput } from './review-selector.js'

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

export function selectSpecialists(
  domain: string,
  taskIntent: TaskIntent,
  domainContext: DomainCallRequest['domainContext'] = {},
): SpecialistDef[] {
  const catalogs = getDomainCatalog(domain)
  if (catalogs.length === 0) return []

  const catalog = catalogs[0]

  if (domain === 'review') {
    return selectReviewSpecialists(catalog.specialists, taskIntent, domainContext)
  }

  const selected: SpecialistDef[] = []

  for (const specialist of catalog.specialists) {
    if (isAlwaysOn(specialist, domain, domainContext)) {
      selected.push(specialist)
      continue
    }

    if (matchesCriteria(specialist, taskIntent, domainContext, domain)) {
      selected.push(specialist)
    }
  }

  if (domain === 'development' && selected.length === 0) {
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
  const rawKind = domainContext.kind ?? domainContext.reviewType ?? domainContext.domain ?? taskIntent.domain
  const documentType = normalizeDocumentType(domainContext.documentType ?? domainContext.kind ?? domainContext.reviewType)

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
  ]

  const dispatchedFlags: Record<string, boolean> = {}
  for (const [key, value] of flagEntries) {
    dispatchedFlags[key] = typeof value === 'boolean'
  }

  return {
    kind: rawKind === 'code' ? 'code' : 'document',
    documentType,
    changedLineCount: getNumber(domainContext.changedLineCount ?? domainContext.changed_lines),
    hasSecurity: getBoolean(flagEntries.find(([k]) => k === 'hasSecurity')![1]),
    hasPerformance: getBoolean(flagEntries.find(([k]) => k === 'hasPerformance')![1]),
    hasApi: getBoolean(flagEntries.find(([k]) => k === 'hasApi')![1]),
    hasReliability: getBoolean(flagEntries.find(([k]) => k === 'hasReliability')![1]),
    hasCli: getBoolean(flagEntries.find(([k]) => k === 'hasCli')![1]),
    hasTooling: getBoolean(flagEntries.find(([k]) => k === 'hasTooling')![1]),
    hasAgentConfig: getBoolean(flagEntries.find(([k]) => k === 'hasAgentConfig')![1]),
    hasPrMetadata: getBoolean(flagEntries.find(([k]) => k === 'hasPrMetadata')![1]),
    hasTypescript: getBoolean(flagEntries.find(([k]) => k === 'hasTypescript')![1]),
    hasMigrations: getBoolean(flagEntries.find(([k]) => k === 'hasMigrations')![1]),
    hasConfig: getBoolean(flagEntries.find(([k]) => k === 'hasConfig')![1]),
    hasInfra: getBoolean(flagEntries.find(([k]) => k === 'hasInfra')![1]),
    hasDatabase: getBoolean(flagEntries.find(([k]) => k === 'hasDatabase')![1]),
    hasScript: getBoolean(flagEntries.find(([k]) => k === 'hasScript')![1]),
    hasUi: getBoolean(flagEntries.find(([k]) => k === 'hasUi')![1]),
    hasProductClaim: getBoolean(flagEntries.find(([k]) => k === 'hasProductClaim')![1]),
    requirementCount: getNumber(domainContext.requirementCount ?? domainContext.requirement_count),
    hasArchitectureDecision: getBoolean(flagEntries.find(([k]) => k === 'hasArchitectureDecision')![1]),
    isHighRiskDomain: getBoolean(flagEntries.find(([k]) => k === 'isHighRiskDomain')![1]),
    hasNewAbstraction: getBoolean(flagEntries.find(([k]) => k === 'hasNewAbstraction')![1]),
    hasUpstream: getBoolean(flagEntries.find(([k]) => k === 'hasUpstream')![1]),
    dispatchedFlags,
  }
}

function normalizeDocumentType(value: unknown): ReviewSelectionInput['documentType'] {
  if (value === 'requirements' || value === 'plan' || value === 'test' || value === 'general') {
    return value
  }

  if (value === 'document') {
    return 'general'
  }

  return undefined
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
): DomainExecutionResult {
  switch (strategy) {
    case 'union':
      return aggregateUnion(results)
    case 'merge':
      return aggregateMerge(results)
    case 'best-of':
      return aggregateBestOf(results)
    case 'reduce':
      return aggregateReduce(results)
    default:
      return aggregateMerge(results)
  }
}

function aggregateUnion(results: SpecialistResult[]): DomainExecutionResult {
  const allFindings: DomainFinding[] = []
  const allEvidence: string[] = []
  let hasPartial = false
  let hasFailed = false

  for (const result of results) {
    if (result.status === 'partial') hasPartial = true
    if (result.status === 'failed') hasFailed = true
    allEvidence.push(...result.evidence)

    const findingMatch = result.output.match(/严重级别[：:]\s*(\S+).*?标题[：:]\s*(.+)/g)
    if (findingMatch) {
      for (const fm of findingMatch) {
        const severityMatch = fm.match(/严重级别[：:]\s*(\S+)/)
        const titleMatch = fm.match(/标题[：:]\s*(.+)/)
        if (severityMatch && titleMatch) {
          allFindings.push({
            severity: severityMatch[1],
            title: titleMatch[1].trim(),
          })
        }
      }
    }
  }

  const uniqueFindings = deduplicateFindings(allFindings)
  const uniqueEvidence = [...new Set(allEvidence)]

  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: `聚合 ${results.length} 个专精代理结果，发现 ${uniqueFindings.length} 个问题`,
    evidence: uniqueEvidence,
    artifacts: [],
    findings: uniqueFindings.length > 0 ? uniqueFindings : undefined,
  }
}

function aggregateMerge(results: SpecialistResult[]): DomainExecutionResult {
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

  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: summaries.join('\n\n'),
    evidence: [...new Set(allEvidence)],
    artifacts: allArtifacts,
  }
}

function aggregateBestOf(results: SpecialistResult[]): DomainExecutionResult {
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

  return {
    status: best.status,
    summary: best.output,
    evidence: best.evidence,
    artifacts: [],
  }
}

function aggregateReduce(results: SpecialistResult[]): DomainExecutionResult {
  const successCount = results.filter((r) => r.status === 'success').length
  const partialCount = results.filter((r) => r.status === 'partial').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  return {
    status: failedCount > 0 ? 'failed' : partialCount > 0 ? 'partial' : 'success',
    summary: `总计 ${results.length} 个专精: ${successCount} 成功, ${partialCount} 部分, ${failedCount} 失败`,
    evidence: results.flatMap((r) => r.evidence),
    artifacts: [],
  }
}

function deduplicateFindings(findings: DomainFinding[]): DomainFinding[] {
  const seen = new Set<string>()
  return findings.filter((f) => {
    const key = `${f.severity}:${f.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
