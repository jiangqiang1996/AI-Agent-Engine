import { describe, it, expect } from 'vitest'

import { AGENT } from '../schemas/ae-asset-schema.js'

interface ReviewContractResult {
  kind: string
  documentType?: string
  mode: string
  reviewers: string[]
  gate: string
}

async function callTool(args: { kind: 'document' | 'plan' | 'test' | 'general' | 'code'; mode?: string }) {
  const { aeReviewContractTool: tool } = await import('./ae-review-contract.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }

  const mockCtx = {
    metadata: () => undefined,
    directory: '/test',
    sessionID: 'test-session',
    worktree: '/test',
    abort: new AbortController().signal,
  }

  const result = await definition.execute({ mode: 'report-only', ...args }, mockCtx)
  return JSON.parse(result) as ReviewContractResult
}

describe('ae-review-contract 工具', () => {
  it('test 类型应返回测试文档契约并激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'test' })

    expect(result.kind).toBe('test')
    expect(result.documentType).toBe('test')
    expect(result.reviewers).toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('document 类型默认不应激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'document' })

    expect(result.kind).toBe('document')
    expect(result.documentType).toBe('requirements')
    expect(result.reviewers).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('plan 类型不应激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'plan' })

    expect(result.documentType).toBe('plan')
    expect(result.reviewers).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })

  it('general 类型应返回通用文档契约且不激活 test-case-reviewer', async () => {
    const result = await callTool({ kind: 'general' })

    expect(result.documentType).toBe('general')
    expect(result.reviewers).not.toContain(AGENT.TEST_CASE_REVIEWER)
  })
})
