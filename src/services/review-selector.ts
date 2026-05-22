import { REVIEW_MATRIX, type ActivationPredicate, type MatrixEntry } from './review-catalog.js'

export interface ReviewSelectionInput {
  kind: 'code' | 'document'
  documentType?: 'requirements' | 'plan' | 'test' | 'general'
  changedLineCount?: number
  hasSecurity?: boolean
  hasPerformance?: boolean
  hasApi?: boolean
  hasReliability?: boolean
  hasCli?: boolean
  hasTooling?: boolean
  hasAgentConfig?: boolean
  hasPrMetadata?: boolean
  hasTypescript?: boolean
  hasMigrations?: boolean
  hasConfig?: boolean
  hasInfra?: boolean
  hasDatabase?: boolean
  hasScript?: boolean
  hasUi?: boolean
  hasProductClaim?: boolean
  requirementCount?: number
  hasArchitectureDecision?: boolean
  isHighRiskDomain?: boolean
  hasNewAbstraction?: boolean
  hasUpstream?: boolean
  requirementCountGte5?: boolean
  changedLineCountGte50?: boolean
}

export function selectReviewers(input: ReviewSelectionInput): string[] {
  const derived: ReviewSelectionInput = {
    ...input,
    requirementCountGte5: (input.requirementCount ?? 0) >= 5,
    changedLineCountGte50: (input.changedLineCount ?? 0) >= 50,
  }
  const selected: string[] = []
  for (const entry of REVIEW_MATRIX) {
    if (matchesEntry(entry, derived)) {
      selected.push(entry.name)
    }
  }
  return selected
}

function matchesEntry(entry: MatrixEntry, input: ReviewSelectionInput): boolean {
  if (entry.domain !== 'both' && entry.domain !== input.kind) return false
  if (entry.alwaysOn) return true
  if (!entry.conditionGroups || entry.conditionGroups.length === 0) return false
  return entry.conditionGroups.some((group) =>
    group.every((pred) => evaluatePredicate(pred, input)),
  )
}

function evaluatePredicate(pred: ActivationPredicate, input: ReviewSelectionInput): boolean {
  const value = (input as unknown as Record<string, unknown>)[pred.field]
  switch (pred.operator) {
    case 'truthy':
      return !!value
    case 'eq':
      return value === pred.value
    case 'oneOf':
      return Array.isArray(pred.value) && pred.value.includes(value)
    default:
      return false
  }
}
