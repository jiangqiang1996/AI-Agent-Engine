import { describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'

describe('help-catalog-service 集成', () => {
  it('应该在真实帮助目录中暴露 ae:asset-debug 入口', () => {
    const text = generateHelpText('asset-debug')

    expect(text).toContain(SKILL.ASSET_DEBUG)
    expect(text).toContain(`/${COMMAND.ASSET_DEBUG}`)
    expect(text).toContain(`/${COMMAND.ASSET_DEBUG}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.ASSET_DEBUG}${PA_SUFFIX}`)
    expect(text).toContain('[资产名\\|纠偏摘要]')
  })

  it('应该在真实帮助目录中暴露 ae:refactor 入口', () => {
    const text = generateHelpText('refactor')

    expect(text).toContain(SKILL.REFACTOR)
    expect(text).toContain(`/${COMMAND.REFACTOR}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PA_SUFFIX}`)
    expect(text).toContain('[重构目标\\|计划路径\\|需求文档路径\\|代码异味描述]')
  })

  it('应该在真实帮助目录中暴露 ae:save-session-flow 入口', () => {
    const text = generateHelpText('save-session-flow')

    expect(text).toContain(SKILL.SAVE_SESSION_FLOW)
    expect(text).toContain(`/${COMMAND.SAVE_SESSION_FLOW}`)
    expect(text).toContain(`/${COMMAND.SAVE_SESSION_FLOW}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.SAVE_SESSION_FLOW}${PA_SUFFIX}`)
    expect(text).toContain('[目标技能名\\|流程关注点]')
  })

  it('应该在真实帮助目录中展示 ae:test-browser 的 setup 前置语义', () => {
    const text = generateHelpText('test-browser')

    expect(text).toContain(SKILL.TEST_BROWSER)
    expect(text).toContain(`/${COMMAND.TEST_BROWSER}`)
    expect(text).toContain(`/${COMMAND.TEST_BROWSER}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.TEST_BROWSER}${PA_SUFFIX}`)
    expect(text).toContain('先完成 ae:setup')
    expect(text).not.toContain('agent-browser 可用')
  })
})
