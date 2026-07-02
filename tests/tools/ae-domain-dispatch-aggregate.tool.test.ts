import { describe, expect, it } from 'vitest'

import { AGENT } from '../../src/schemas/ae-asset-schema.js'

async function callTool(args: {
  strategy: 'union' | 'merge' | 'best-of' | 'reduce'
  results: Array<{
    status: 'success' | 'partial' | 'failed'
    output: string
    evidence: string[]
    agentName?: string
    findings?: Array<{ severity: string; title: string; evidence?: string }>
  }>
  dispatchedAgents: string[]
  skippedAgents?: string[]
  skipReasons?: Record<string, string>
  expectedSpecialistCount?: number
}) {
  const { aeDomainDispatchAggregateTool } = await import(
    '../../src/tools/ae-domain-dispatch-aggregate.tool.js'
  )

  const result = await aeDomainDispatchAggregateTool.execute(
    {
      skippedAgents: [],
      skipReasons: {},
      ...args,
    },
    {
      metadata: () => undefined,
    } as unknown as Parameters<typeof aeDomainDispatchAggregateTool.execute>[1],
  )

  return result as string
}

function parseResult(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

describe('ae-domain-dispatch-aggregate 工具', () => {
  describe('detectDegradationViolation', () => {
    it('dispatchedAgents 为空时不触发违规', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '审查完成',
            evidence: [],
          },
        ],
        dispatchedAgents: [],
        expectedSpecialistCount: 5,
      })

      const parsed = parseResult(result)
      expect(parsed).not.toHaveProperty('guardViolation')
    })

    it('dispatchedAgents 含非域代理时不触发违规', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '审查完成',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.CORRECTNESS_REVIEWER],
        expectedSpecialistCount: 5,
      })

      const parsed = parseResult(result)
      expect(parsed).not.toHaveProperty('guardViolation')
    })

    it('仅域代理且 expectedCount > 0 时触发 DEGRADATION_VIOLATION error', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '域代理汇总',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.REVIEW_DOMAIN],
        expectedSpecialistCount: 5,
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('guardViolation')
      const gv = parsed.guardViolation as Record<string, unknown>
      expect(gv.code).toBe('DEGRADATION_VIOLATION')
      expect(gv.severity).toBe('error')
      expect(gv.message).toContain('5')
      expect(gv.message).toContain(AGENT.REVIEW_DOMAIN)
    })

    it('仅域代理且 expectedCount === 0 时不触发违规（合法降级）', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '域代理汇总',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.REVIEW_DOMAIN],
        expectedSpecialistCount: 0,
      })

      const parsed = parseResult(result)
      expect(parsed).not.toHaveProperty('guardViolation')
    })

    it('仅域代理且 expectedCount 未传入时触发 DOMAIN_AGENT_ONLY_DISPATCH warn', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '域代理汇总',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.REVIEW_DOMAIN],
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('guardViolation')
      const gv = parsed.guardViolation as Record<string, unknown>
      expect(gv.code).toBe('DOMAIN_AGENT_ONLY_DISPATCH')
      expect(gv.severity).toBe('warn')
    })

    it('development 域代理同样触发降级违规检测', async () => {
      const result = await callTool({
        strategy: 'merge',
        results: [
          {
            status: 'success',
            output: '域代理汇总',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.DEVELOPMENT_DOMAIN],
        expectedSpecialistCount: 3,
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('guardViolation')
      const gv = parsed.guardViolation as Record<string, unknown>
      expect(gv.code).toBe('DEGRADATION_VIOLATION')
      expect(gv.severity).toBe('error')
      expect(gv.message).toContain(AGENT.DEVELOPMENT_DOMAIN)
    })

    it('多个域代理混合时只要全为域代理仍触发违规', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '汇总',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.REVIEW_DOMAIN, AGENT.DEVELOPMENT_DOMAIN],
        expectedSpecialistCount: 8,
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('guardViolation')
      const gv = parsed.guardViolation as Record<string, unknown>
      expect(gv.code).toBe('DEGRADATION_VIOLATION')
    })
  })

  describe('基本聚合功能', () => {
    it('应该返回 dispatchManifest 和聚合结果', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '发现一个 P1 问题',
            evidence: ['src/foo.ts:10'],
            findings: [{ severity: 'P1', title: '空指针风险', evidence: 'src/foo.ts:10' }],
          },
        ],
        dispatchedAgents: [AGENT.CORRECTNESS_REVIEWER],
        skippedAgents: [],
        skipReasons: {},
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('dispatchManifest')
      expect(parsed).toHaveProperty('findings')
      const manifest = parsed.dispatchManifest as Record<string, unknown>
      expect(manifest.dispatched).toEqual([AGENT.CORRECTNESS_REVIEWER])
    })

    it('应该在 results 含 findings 时优先使用结构化发现', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '审查输出文本',
            evidence: [],
            findings: [
              { severity: 'P0', title: '严重 bug', evidence: 'file.ts:1' },
              { severity: 'P2', title: '一般问题', evidence: 'file.ts:2' },
            ],
          },
        ],
        dispatchedAgents: [AGENT.CORRECTNESS_REVIEWER],
      })

      const parsed = parseResult(result)
      const findings = parsed.findings as Array<Record<string, unknown>>
      expect(findings).toHaveLength(2)
      expect(findings[0].title).toBe('严重 bug')
    })
  })
})
