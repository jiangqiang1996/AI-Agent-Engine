import { ReviewFindingSchema, type ReviewFinding } from '../schemas/review-finding-schema.js'

export interface ReviewResult {
  findings: ReviewFinding[]
  blocked: boolean
}

function findingKey(finding: ReviewFinding): string {
  return `${finding.title}:${finding.message}`
}

const SEVERITY_RANK: Record<ReviewFinding['severity'], number> = {
  P0: 4,
  P1: 3,
  P2: 2,
  P3: 1,
}

const AUTOFIX_PRIORITY: Record<ReviewFinding['autofixClass'], number> = {
  advisory: 0,
  safe_auto: 1,
  gated_auto: 2,
  manual: 3,
}

export function mergeReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  const merged = new Map<string, ReviewFinding>()

  for (const raw of findings) {
    const finding = ReviewFindingSchema.parse(raw)
    const key = findingKey(finding)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, finding)
      continue
    }

    merged.set(key, {
      ...existing,
      reviewer: `${existing.reviewer}, ${finding.reviewer}`,
      severity: SEVERITY_RANK[finding.severity] > SEVERITY_RANK[existing.severity] ? finding.severity : existing.severity,
      autofixClass:
        AUTOFIX_PRIORITY[finding.autofixClass] > AUTOFIX_PRIORITY[existing.autofixClass]
          ? finding.autofixClass
          : existing.autofixClass,
      evidence: [...new Set([...existing.evidence, ...finding.evidence])],
      requiresVerification: existing.requiresVerification || finding.requiresVerification,
    })
  }

  return [...merged.values()].sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])
}

export function runReviewGate(findings: ReviewFinding[]): ReviewResult {
  const merged = mergeReviewFindings(findings)
  const blocked = merged.some((finding) => finding.severity === 'P0' || finding.severity === 'P1')

  return {
    findings: merged,
    blocked,
  }
}
