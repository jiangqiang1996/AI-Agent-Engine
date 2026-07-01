import { describe, expect, it } from 'vitest'

import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { aeHelpTool } from '../../src/tools/ae-help.tool.js'

async function callHelp(query?: string): Promise<string> {
  const definition = aeHelpTool as unknown as {
    execute: (args: Record<string, unknown>, ctx: { metadata: () => undefined }) => Promise<{ output: string } | string>
  }
  const result = await definition.execute({ query }, { metadata: () => undefined })

  return typeof result === 'string' ? result : result.output
}

describe('ae-help 工具', () => {
  it('应该能按 plan 查询发现 plan 技能和命令', async () => {
    const text = await callHelp('plan')

    expect(text).toContain(SKILL.PLAN)
    expect(text).toContain(`/${COMMAND.PLAN}`)
  })

  it('应该能返回 plan 技能详情', async () => {
    const text = await callHelp(SKILL.PLAN)

    expect(text).toContain(`# 技能：${SKILL.PLAN}`)
    expect(text).toContain(`/${COMMAND.PLAN}`)
    expect(text).toContain('计划')
  })
})
