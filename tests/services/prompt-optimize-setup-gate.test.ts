import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ensureBrowserSetupGate } from '../../src/services/browser-setup-gate.js'

describe('ensureBrowserSetupGate', () => {
  it('无浏览器触发词时不注入 setup 门禁', () => {
    const prompt = '帮我写一个 React 组件'
    expect(ensureBrowserSetupGate(prompt)).toBe(prompt)
  })

  it('空字符串直接返回', () => {
    expect(ensureBrowserSetupGate('')).toBe('')
  })

  it('包含 agent-browser 但无 setup 标记时注入门禁', () => {
    const prompt = '使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toContain('ae:setup')
    expect(result).toContain('ae-setup-proof action=check')
    expect(result).toContain('若未完成')
    expect(result).toContain('写入证明后再执行浏览器流程')
    expect(result).toContain('agent-browser 已安装')
    expect(result).toContain(prompt)
  })

  it('包含 @design-iterator 但无 setup 标记时注入门禁', () => {
    const prompt = '@design-iterator 帮我迭代首页设计'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toContain('ae:setup')
  })

  it('包含 @figma-design-sync 但无 setup 标记时注入门禁', () => {
    const prompt = '@figma-design-sync 对齐按钮样式'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toContain('ae:setup')
  })

  it('包含 ae:test-browser 但无 setup 标记时注入门禁', () => {
    const prompt = '运行 ae:test-browser http://localhost:3000'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toContain('ae:setup')
  })

  it('包含 ae:frontend-design 但无 setup 标记时注入门禁', () => {
    const prompt = '使用 ae:frontend-design 做视觉验证'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toContain('ae:setup')
  })

  it('已包含 /ae-setup 时不重复注入', () => {
    const prompt = '先运行 /ae-setup，然后使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toBe(prompt)
  })

  it('已包含 ae:setup 时不重复注入', () => {
    const prompt = '完成 ae:setup 后使用 agent-browser'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toBe(prompt)
  })

  it('提示词以 @ 引用开头时门禁放在首引用之后', () => {
    const prompt = '@design-iterator 帮我迭代首页'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toMatch(/^@design-iterator/)
    expect(result).toContain('ae:setup')
    const setupIdx = result.indexOf('ae:setup')
    const atIdx = result.indexOf('@design-iterator')
    expect(setupIdx).toBeGreaterThan(atIdx)
  })

  it('提示词以 / 命令开头时门禁放在首命令之后', () => {
    const prompt = '/ae-test-browser http://localhost:3000'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toMatch(/^\/ae-test-browser/)
    expect(result).toContain('ae:setup')
  })

  it('多个触发词同时出现时门禁只注入一次', () => {
    const prompt = '使用 agent-browser 和 @design-iterator'
    const result = ensureBrowserSetupGate(prompt)
    const gateCount = (result.match(/当前会话必须先调用/g) ?? []).length
    expect(gateCount).toBe(1)
  })

  it('仅包含 setup 标记但无触发词时不注入', () => {
    const prompt = '完成 ae:setup 后继续'
    const result = ensureBrowserSetupGate(prompt)
    expect(result).toBe(prompt)
  })
})

describe('prompt optimize SKILL.md 浏览器能力 setup 门禁', () => {
  const content = readFileSync('src/assets/skills/ae-prompt-optimize/SKILL.md', 'utf8')

  it('应该要求目标新会话为浏览器任务注入 setup 门禁', () => {
    expect(content).toContain('浏览器能力门禁')
    expect(content).toContain('agent-browser')
    expect(content).toContain('ae:test-browser')
    expect(content).toContain('/ae-test-browser')
    expect(content).toContain('@design-iterator')
    expect(content).toContain('@figma-design-sync')
    expect(content).toContain('ae:frontend-design')
    expect(content).toContain('/ae-frontend-design')
    expect(content).toContain('目标新会话先调用 `ae-setup-proof action=check`')
    expect(content).toContain('若未完成，则先执行 `ae:setup` / `/ae-setup`')
    expect(content).toContain('写入证明后再执行浏览器流程')
    expect(content).toContain('源会话已经执行过 setup 不能迁移到目标新会话')
  })

  it('应该保留首 token 引用约束', () => {
    const firstReferenceRule = content.indexOf('首个引用必须是优化后提示词的第一个 token')
    const setupRule = content.indexOf('setup 约束必须放在该首引用之后')

    expect(firstReferenceRule).toBeGreaterThan(-1)
    expect(setupRule).toBeGreaterThan(firstReferenceRule)
  })
})
