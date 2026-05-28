import { describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'

describe('help-catalog-service 集成', () => {
  it('应该在真实帮助目录中暴露 ae:skill-from-session 入口', () => {
    const text = generateHelpText('skill-from-session')

    expect(text).toContain(SKILL.SKILL_FROM_SESSION)
    expect(text).toContain(`/${COMMAND.SKILL_FROM_SESSION}`)
    expect(text).not.toContain(`/${COMMAND.SKILL_FROM_SESSION}${PO_SUFFIX}`)
    expect(text).not.toContain(`/${COMMAND.SKILL_FROM_SESSION}${PA_SUFFIX}`)
    expect(text).toContain('从当前会话创建或更新 OpenCode 原生技能')
    expect(text).toContain('[目标技能名\\|流程关注点\\|资产名\\|纠偏摘要]')
  })

  it('应该在真实帮助目录中暴露 ae:refactor 入口', () => {
    const text = generateHelpText('refactor')

    expect(text).toContain(SKILL.REFACTOR)
    expect(text).toContain(`/${COMMAND.REFACTOR}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PA_SUFFIX}`)
    expect(text).toContain('[重构目标\\|计划路径\\|需求文档路径\\|旧机制描述]')
  })

  it('应该在真实帮助目录中暴露 ae:merge-branch 入口', () => {
    const text = generateHelpText('merge-branch')

    expect(text).toContain(SKILL.MERGE_BRANCH)
    expect(text).toContain(`/${COMMAND.MERGE_BRANCH}`)
    expect(text).not.toContain(`/${COMMAND.MERGE_BRANCH}${PO_SUFFIX}`)
    expect(text).not.toContain(`/${COMMAND.MERGE_BRANCH}${PA_SUFFIX}`)
    expect(text).toContain('[来源分支名\\|本地 worktree 路径]')
  })

  it('真实帮助目录不应该暴露旧会话沉淀和资产纠偏入口', () => {
    const text = generateHelpText()

    expect(text).not.toContain('ae:save-session-flow')
    expect(text).not.toContain('/ae-save-session-flow')
    expect(text).not.toContain('ae:asset-debug')
    expect(text).not.toContain('/ae-asset-debug')
  })

  it('应该在真实帮助目录中暴露 ae:work-report 入口', () => {
    const text = generateHelpText('work-report')

    expect(text).toContain(SKILL.WORK_REPORT)
    expect(text).toContain(`/${COMMAND.WORK_REPORT}`)
    expect(text).not.toContain(`/${COMMAND.WORK_REPORT}${PO_SUFFIX}`)
    expect(text).not.toContain(`/${COMMAND.WORK_REPORT}${PA_SUFFIX}`)
    expect(text).toContain('[日报\\|周报\\|时间段\\|提交范围]')
    expect(text).toContain('生成日报、周报或指定时间段工作总结')
  })

  it('真实帮助目录不应该暴露旧文档互转入口', () => {
    const text = generateHelpText()

    expect(text).not.toContain('ae:doc-humanize')
    expect(text).not.toContain('/ae-doc-humanize')
    expect(text).not.toContain('ae:doc-structure')
    expect(text).not.toContain('/ae-doc-structure')
  })

  it('按旧入口查询时不应该暴露旧会话沉淀和资产纠偏入口', () => {
    for (const query of ['save-session-flow', 'asset-debug']) {
      const text = generateHelpText(query)

      expect(text).not.toContain('ae:save-session-flow')
      expect(text).not.toContain('/ae-save-session-flow')
      expect(text).not.toContain('[目标技能名\\|流程关注点]')
      expect(text).not.toContain('ae:asset-debug')
      expect(text).not.toContain('/ae-asset-debug')
      expect(text).not.toContain('[资产名\\|纠偏摘要]')
    }
  })

  it('应该在真实帮助目录中展示 ae:test-browser 的 agent-browser 环境门禁语义', () => {
    const text = generateHelpText('test-browser')

    expect(text).toContain(SKILL.TEST_BROWSER)
    expect(text).toContain(`/${COMMAND.TEST_BROWSER}`)
    expect(text).not.toContain(`/${COMMAND.TEST_BROWSER}${PO_SUFFIX}`)
    expect(text).not.toContain(`/${COMMAND.TEST_BROWSER}${PA_SUFFIX}`)
    expect(text).toContain(SKILL.AGENT_BROWSER)
    expect(text).toContain('环境验证')
    expect(text).not.toContain('agent-browser 可用')
  })
})
