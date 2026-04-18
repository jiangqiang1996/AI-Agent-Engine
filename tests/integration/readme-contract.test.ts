import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'

describe('readme-contract', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

  it('应该列出所有公开技能与命令', () => {
    for (const entry of getPhaseOneEntries()) {
      expect(readme).toContain(entry.skillName)
      expect(readme).toContain(`/${entry.commandName}`)
    }
  })

  it('应该说明默认入口与恢复规则', () => {
    expect(readme).toContain('/ae-lfg')
    expect(readme).toContain('恢复规则')
  })

  it('应该明确只支持 opencode 并提供两种安装方式', () => {
    expect(readme).toContain('本项目**只支持 opencode**')
    expect(readme).toContain('### 给人类用户')
    expect(readme).toContain('### 给 AI 代理')
    expect(readme).toContain('### 手动安装')
    expect(readme).toContain('.opencode/INSTALL.md')
  })

  it('应该要求 AI 安装前检查可能冲突的插件', () => {
    expect(readme).toContain('oh-my-openagent')
    expect(readme).toContain('oh-my-opencode')
    expect(readme).toContain('superpowers')
    expect(readme).toContain('可能与 AI Agent Engine 不兼容')
  })
})
