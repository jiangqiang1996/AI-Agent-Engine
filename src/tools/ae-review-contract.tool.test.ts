import { describe, expect, it } from 'vitest'

import { aeReviewContractTool } from './ae-review-contract.tool.js'

describe('ae-review-contract.tool', () => {
  it('应该为代码审查返回 reviewer 与 gate 信息', async () => {
    const output = await aeReviewContractTool.execute(
      {
        kind: 'code',
        mode: 'interactive',
        has_cli: true,
        has_typescript: true,
        changed_lines: 80,
      },
      {} as never,
    )

    const parsed = JSON.parse(output as string) as { reviewers: string[]; gate: string; kind: string }
    expect(parsed.kind).toBe('code')
    expect(parsed.reviewers).toContain('kieran-typescript-reviewer')
    expect(parsed.gate).toContain('P0/P1')
  })

  it('应该为计划审查返回 document-review reviewer family', async () => {
    const output = await aeReviewContractTool.execute(
      {
        kind: 'plan',
        mode: 'headless',
        requirement_count: 6,
      },
      {} as never,
    )

    const parsed = JSON.parse(output as string) as { reviewers: string[]; kind: string; mode: string }
    expect(parsed.kind).toBe('plan')
    expect(parsed.mode).toBe('headless')
    expect(parsed.reviewers).toContain('coherence-reviewer')
  })
})
