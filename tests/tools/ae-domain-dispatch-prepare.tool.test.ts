import { describe, expect, it } from 'vitest'

import { AGENT } from '../../src/schemas/ae-asset-schema.js'
import { SPECIALIST_PROMPT_TEMPLATES } from '../../src/services/specialist-prompt-templates.js'

type PrepareArgs = {
  domain: 'development'
  intent: string
  constraints?: string[]
  kind?:
    | 'code'
    | 'document'
    | 'test'
    | 'general'
    | 'design'
    | 'prototype'
    | 'mixed'
    | 'hybrid'
  scenes?: string
  targets?: string
  has_security?: boolean
  has_api?: boolean
  has_performance?: boolean
  has_reliability?: boolean
  has_cli?: boolean
  has_tooling?: boolean
  has_agent_config?: boolean
  has_pr_metadata?: boolean
  has_typescript?: boolean
  has_migrations?: boolean
  has_config?: boolean
  has_infra?: boolean
  has_database?: boolean
  has_script?: boolean
  has_ui?: boolean
  has_product_claim?: boolean
  has_architecture_decision?: boolean
  is_high_risk_domain?: boolean
  has_new_abstraction?: boolean
  has_upstream?: boolean
  has_goal_alignment?: boolean
  has_design_contract?: boolean
  has_evidence_claim?: boolean
  changed_lines?: number
  requirement_count?: number
}

async function callTool(args: PrepareArgs) {
  const { aeDomainDispatchPrepareTool } = await import(
    '../../src/tools/ae-domain-dispatch-prepare.tool.js'
  )

  const result = await aeDomainDispatchPrepareTool.execute(
    { constraints: [], ...args } as Parameters<typeof aeDomainDispatchPrepareTool.execute>[0],
    {
      metadata: () => undefined,
    } as unknown as Parameters<typeof aeDomainDispatchPrepareTool.execute>[1],
  )

  return result as string
}

function parseResult(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

describe('ae-domain-dispatch-prepare 工具', () => {
  describe('checkKindDomainConsistency', () => {
    it('development 域传入 kind 时应产生 warn 级警告', async () => {
      const result = await callTool({
        domain: 'development',
        intent: '实现后端 API',
        kind: 'code',
      })

      const parsed = parseResult(result)
      const warnings = parsed.consistencyWarnings as Array<Record<string, unknown>>
      expect(warnings).toHaveLength(1)
      expect(warnings[0].field).toBe('kind')
      expect(warnings[0].severity).toBe('warn')
      expect(String(warnings[0].message)).toContain('development 域不使用 kind')
    })

    it('development 域未传入 kind 时不应产生一致性警告', async () => {
      const result = await callTool({
        domain: 'development',
        intent: '实现后端 API',
      })

      const parsed = parseResult(result)
      const warnings = parsed.consistencyWarnings as Array<Record<string, unknown>>
      expect(warnings).toHaveLength(0)
    })
  })

  describe('buildDispatchGuard', () => {
    it('development 域选中专精代理时应返回 dispatchGuard 含 development-domain', async () => {
      const result = await callTool({
        domain: 'development',
        intent: '实现前端 UI 组件',
        has_ui: true,
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('dispatchGuard')
      const guard = parsed.dispatchGuard as Record<string, unknown>
      expect(guard.currentCount).toBeGreaterThan(0)
      expect(String(guard.rule)).toContain(AGENT.DEVELOPMENT_DOMAIN)
      expect(String(guard.allowedDegradation)).toContain(AGENT.DEVELOPMENT_DOMAIN)
    })
  })

  describe('基本调度准备功能', () => {
    it('应该返回 tasks 数组和 strategy', async () => {
      const result = await callTool({
        domain: 'development',
        intent: '实现前端 UI 组件',
        has_ui: true,
      })

      const parsed = parseResult(result)
      expect(parsed).toHaveProperty('tasks')
      expect(parsed).toHaveProperty('strategy')
      const tasks = parsed.tasks as Array<Record<string, unknown>>
      expect(tasks.length).toBeGreaterThan(0)
      expect(tasks[0]).toHaveProperty('agent')
      expect(tasks[0]).toHaveProperty('prompt')
    })

    it('每个 task 的 prompt 应来自 SPECIALIST_PROMPT_TEMPLATES', async () => {
      const result = await callTool({
        domain: 'development',
        intent: '实现前端 UI 组件',
        has_ui: true,
      })

      const parsed = parseResult(result)
      const tasks = parsed.tasks as Array<Record<string, unknown>>
      for (const task of tasks) {
        const expected = SPECIALIST_PROMPT_TEMPLATES[task.agent as string] ?? `你是一位专精代理: ${task.agent}。`
        expect(task.prompt).toBe(expected)
      }
    })
  })
})
