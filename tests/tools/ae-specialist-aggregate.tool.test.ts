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
}) {
  const { aeSpecialistAggregateTool } = await import(
    '../../src/tools/ae-specialist-aggregate.tool.js'
  )

  const result = await aeSpecialistAggregateTool.execute(
    {
      skippedAgents: [],
      skipReasons: {},
      ...args,
    },
    {
      metadata: () => undefined,
    } as unknown as Parameters<typeof aeSpecialistAggregateTool.execute>[1],
  )

  return result as string
}

function parseResult(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

describe('ae-specialist-aggregate 工具', () => {
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
        dispatchedAgents: [AGENT.OCR_REVIEWER],
        skippedAgents: [],
        skipReasons: {},
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('dispatchManifest')
      expect(parsed).toHaveProperty('findings')
      const manifest = parsed.dispatchManifest as Record<string, unknown>
      expect(manifest.dispatched).toEqual([AGENT.OCR_REVIEWER])
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
        dispatchedAgents: [AGENT.OCR_REVIEWER],
      })

      const parsed = parseResult(result)
      const findings = parsed.findings as Array<Record<string, unknown>>
      expect(findings).toHaveLength(2)
      expect(findings[0].title).toBe('严重 bug')
    })

    it('merge 策略应合并多个专精代理输出', async () => {
      const result = await callTool({
        strategy: 'merge',
        results: [
          {
            status: 'success',
            output: '前端实现完成',
            evidence: ['src/Frontend.tsx'],
          },
          {
            status: 'success',
            output: '后端实现完成',
            evidence: ['src/backend.ts'],
          },
        ],
        dispatchedAgents: [AGENT.FRONTEND_DEV, AGENT.BACKEND_DEV],
      })

      const parsed = parseResult(result)
      expect(parsed.status).toBe('success')
      const summary = parsed.summary as string
      expect(summary).toContain('前端实现完成')
      expect(summary).toContain('后端实现完成')
    })

    it('含 failed 结果时 status 应为 failed', async () => {
      const result = await callTool({
        strategy: 'union',
        results: [
          {
            status: 'success',
            output: '成功',
            evidence: [],
          },
          {
            status: 'failed',
            output: '失败',
            evidence: [],
          },
        ],
        dispatchedAgents: [AGENT.OCR_REVIEWER, AGENT.DOCUMENT_REVIEWER],
      })

      const parsed = parseResult(result)
      expect(parsed.status).toBe('failed')
    })
  })
})
