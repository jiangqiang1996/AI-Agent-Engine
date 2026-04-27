import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { COMMAND, PA_SUFFIX, PO_SUFFIX, SKILL } from '../schemas/ae-asset-schema.js'
import { parseFrontmatter } from '../utils/frontmatter.js'
import { getPhaseOneEntries } from './ae-catalog.js'
import { buildCommandConfig, createTuiCommands } from './command-registration.js'

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

  it('ae:refactor 技能文件应保持计划包装器契约', () => {
    const content = readFileSync(new URL('../assets/skills/ae-refactor/SKILL.md', import.meta.url), 'utf-8')
    const parsed = parseFrontmatter(content)
    const catalogEntry = getPhaseOneEntries().find((entry) => entry.skillName === SKILL.REFACTOR)

    if (!catalogEntry) {
      throw new Error('ae:refactor 应存在于技能目录中')
    }

    expect(parsed.data.name).toBe(SKILL.REFACTOR)
    expect(parsed.data['argument-hint']).toBe(catalogEntry.argumentHint)
    expect(parsed.data.description).toContain('ae:plan')
    expect(parsed.body).toContain('立即调用 `ae:plan`')
    expect(parsed.body).toContain('默认保持外部行为不变')
    expect(parsed.body).toContain('测试/验证方式')
    expect(parsed.body).toContain('docs/ae/plans/')
    expect(parsed.body).toContain('type: plan')
    expect(parsed.body).toContain('永远不要在 `ae:refactor` 中复制 `ae:plan` 的完整流程')
  })
})
