import { describe, expect, it } from 'vitest'

import { COMMAND, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'

describe('help-catalog-service 集成', () => {
  it('应该在真实帮助目录中暴露 ae:skill-creator 入口', () => {
    const text = generateHelpText('skill-creator')

    expect(text).toContain(SKILL.SKILL_CREATOR)
    expect(text).toContain(`/${COMMAND.SKILL_CREATOR}`)
    expect(text).toContain('创建或更新 OpenCode 原生技能和命令')
    expect(text).toContain('--from-session')
  })

  it('应该在真实帮助目录中暴露 ae:design 入口', () => {
    const text = generateHelpText('refactor')

    expect(text).toContain(SKILL.DESIGN)
    expect(text).toContain(`/${COMMAND.DESIGN}`)
    expect(text).toContain('[需求文档路径\\|旧 design\\|裸描述]')
  })

  it('应该在真实帮助目录中暴露 ae:merge-branch 入口', () => {
    const text = generateHelpText('merge-branch')

    expect(text).toContain(SKILL.MERGE_BRANCH)
    expect(text).toContain(`/${COMMAND.MERGE_BRANCH}`)
    expect(text).toContain('[来源分支名\\|本地 worktree 路径]')
  })

  it('真实帮助目录不应该暴露已下线的旧入口', () => {
    const deprecatedEntries = [
      'ae:save-session-flow', '/ae-save-session-flow',
      'ae:asset-debug', '/ae-asset-debug',
      'ae:doc-humanize', '/ae-doc-humanize',
      'ae:doc-structure', '/ae-doc-structure',
    ]

    for (const query of [undefined, 'save-session-flow', 'asset-debug', 'doc-humanize', 'doc-structure']) {
      const text = generateHelpText(query)
      for (const deprecated of deprecatedEntries) {
        expect(text, `查询 "${query}" 不应包含 "${deprecated}"`).not.toContain(deprecated)
      }
      expect(text, `查询 "${query}" 不应包含旧入口模板占位符`).not.toContain('[目标技能名\\|流程关注点]')
      expect(text, `查询 "${query}" 不应包含旧入口模板占位符`).not.toContain('[资产名\\|纠偏摘要]')
    }
  })

  it('应该在真实帮助目录中暴露 ae:work-report 入口', () => {
    const text = generateHelpText('work-report')

    expect(text).toContain(SKILL.WORK_REPORT)
    expect(text).toContain(`/${COMMAND.WORK_REPORT}`)
    expect(text).toContain('[日报\\|周报\\|时间段\\|提交范围]')
    expect(text).toContain('生成日报、周报或指定时间段工作总结')
  })

  it('应该在真实帮助目录中展示 ae:web-forge 的 chrome-devtools MCP 门禁语义', () => {
    const text = generateHelpText('web-forge')

    expect(text).toContain(SKILL.WEB_FORGE)
    expect(text).toContain(`/${COMMAND.WEB_FORGE}`)
    expect(text).toContain(SKILL.CHROME_DEVTOOLS)
    expect(text).toContain('MCP 注册')
    expect(text).not.toContain('chrome-devtools 可用')
  })
})
