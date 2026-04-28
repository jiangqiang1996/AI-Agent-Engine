import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL, TOOL } from '../../src/schemas/ae-asset-schema.js'

describe('ae-asset-schema', () => {
  it('应该接受 swagger-parser 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SWAGGER_PARSER)).toBe('ae:swagger-parser')
    expect(AeCommandNameSchema.parse(COMMAND.SWAGGER_PARSER)).toBe('ae-swagger-parser')
    expect(AeCommandNameSchema.parse(`${COMMAND.SWAGGER_PARSER}${PO_SUFFIX}`)).toBe('ae-swagger-parser-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.SWAGGER_PARSER}${PA_SUFFIX}`)).toBe('ae-swagger-parser-pa')
  })

  it('应该接受 figma-assets 技能、命令和工具名', () => {
    expect(AeSkillNameSchema.parse(SKILL.FIGMA_ASSETS)).toBe('ae:figma-assets')
    expect(AeCommandNameSchema.parse(COMMAND.FIGMA_ASSETS)).toBe('ae-figma-assets')
    expect(AeCommandNameSchema.parse(`${COMMAND.FIGMA_ASSETS}${PO_SUFFIX}`)).toBe('ae-figma-assets-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.FIGMA_ASSETS}${PA_SUFFIX}`)).toBe('ae-figma-assets-pa')
    expect(TOOL.AE_FIGMA_ASSETS).toBe('ae-figma-assets')
  })
})
