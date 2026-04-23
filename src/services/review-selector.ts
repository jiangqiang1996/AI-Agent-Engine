import { AGENT } from '../schemas/ae-asset-schema.js'
import { CODE_REVIEWERS, DOCUMENT_REVIEWERS } from './review-catalog.js'

export interface DocumentReviewSelectionInput {
  documentType: 'requirements' | 'plan'
  requirementCount?: number
  hasUi?: boolean
  hasSecurity?: boolean
}

export interface CodeReviewSelectionInput {
  changedLineCount?: number
  hasSecurity?: boolean
  hasPerformance?: boolean
  hasApi?: boolean
  hasReliability?: boolean
  hasCli?: boolean
  hasPrMetadata?: boolean
  hasTypescript?: boolean
  hasMigrations?: boolean
}

export function selectDocumentReviewers(input: DocumentReviewSelectionInput): string[] {
  const selected = DOCUMENT_REVIEWERS.filter((reviewer) => reviewer.alwaysOn).map((reviewer) => reviewer.name)

  if ((input.requirementCount ?? 0) >= 5) {
    selected.push(AGENT.PRODUCT_LENS_REVIEWER, AGENT.SCOPE_GUARDIAN_REVIEWER, AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  }

  if (input.documentType === 'plan' && !selected.includes(AGENT.PRODUCT_LENS_REVIEWER)) {
    selected.push(AGENT.PRODUCT_LENS_REVIEWER)
  }

  if (input.documentType === 'plan') {
    selected.push(AGENT.STEP_GRANULARITY_REVIEWER, AGENT.BATCH_OPERATION_REVIEWER)
  }

  if (input.hasUi) {
    selected.push(AGENT.DESIGN_LENS_REVIEWER)
  }

  if (input.hasSecurity) {
    selected.push(AGENT.SECURITY_LENS_REVIEWER)
  }

  return [...new Set(selected)]
}

export function selectCodeReviewers(input: CodeReviewSelectionInput): string[] {
  const selected = CODE_REVIEWERS.filter((reviewer) => reviewer.alwaysOn).map((reviewer) => reviewer.name)

  if (input.hasSecurity) {
    selected.push(AGENT.SECURITY_REVIEWER)
  }

  if (input.hasPerformance) {
    selected.push(AGENT.PERFORMANCE_REVIEWER)
  }

  if (input.hasApi) {
    selected.push(AGENT.API_CONTRACT_REVIEWER)
  }

  if (input.hasReliability) {
    selected.push(AGENT.RELIABILITY_REVIEWER)
  }

  if (input.hasCli) {
    selected.push(AGENT.CLI_AGENT_READINESS_REVIEWER)
  }

  if (input.hasPrMetadata) {
    selected.push(AGENT.PREVIOUS_COMMENTS_REVIEWER)
  }

  if (input.hasTypescript) {
    selected.push(AGENT.KIERAN_TYPESCRIPT_REVIEWER)
  }

  if ((input.changedLineCount ?? 0) >= 50 || input.hasSecurity || input.hasApi) {
    selected.push(AGENT.ADVERSARIAL_REVIEWER)
  }

  if (input.hasMigrations) {
    selected.push(AGENT.DATA_MIGRATIONS_REVIEWER)
  }

  return [...new Set(selected)]
}
