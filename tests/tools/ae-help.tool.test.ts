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
  it('应该能按 design 查询发现 design 技能和命令', async () => {
    const text = await callHelp('design')

    expect(text).toContain(SKILL.DESIGN)
    expect(text).toContain(`/${COMMAND.DESIGN}`)
  })

  it('应该能返回 design 技能详情', async () => {
    const text = await callHelp(SKILL.DESIGN)

    expect(text).toContain(`# 技能：${SKILL.DESIGN}`)
    expect(text).toContain(`/${COMMAND.DESIGN}`)
    expect(text).toContain('设计')
  })
})
