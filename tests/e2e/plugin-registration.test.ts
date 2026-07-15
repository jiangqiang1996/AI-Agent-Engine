import { describe, expect, it } from 'vitest'
import { withE2E } from './lib/e2e-fixture.js'

describe('插件注册完整性', () => {
  it(
    'opencode 运行时应成功加载 ai-agent-engine 插件',
    async () => {
      const result = await withE2E(async (fixture) => {
        const healthResp = await fixture.client.global.health()
        return { healthResp }
      })

      expect(result.healthResp.error).toBeUndefined()
      const data = result.healthResp.data as { version?: string } | undefined
      expect(data).toBeDefined()
      expect(data?.version).toBeTruthy()
    },
    60_000,
  )

  it(
    '应该注册 ai-agent-engine 的核心技能',
    async () => {
      const result = await withE2E(async (fixture) => {
        const resp = await fixture.client.app.skills()
        return resp
      })

      expect(result.error).toBeUndefined()
      const skills = result.data as Array<{ name?: string }> | undefined
      expect(skills).toBeDefined()
      expect(Array.isArray(skills)).toBe(true)

      const skillNames = skills!.map((s) => s.name).filter(Boolean)
      expect(skillNames.length).toBeGreaterThan(0)

      const expectedSkills = ['ae:design', 'ae:work', 'ae:review', 'ae:prd']
      for (const name of expectedSkills) {
        expect(skillNames).toContain(name)
      }
    },
    60_000,
  )

  it(
    '应该注册 ai-agent-engine 的核心代理',
    async () => {
      const result = await withE2E(async (fixture) => {
        const resp = await fixture.client.app.agents()
        return resp
      })

      expect(result.error).toBeUndefined()
      const agents = result.data as Array<{ name?: string }> | undefined
      expect(agents).toBeDefined()
      expect(Array.isArray(agents)).toBe(true)

      const agentNames = agents!.map((a) => a.name).filter(Boolean)
      expect(agentNames.length).toBeGreaterThan(0)

      const expectedAgents = ['ocr-reviewer', 'backend-dev']
      for (const name of expectedAgents) {
        expect(agentNames).toContain(name)
      }
    },
    60_000,
  )

  it(
    '应该注册 ai-agent-engine 的核心工具',
    async () => {
      const result = await withE2E(async (fixture) => {
        const resp = await fixture.client.tool.ids()
        return resp
      })

      expect(result.error).toBeUndefined()
      const toolIds = result.data as Array<string> | undefined
      expect(toolIds).toBeDefined()
      expect(Array.isArray(toolIds)).toBe(true)

      const aeTools = toolIds!.filter((id) => id.startsWith('ae-'))
      expect(aeTools.length).toBeGreaterThan(0)

      const expectedTools = ['ae-help', 'ae-review-contract', 'ae-brainstorm']
      for (const id of expectedTools) {
        expect(toolIds).toContain(id)
      }
    },
    60_000,
  )

  it(
    '应该注册 ai-agent-engine 的核心命令',
    async () => {
      const result = await withE2E(async (fixture) => {
        const resp = await fixture.client.command.list()
        return resp
      })

      expect(result.error).toBeUndefined()
      const commands = result.data as Array<{ name?: string }> | undefined
      expect(commands).toBeDefined()
      expect(Array.isArray(commands)).toBe(true)

      const commandNames = commands!.map((c) => c.name).filter(Boolean)
      expect(commandNames.length).toBeGreaterThan(0)

      const expectedCommands = ['ae-work', 'ae-review']
      for (const name of expectedCommands) {
        expect(commandNames).toContain(name)
      }
    },
    60_000,
  )
})
