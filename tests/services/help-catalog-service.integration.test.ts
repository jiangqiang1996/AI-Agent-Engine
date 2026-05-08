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
    expect(text).toContain('[重构目标\\|计划路径\\|需求文档路径\\|代码异味描述]')
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

  it('应该在真实帮助目录中展示 ae:test-browser 的 setup 前置语义', () => {
    const text = generateHelpText('test-browser')

    expect(text).toContain(SKILL.TEST_BROWSER)
    expect(text).toContain(`/${COMMAND.TEST_BROWSER}`)
    expect(text).not.toContain(`/${COMMAND.TEST_BROWSER}${PO_SUFFIX}`)
    expect(text).not.toContain(`/${COMMAND.TEST_BROWSER}${PA_SUFFIX}`)
    expect(text).toContain('先完成 ae:setup')
    expect(text).not.toContain('agent-browser 可用')
  })
})
