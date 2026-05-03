import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL, TOOL } from '../../src/schemas/ae-asset-schema.js'

describe('ae-asset-schema', () => {
  it('应该接受 asset-debug 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.ASSET_DEBUG)).toBe('ae:asset-debug')
    expect(AeCommandNameSchema.parse(COMMAND.ASSET_DEBUG)).toBe('ae-asset-debug')
    expect(AeCommandNameSchema.parse(`${COMMAND.ASSET_DEBUG}${PO_SUFFIX}`)).toBe('ae-asset-debug-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.ASSET_DEBUG}${PA_SUFFIX}`)).toBe('ae-asset-debug-pa')
  })

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

  it('应该接受 save-session-flow 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SAVE_SESSION_FLOW)).toBe('ae:save-session-flow')
    expect(AeCommandNameSchema.parse(COMMAND.SAVE_SESSION_FLOW)).toBe('ae-save-session-flow')
    expect(AeCommandNameSchema.parse(`${COMMAND.SAVE_SESSION_FLOW}${PO_SUFFIX}`)).toBe('ae-save-session-flow-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.SAVE_SESSION_FLOW}${PA_SUFFIX}`)).toBe('ae-save-session-flow-pa')
  })

  it('应该接受 merge-branch 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.MERGE_BRANCH)).toBe('ae:merge-branch')
    expect(AeCommandNameSchema.parse(COMMAND.MERGE_BRANCH)).toBe('ae-merge-branch')
    expect(AeCommandNameSchema.parse(`${COMMAND.MERGE_BRANCH}${PO_SUFFIX}`)).toBe('ae-merge-branch-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.MERGE_BRANCH}${PA_SUFFIX}`)).toBe('ae-merge-branch-pa')
  })
})
