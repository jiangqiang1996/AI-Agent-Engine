import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL, TOOL } from '../../src/schemas/ae-asset-schema.js'
import { createToolRegistry } from '../../src/tools/index.js'

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

  it('应该只接受 save-experience 经验沉淀入口', () => {
    expect(AeSkillNameSchema.parse(SKILL.SAVE_EXPERIENCE)).toBe('ae:save-experience')
    expect(AeCommandNameSchema.parse(COMMAND.SAVE_EXPERIENCE)).toBe('ae-save-experience')
    expect(AeSkillNameSchema.safeParse('ae:save-rules').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-save-rules').success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SAVE_EXPERIENCE}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SAVE_EXPERIENCE}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 merge-branch 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.MERGE_BRANCH)).toBe('ae:merge-branch')
    expect(AeCommandNameSchema.parse(COMMAND.MERGE_BRANCH)).toBe('ae-merge-branch')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.MERGE_BRANCH}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.MERGE_BRANCH}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 agent-creator 技能和命令，并生成提示词优化变体', () => {
    expect(AeSkillNameSchema.parse(SKILL.AGENT_CREATOR)).toBe('ae:agent-creator')
    expect(AeCommandNameSchema.parse(COMMAND.AGENT_CREATOR)).toBe('ae-agent-creator')
    expect(AeCommandNameSchema.parse(`${COMMAND.AGENT_CREATOR}${PO_SUFFIX}`)).toBe('ae-agent-creator-po')
    expect(AeCommandNameSchema.parse(`${COMMAND.AGENT_CREATOR}${PA_SUFFIX}`)).toBe('ae-agent-creator-pa')
  })

  it('应该声明 setup 证明工具名', () => {
    expect(TOOL.AE_SETUP_PROOF).toBe('ae-setup-proof')
  })

  it('工具注册表应该暴露 setup 证明工具', () => {
    const registry = createToolRegistry()

    expect(registry[TOOL.AE_SETUP_PROOF]).toBeDefined()
    expect(registry[TOOL.AE_SETUP_PROOF]).toHaveProperty('execute')
  })
})
