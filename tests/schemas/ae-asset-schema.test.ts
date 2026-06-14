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

  it('应该接受 html-bundle 技能、命令和工具', () => {
    expect(AeSkillNameSchema.parse(SKILL.HTML_BUNDLE)).toBe('ae:html-bundle')
    expect(AeCommandNameSchema.parse(COMMAND.HTML_BUNDLE)).toBe('ae-html-bundle')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.HTML_BUNDLE}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.HTML_BUNDLE}${PA_SUFFIX}`).success).toBe(false)
    expect(TOOL.AE_HTML_BUNDLE).toBe('ae-html-bundle')
    expect(createToolRegistry()[TOOL.AE_HTML_BUNDLE]).toBeDefined()
  })

  it('应该接受 chrome-devtools 指导技能和命令，并拒绝提示词优化变体', () => {
    expect(AeSkillNameSchema.parse(SKILL.CHROME_DEVTOOLS)).toBe('ae:chrome-devtools')
    expect(AeCommandNameSchema.parse(COMMAND.CHROME_DEVTOOLS)).toBe('ae-chrome-devtools')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.CHROME_DEVTOOLS}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.CHROME_DEVTOOLS}${PA_SUFFIX}`).success).toBe(false)
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

  it('应该接受 LSM 技能和命令，并按阶段控制提示词优化变体', () => {
    expect(AeSkillNameSchema.parse(SKILL.LSM_SPEC)).toBe('ae:lsm-spec')
    expect(AeSkillNameSchema.parse(SKILL.LSM_DESIGN)).toBe('ae:lsm-design')
    expect(AeSkillNameSchema.parse(SKILL.LSM_PROTOTYPE)).toBe('ae:lsm-prototype')
    expect(AeSkillNameSchema.parse(SKILL.LSM_TEST)).toBe('ae:lsm-test')
    expect(AeSkillNameSchema.parse(SKILL.LSM_BUILD)).toBe('ae:lsm-build')
    expect(AeSkillNameSchema.parse(SKILL.LSM_ACCEPTANCE)).toBe('ae:lsm-acceptance')
    expect(AeCommandNameSchema.parse(COMMAND.LSM_PROTOTYPE)).toBe('ae-lsm-prototype')
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_SPEC}${PO_SUFFIX}`).success).toBe(true)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_DESIGN}${PA_SUFFIX}`).success).toBe(true)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_TEST}${PO_SUFFIX}`).success).toBe(true)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_PROTOTYPE}${PO_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_BUILD}${PA_SUFFIX}`).success).toBe(false)
    expect(AeCommandNameSchema.safeParse(`${COMMAND.LSM_ACCEPTANCE}${PO_SUFFIX}`).success).toBe(false)
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
