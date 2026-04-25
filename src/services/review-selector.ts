import { AGENT } from '../schemas/ae-asset-schema.js'
import { CODE_REVIEWERS, DOCUMENT_REVIEWERS } from './review-catalog.js'

// ae:document-review 的文档审查者选择
// 审查需求文档、计划文档、测试用例文档及其他任意文档
export interface DocumentReviewSelectionInput {
  documentType: 'requirements' | 'plan' | 'test' | 'general'
  requirementCount?: number
  hasUi?: boolean
  hasSecurity?: boolean
  hasArchitectureDecision?: boolean
  isHighRiskDomain?: boolean
  hasNewAbstraction?: boolean
}

// ae:review 的代码审查者选择
// 全能审查：支持多种范围确定方式，排除需求文档和计划文档
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
  const base = DOCUMENT_REVIEWERS.filter((r) => r.alwaysOn).map((r) => r.name)
  const conditional: string[] = []

  if (input.documentType === 'test') {
    conditional.push(AGENT.TEST_CASE_REVIEWER)
  }

  if (input.documentType === 'plan') {
    conditional.push(AGENT.PRODUCT_LENS_REVIEWER, AGENT.STEP_GRANULARITY_REVIEWER, AGENT.BATCH_OPERATION_REVIEWER)
  }

  if (
    (input.requirementCount ?? 0) >= 5 ||
    input.hasArchitectureDecision ||
    input.isHighRiskDomain ||
    input.hasNewAbstraction
  ) {
    conditional.push(AGENT.ADVERSARIAL_DOCUMENT_REVIEWER)
  }

  if (
    (input.requirementCount ?? 0) >= 5 ||
    input.documentType === 'plan'
  ) {
    conditional.push(AGENT.PRODUCT_LENS_REVIEWER, AGENT.SCOPE_GUARDIAN_REVIEWER)
  }

  if (input.hasUi) {
    conditional.push(AGENT.DESIGN_LENS_REVIEWER)
  }

  if (input.hasSecurity) {
    conditional.push(AGENT.SECURITY_LENS_REVIEWER)
  }

  return [...new Set([...base, ...conditional])]
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
