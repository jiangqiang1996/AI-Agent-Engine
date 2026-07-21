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

export type CoordinationStrategy = 'parallel' | 'pipeline' | 'parallel-then-sequential' | 'conditional'

export type AggregationStrategy = 'union' | 'merge' | 'best-of' | 'reduce'

export interface CoordinationConfig {
  strategy: CoordinationStrategy
  aggregation: AggregationStrategy
}

const DOMAIN_COORDINATION: Record<string, CoordinationConfig> = {
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
  const constraintsLower = (taskIntent.constraints ?? []).map((c) => c.toLowerCase())
  const contextText = Object.values(domainContext)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())
  const allText = [intentLower, ...constraintsLower, (taskIntent.rawInput ?? '').toLowerCase(), ...contextText].join(' ')

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
