import { describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { generateHelpText } from '../../src/services/help-catalog-service.js'

describe('help-catalog-service 集成', () => {
  it('应该在真实帮助目录中暴露 ae:refactor 入口', () => {
    const text = generateHelpText('refactor')

    expect(text).toContain(SKILL.REFACTOR)
    expect(text).toContain(`/${COMMAND.REFACTOR}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PO_SUFFIX}`)
    expect(text).toContain(`/${COMMAND.REFACTOR}${PA_SUFFIX}`)
    expect(text).toContain('[重构目标\\|计划路径\\|需求文档路径\\|代码异味描述]')
  })
})
