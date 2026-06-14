import { REVIEW_MATRIX, type ActivationPredicate, type MatrixEntry } from './review-catalog.js'
import { AGENT } from '../schemas/ae-asset-schema.js'

export type ReviewKind = 'code' | 'document' | 'general'

export type ReviewDocumentType =
  | 'requirements'
  | 'plan'
  | 'test'
  | 'general'
  | 'design'
  | 'prototype'

export type ReviewSceneType =
  | 'code'
  | 'requirements'
  | 'design'
  | 'prototype'
  | 'test-case'
  | 'plan'
  | 'config'
  | 'asset'
  | 'general-document'

export type ReviewTargetType =
  | 'code'
  | 'requirements'
  | 'design'
  | 'prototype'
  | 'test-case'
  | 'plan'
  | 'config'
  | 'asset'
  | 'document'

export interface ReviewSelectionInput {
  kind: ReviewKind
  documentType?: ReviewDocumentType
  reviewScenes?: ReviewSceneType[]
  targetTypes?: ReviewTargetType[]
  hasMixedTargets?: boolean
  hasEvidenceClaim?: boolean
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
  hasGoalAlignment?: boolean
  hasLsmArtifactChain?: boolean
}

export function selectReviewers(input: ReviewSelectionInput): string[] {
  const derived: ReviewSelectionInput = {
    ...input,
    requirementCountGte5: (input.requirementCount ?? 0) >= 5,
    changedLineCountGte50: (input.changedLineCount ?? 0) >= 50,
    hasMixedTargets:
      input.hasMixedTargets ?? (input.kind === 'general' || (input.targetTypes?.length ?? 0) >= 2),
  }
  const selected: string[] = []
  for (const entry of REVIEW_MATRIX) {
    if (matchesEntry(entry, derived)) {
      selected.push(entry.name)
    }
  }
  if (
    derived.hasLsmArtifactChain === true &&
    (derived.kind === 'general' || derived.hasMixedTargets === true)
  ) {
    for (const required of [AGENT.TRACEABILITY_REVIEWER, AGENT.EVIDENCE_REVIEWER]) {
      if (!selected.includes(required)) selected.push(required)
    }
  }
  return selected
}

function matchesEntry(entry: MatrixEntry, input: ReviewSelectionInput): boolean {
  if (!domainMatches(entry, input)) return false
  if (entry.alwaysOn) return true
  if (!entry.conditionGroups || entry.conditionGroups.length === 0) return false
  return entry.conditionGroups.some((group) =>
    group.every((pred) => evaluatePredicate(pred, input)),
  )
}

function domainMatches(entry: MatrixEntry, input: ReviewSelectionInput): boolean {
  if (entry.domain === 'both') return true
  if (input.kind === 'general') {
    return entry.domain === 'document' || entry.domain === 'code'
  }
  return entry.domain === input.kind
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
    case 'contains':
      return Array.isArray(value) && value.includes(pred.value)
    default:
      return false
  }
}
