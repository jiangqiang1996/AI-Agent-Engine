import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL, TOOL } from '../../src/schemas/ae-asset-schema.js'
import { createToolRegistry } from '../../src/tools/index.js'

describe('ae-asset-schema', () => {
  it('worktree 续执行命令应该作为磁盘命令而不是技能 catalog 命令注册', () => {
    expect(AeCommandNameSchema.safeParse('ae-work-continue').success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`ae-work-continue${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`ae-work-continue${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 skill-from-session 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SKILL_FROM_SESSION)).toBe('ae:skill-from-session')
    expect(AeCommandNameSchema.parse(COMMAND.SKILL_FROM_SESSION)).toBe('ae-skill-from-session')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SKILL_FROM_SESSION}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SKILL_FROM_SESSION}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 swagger-parser 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SWAGGER_PARSER)).toBe('ae:swagger-parser')
    expect(AeCommandNameSchema.parse(COMMAND.SWAGGER_PARSER)).toBe('ae-swagger-parser')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SWAGGER_PARSER}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.SWAGGER_PARSER}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该拒绝旧会话沉淀和资产纠偏入口', () => {
    expect(AeSkillNameSchema.safeParse('ae:save-session-flow').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-save-session-flow').success).toBe(false)
    expect(AeSkillNameSchema.safeParse('ae:asset-debug').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-asset-debug').success).toBe(false)
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

  it('应该接受 work-report 技能和命令，并拒绝提示词优化变体', () => {
    expect(AeSkillNameSchema.parse(SKILL.WORK_REPORT)).toBe('ae:work-report')
    expect(AeCommandNameSchema.parse(COMMAND.WORK_REPORT)).toBe('ae-work-report')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.WORK_REPORT}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.WORK_REPORT}${PA_SUFFIX}`).success).toBe(false)
  })

  it('应该接受 agent-creator 技能和命令，并拒绝提示词优化变体', () => {
    expect(AeSkillNameSchema.parse(SKILL.AGENT_CREATOR)).toBe('ae:agent-creator')
    expect(AeCommandNameSchema.parse(COMMAND.AGENT_CREATOR)).toBe('ae-agent-creator')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.AGENT_CREATOR}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.AGENT_CREATOR}${PA_SUFFIX}`).success).toBe(false)
    expect(AeSkillNameSchema.safeParse('ae:agent-updater').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-agent-updater').success).toBe(false)
  })

  it('应该保留 skill-creator 单一入口并拒绝 skill-updater', () => {
    expect(AeSkillNameSchema.parse(SKILL.SKILL_CREATOR)).toBe('ae:skill-creator')
    expect(AeCommandNameSchema.parse(COMMAND.SKILL_CREATOR)).toBe('ae-skill-creator')
    expect(AeSkillNameSchema.safeParse('ae:skill-updater').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-skill-updater').success).toBe(false)
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
