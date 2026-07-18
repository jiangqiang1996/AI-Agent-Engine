import { describe, expect, it } from 'vitest'

import { AGENT } from '../../src/schemas/ae-asset-schema.js'
import { SPECIALIST_PROMPT_TEMPLATES } from '../../src/services/specialist-prompt-templates.js'

type SelectArgs = {
  intent: string
  constraints?: string[]
  has_security?: boolean
  has_api?: boolean
  has_performance?: boolean
  has_reliability?: boolean
  has_cli?: boolean
  has_tooling?: boolean
  has_agent_config?: boolean
  has_typescript?: boolean
  has_migrations?: boolean
  has_config?: boolean
  has_infra?: boolean
  has_database?: boolean
  has_script?: boolean
  has_ui?: boolean
  changed_lines?: number
  requirement_count?: number
}

async function callTool(args: SelectArgs) {
  const { aeWorkSpecialistSelectTool } = await import(
    '../../src/tools/ae-work-specialist-select.tool.js'
  )

  const result = await aeWorkSpecialistSelectTool.execute(
    { constraints: [], ...args } as Parameters<typeof aeWorkSpecialistSelectTool.execute>[0],
    {
      metadata: () => undefined,
    } as unknown as Parameters<typeof aeWorkSpecialistSelectTool.execute>[1],
  )

  return result as string
}

function parseResult(result: string): Record<string, unknown> {
  return JSON.parse(result) as Record<string, unknown>
}

describe('ae-work-specialist-select 工具', () => {
  describe('基本调度准备功能', () => {
    it('应该返回 tasks 数组和 strategy', async () => {
      const result = await callTool({
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

    it('has_ui=true 时应选中 frontend-dev', async () => {
      const result = await callTool({
        intent: '实现功能',
        has_ui: true,
      })

      const parsed = parseResult(result)
      const tasks = parsed.tasks as Array<Record<string, unknown>>
      const agents = tasks.map((t) => t.agent)
      expect(agents).toContain(AGENT.FRONTEND_DEV)
    })

    it('has_api=true 时应选中 backend-dev', async () => {
      const result = await callTool({
        intent: '实现功能',
        has_api: true,
      })

      const parsed = parseResult(result)
      const tasks = parsed.tasks as Array<Record<string, unknown>>
      const agents = tasks.map((t) => t.agent)
      expect(agents).toContain(AGENT.BACKEND_DEV)
    })

    it('无法匹配关键词时应兜底选中 debug-fix', async () => {
      const result = await callTool({
        intent: '无法匹配任何专精的意图',
      })

      const parsed = parseResult(result)
      expect(parsed.specialistCount).toBe(1)
      const tasks = parsed.tasks as Array<Record<string, unknown>>
      expect(tasks[0].agent).toBe(AGENT.DEBUG_FIX)
    })
  })
})
