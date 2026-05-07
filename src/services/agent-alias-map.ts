import { AGENT } from '../schemas/ae-asset-schema.js'

export const AGENT_ALIAS_MAP: ReadonlyMap<string, string> = new Map([
  ['kieran-typescript-reviewer', AGENT.CORRECTNESS_REVIEWER],
  ['cli-readiness-reviewer', AGENT.AGENT_NATIVE_REVIEWER],
  ['cli-agent-readiness-reviewer', AGENT.AGENT_NATIVE_REVIEWER],
  ['security-lens-reviewer', AGENT.SECURITY_REVIEWER],
  ['adversarial-document-reviewer', AGENT.ADVERSARIAL_REVIEWER],
  ['scope-guardian-reviewer', AGENT.PRODUCT_LENS_REVIEWER],
  ['batch-operation-reviewer', AGENT.STEP_GRANULARITY_REVIEWER],
  ['project-standards-reviewer', AGENT.STANDARDS_REVIEWER],
  ['config-reviewer', AGENT.STANDARDS_REVIEWER],
  ['infra-reviewer', AGENT.RELIABILITY_REVIEWER],
  ['database-reviewer', AGENT.DATA_MIGRATIONS_REVIEWER],
  ['script-reviewer', AGENT.MAINTAINABILITY_REVIEWER],
  ['learnings-researcher', AGENT.RESEARCH_REVIEWER],
  ['best-practices-researcher', AGENT.RESEARCH_REVIEWER],
  ['framework-docs-researcher', AGENT.RESEARCH_REVIEWER],
  ['learnings-reviewer', AGENT.RESEARCH_REVIEWER],
  ['product-scope-reviewer', AGENT.PRODUCT_LENS_REVIEWER],
  ['plan-quality-reviewer', AGENT.STEP_GRANULARITY_REVIEWER],
])

export function resolveAgentName(name: string): string {
  return AGENT_ALIAS_MAP.get(name) ?? name
}
