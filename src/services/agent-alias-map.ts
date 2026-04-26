export const AGENT_ALIAS_MAP: ReadonlyMap<string, string> = new Map([
  ['kieran-typescript-reviewer', 'correctness-reviewer'],
  ['cli-agent-readiness-reviewer', 'agent-native-reviewer'],
  ['security-lens-reviewer', 'security-reviewer'],
  ['adversarial-document-reviewer', 'adversarial-reviewer'],
  ['product-lens-reviewer', 'product-scope-reviewer'],
  ['scope-guardian-reviewer', 'product-scope-reviewer'],
  ['step-granularity-reviewer', 'plan-quality-reviewer'],
  ['batch-operation-reviewer', 'plan-quality-reviewer'],
  ['project-standards-reviewer', 'standards-reviewer'],
  ['learnings-researcher', 'learnings-reviewer'],
])

export function resolveAgentName(name: string): string {
  return AGENT_ALIAS_MAP.get(name) ?? name
}
