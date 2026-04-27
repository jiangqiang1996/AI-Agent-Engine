import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from './ae-asset-schema.js'

describe('ae-asset-schema', () => {
  it('应该支持 ae:refactor 技能名', () => {
    expect(AeSkillNameSchema.parse(SKILL.REFACTOR)).toBe('ae:refactor')
  })

  it('应该从 ae:refactor 派生基础命令名', () => {
    expect(COMMAND.REFACTOR).toBe('ae-refactor')
    expect(AeCommandNameSchema.parse(COMMAND.REFACTOR)).toBe('ae-refactor')
  })

  it('应该支持 ae:refactor 的提示词优化派生命令', () => {
    const poCommand = `${COMMAND.REFACTOR}${PO_SUFFIX}`
    const paCommand = `${COMMAND.REFACTOR}${PA_SUFFIX}`

    expect(AeCommandNameSchema.parse(poCommand)).toBe(poCommand)
    expect(AeCommandNameSchema.parse(paCommand)).toBe(paCommand)
  })
})
