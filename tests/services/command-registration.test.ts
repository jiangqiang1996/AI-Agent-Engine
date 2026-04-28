import { describe, expect, it } from 'vitest'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../../src/schemas/ae-asset-schema.js'
import { buildCommandConfig, createTuiCommands } from '../../src/services/command-registration.js'

describe('command-registration', () => {
  it('应该为 ae:refactor 生成基础命令和提示词优化命令', () => {
    const config = buildCommandConfig('__missing_commands_dir__')
    const poCommand = `${COMMAND.REFACTOR}${PO_SUFFIX}`
    const paCommand = `${COMMAND.REFACTOR}${PA_SUFFIX}`

    expect(config[COMMAND.REFACTOR]).toBeDefined()
    expect(config[COMMAND.REFACTOR]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
    expect(config[poCommand]).toBeDefined()
    expect(config[poCommand]?.template).toContain(`先使用 \`${SKILL.PROMPT_OPTIMIZE}\` 技能优化以下用户输入`)
    expect(config[poCommand]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
    expect(config[paCommand]).toBeDefined()
    expect(config[paCommand]?.template).toContain(`先使用 \`${SKILL.PROMPT_OPTIMIZE}\` 技能以 auto 模式优化以下用户输入`)
    expect(config[paCommand]?.template).toContain('跳过确认直接提交')
    expect(config[paCommand]?.template).toContain(`使用 \`${SKILL.REFACTOR}\` 技能处理这次请求`)
  })

  it('应该在 TUI 命令列表中暴露 ae:refactor 入口', () => {
    const commands = createTuiCommands()
    const values = commands.map((command) => command.value)
    const poCommand = `${COMMAND.REFACTOR}${PO_SUFFIX}`
    const paCommand = `${COMMAND.REFACTOR}${PA_SUFFIX}`

    expect(values).toContain(`/${COMMAND.REFACTOR}`)
    expect(values).toContain(`/${poCommand}`)
    expect(values).toContain(`/${paCommand}`)

    const refactorCommand = commands.find((command) => command.value === `/${COMMAND.REFACTOR}`)
    expect(refactorCommand?.category).toBe('AE 工作流')
    expect(refactorCommand?.slash?.name).toBe(COMMAND.REFACTOR)
    expect(refactorCommand?.description).toContain('[重构目标|计划路径|需求文档路径|代码异味描述]')

    const poTuiCommand = commands.find((command) => command.value === `/${poCommand}`)
    const paTuiCommand = commands.find((command) => command.value === `/${paCommand}`)
    expect(poTuiCommand?.description).toContain('[重构目标|计划路径|需求文档路径|代码异味描述]')
    expect(paTuiCommand?.description).toContain('[重构目标|计划路径|需求文档路径|代码异味描述]')
  })
})
