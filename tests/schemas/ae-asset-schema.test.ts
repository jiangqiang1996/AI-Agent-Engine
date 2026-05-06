import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../../src/schemas/ae-asset-schema.js'

describe('ae-asset-schema', () => {
  it('应该接受 asset-debug 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.ASSET_DEBUG)).toBe('ae:asset-debug')
    expect(AeCommandNameSchema.parse(COMMAND.ASSET_DEBUG)).toBe('ae-asset-debug')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.ASSET_DEBUG}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.ASSET_DEBUG}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 swagger-parser 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SWAGGER_PARSER)).toBe('ae:swagger-parser')
    expect(AeCommandNameSchema.parse(COMMAND.SWAGGER_PARSER)).toBe('ae-swagger-parser')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SWAGGER_PARSER}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SWAGGER_PARSER}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 save-session-flow 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SAVE_SESSION_FLOW)).toBe('ae:save-session-flow')
    expect(AeCommandNameSchema.parse(COMMAND.SAVE_SESSION_FLOW)).toBe('ae-save-session-flow')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SAVE_SESSION_FLOW}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SAVE_SESSION_FLOW}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 merge-branch 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.MERGE_BRANCH)).toBe('ae:merge-branch')
    expect(AeCommandNameSchema.parse(COMMAND.MERGE_BRANCH)).toBe('ae-merge-branch')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.MERGE_BRANCH}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.MERGE_BRANCH}${PA_SUFFIX}`).success).toBe(false)
  })
})
