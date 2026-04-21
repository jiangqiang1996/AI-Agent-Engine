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
}

export function selectDocumentReviewers(input: DocumentReviewSelectionInput): string[] {
  const selected = DOCUMENT_REVIEWERS.filter((reviewer) => reviewer.alwaysOn).map((reviewer) => reviewer.name)

  if ((input.requirementCount ?? 0) >= 5) {
    selected.push('product-lens-reviewer', 'scope-guardian-reviewer', 'adversarial-document-reviewer')
  }

  if (input.documentType === 'plan' && !selected.includes('product-lens-reviewer')) {
    selected.push('product-lens-reviewer')
  }

  if (input.hasUi) {
    selected.push('design-lens-reviewer')
  }

  if (input.hasSecurity) {
    selected.push('security-lens-reviewer')
  }

  return [...new Set(selected)]
}

export function selectCodeReviewers(input: CodeReviewSelectionInput): string[] {
  const selected = CODE_REVIEWERS.filter((reviewer) => reviewer.alwaysOn).map((reviewer) => reviewer.name)

  if (input.hasSecurity) {
    selected.push('security-reviewer')
  }

  if (input.hasPerformance) {
    selected.push('performance-reviewer')
  }

  if (input.hasApi) {
    selected.push('api-contract-reviewer')
  }

  if (input.hasReliability) {
    selected.push('reliability-reviewer')
  }

  if (input.hasCli) {
    selected.push('cli-readiness-reviewer')
  }

  if (input.hasPrMetadata) {
    selected.push('previous-comments-reviewer')
  }

  if (input.hasTypescript) {
    selected.push('kieran-typescript-reviewer')
  }

  if ((input.changedLineCount ?? 0) >= 50 || input.hasSecurity || input.hasApi) {
    selected.push('adversarial-reviewer')
  }

  return [...new Set(selected)]
}
