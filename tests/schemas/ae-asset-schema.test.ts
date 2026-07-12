import { describe, expect, it } from 'vitest'

import { AeCommandNameSchema, AeSkillNameSchema, COMMAND, SKILL, TOOL } from '../../src/schemas/ae-asset-schema.js'
import { createToolRegistry } from '../../src/tools/index.js'

describe('ae-asset-schema', () => {
  it('worktree 续执行命令应该作为磁盘命令而不是技能 catalog 命令注册', () => {
    expect(AeCommandNameSchema.safeParse('ae-work-continue').success).toBe(false)
  })

  it('应该接受 skill-creator 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SKILL_CREATOR)).toBe('ae:skill-creator')
    expect(AeCommandNameSchema.parse(COMMAND.SKILL_CREATOR)).toBe('ae-skill-creator')
  })

  it('应该接受 swagger-parser 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.SWAGGER_PARSER)).toBe('ae:swagger-parser')
    expect(AeCommandNameSchema.parse(COMMAND.SWAGGER_PARSER)).toBe('ae-swagger-parser')
  })

  it('应该接受 chrome-devtools 指导技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.CHROME_DEVTOOLS)).toBe('ae:chrome-devtools')
    expect(AeCommandNameSchema.parse(COMMAND.CHROME_DEVTOOLS)).toBe('ae-chrome-devtools')
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
  })

  it('应该接受 merge-branch 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.MERGE_BRANCH)).toBe('ae:merge-branch')
    expect(AeCommandNameSchema.parse(COMMAND.MERGE_BRANCH)).toBe('ae-merge-branch')
  })

  it('应该接受 work-report 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.WORK_REPORT)).toBe('ae:work-report')
    expect(AeCommandNameSchema.parse(COMMAND.WORK_REPORT)).toBe('ae-work-report')
  })

  it('应该接受 agent-creator 技能和命令', () => {
    expect(AeSkillNameSchema.parse(SKILL.AGENT_CREATOR)).toBe('ae:agent-creator')
    expect(AeCommandNameSchema.parse(COMMAND.AGENT_CREATOR)).toBe('ae-agent-creator')
    expect(AeSkillNameSchema.safeParse('ae:agent-updater').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-agent-updater').success).toBe(false)
  })

  it('应该保留 skill-creator 单一入口并拒绝 skill-updater', () => {
    expect(AeSkillNameSchema.parse(SKILL.SKILL_CREATOR)).toBe('ae:skill-creator')
    expect(AeCommandNameSchema.parse(COMMAND.SKILL_CREATOR)).toBe('ae-skill-creator')
    expect(AeSkillNameSchema.safeParse('ae:skill-updater').success).toBe(false)
    expect(AeCommandNameSchema.safeParse('ae-skill-updater').success).toBe(false)
  })

  it('工具注册表应该暴露通用新会话创建工具', () => {
    const registry = createToolRegistry()

    expect(TOOL.AE_CREATE_SESSION).toBe('ae-create-session')
    expect(registry[TOOL.AE_CREATE_SESSION]).toBeDefined()
    expect(registry[TOOL.AE_CREATE_SESSION]).toHaveProperty('execute')
  })

  it('工具注册表应该暴露 review 证明工具', () => {
    const registry = createToolRegistry()

    expect(TOOL.AE_REVIEW_PROOF).toBe('ae-review-proof')
    expect(registry[TOOL.AE_REVIEW_PROOF]).toBeDefined()
    expect(registry[TOOL.AE_REVIEW_PROOF]).toHaveProperty('execute')
  })

  it('工具注册表应该暴露文档提取工具', () => {
    const registry = createToolRegistry()

    expect(TOOL.AE_DOC_EXTRACT).toBe('ae-doc-extract')
    expect(registry[TOOL.AE_DOC_EXTRACT]).toBeDefined()
    expect(registry[TOOL.AE_DOC_EXTRACT]).toHaveProperty('execute')
  })

  it('接受提示词优化技能并派生命令名', () => {
    expect(AeSkillNameSchema.parse(SKILL.PROMPT_OPTIMIZE)).toBe('ae:prompt-optimize')
    expect(COMMAND.PROMPT_OPTIMIZE).toBe('ae-prompt-optimize')
    expect(AeCommandNameSchema.parse(COMMAND.PROMPT_OPTIMIZE)).toBe('ae-prompt-optimize')
  })

  it('不应该重新注册已废弃的浏览器环境入口', () => {
    const deprecatedSkill = ['ae', ':', 'setup'].join('')
    const deprecatedCommand = ['ae', '-', 'setup'].join('')
    const deprecatedTool = ['ae', '-', 'setup', '-', 'proof'].join('')
    const registry = createToolRegistry()

    expect(AeSkillNameSchema.safeParse(deprecatedSkill).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(deprecatedCommand).success).toBe(false)
    expect(registry[deprecatedTool]).toBeUndefined()
  })
})
