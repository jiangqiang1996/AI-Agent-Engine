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
  it('应该能按 lsm 查询发现全部 LSM 技能和命令', async () => {
    const text = await callHelp('lsm')

    expect(text).toContain(SKILL.LSM_SPEC)
    expect(text).toContain(SKILL.LSM_BUILD)
    expect(text).toContain(`/${COMMAND.LSM_SPEC}`)
    expect(text).toContain(`/${COMMAND.LSM_TEST}-po`)
    expect(text).not.toContain(`/${COMMAND.LSM_BUILD}-po`)
  })

  it('应该能返回 LSM 技能详情', async () => {
    const text = await callHelp(SKILL.LSM_SPEC)

    expect(text).toContain(`# 技能：${SKILL.LSM_SPEC}`)
    expect(text).toContain(`/${COMMAND.LSM_SPEC}`)
    expect(text).toContain('需求')
  })
})
