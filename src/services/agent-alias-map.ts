export const AGENT_ALIAS_MAP: ReadonlyMap<string, string> = new Map([
  ['kieran-typescript-reviewer', 'correctness-reviewer'],
  ['cli-readiness-reviewer', 'agent-native-reviewer'],
  ['cli-agent-readiness-reviewer', 'agent-native-reviewer'],
  ['security-lens-reviewer', 'security-reviewer'],
  ['adversarial-document-reviewer', 'adversarial-reviewer'],
  ['scope-guardian-reviewer', 'product-lens-reviewer'],
  ['batch-operation-reviewer', 'step-granularity-reviewer'],
  ['project-standards-reviewer', 'standards-reviewer'],
  ['config-reviewer', 'standards-reviewer'],
  ['infra-reviewer', 'reliability-reviewer'],
  ['database-reviewer', 'data-migrations-reviewer'],
  ['script-reviewer', 'maintainability-reviewer'],
  ['learnings-researcher', 'research-reviewer'],
  ['best-practices-researcher', 'research-reviewer'],
  ['framework-docs-researcher', 'research-reviewer'],
  ['learnings-reviewer', 'research-reviewer'],
  ['product-scope-reviewer', 'product-lens-reviewer'],
  ['plan-quality-reviewer', 'step-granularity-reviewer'],
])

export function resolveAgentName(name: string): string {
  return AGENT_ALIAS_MAP.get(name) ?? name
}
