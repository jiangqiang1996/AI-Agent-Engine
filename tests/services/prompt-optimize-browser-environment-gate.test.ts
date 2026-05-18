import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ensureBrowserEnvironmentGate } from '../../src/services/browser-environment-gate.js'

describe('ensureBrowserEnvironmentGate', () => {
  it('无浏览器触发词时不注入浏览器环境门禁', () => {
    const prompt = '帮我写一个 React 组件'
    expect(ensureBrowserEnvironmentGate(prompt)).toBe(prompt)
  })

  it('空字符串直接返回', () => {
    expect(ensureBrowserEnvironmentGate('')).toBe('')
  })

  it('包含 agent-browser 但无环境标记时注入门禁', () => {
    const prompt = '使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:agent-browser')
    expect(result).toContain('ae-agent-browser-proof action=check')
    expect(result).toContain('若未完成')
    expect(result).toContain('写入证明后再执行浏览器流程')
    expect(result).toContain('agent-browser 已安装')
    expect(result).toContain(prompt)
  })

  it('包含 @design-iterator 但无环境标记时注入门禁', () => {
    const prompt = '@design-iterator 帮我迭代首页设计'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:agent-browser')
  })

  it('包含 @figma-design-sync 但无环境标记时注入门禁', () => {
    const prompt = '@figma-design-sync 对齐按钮样式'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:agent-browser')
  })

  it('包含 ae:test-browser 但无环境标记时注入门禁', () => {
    const prompt = '运行 ae:test-browser http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:agent-browser')
  })

  it('包含 ae:frontend-design 但无环境标记时注入门禁', () => {
    const prompt = '使用 ae:frontend-design 做视觉验证'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:agent-browser')
  })

  it('已包含 /ae-agent-browser 时不重复注入', () => {
    const prompt = '先运行 /ae-agent-browser，然后使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })

  it('已包含 ae:agent-browser 时不重复注入', () => {
    const prompt = '完成 ae:agent-browser 后使用 agent-browser'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })

  it('已包含 ae-agent-browser-proof 时不重复注入', () => {
    const prompt = '先调用 ae-agent-browser-proof action=check，然后使用 agent-browser'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })

  it('否定性提及 ae-agent-browser-proof 时仍然注入门禁', () => {
    const prompt = '不要调用 ae-agent-browser-proof action=check，直接使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
  })

  it('不需要语境提及 ae-agent-browser-proof 时仍然注入门禁', () => {
    const prompt = '不需要先调用 ae-agent-browser-proof action=check，直接使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
  })

  it('否定性提及 ae:agent-browser 时仍然注入门禁', () => {
    const prompt = '不要运行 ae:agent-browser，直接使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
  })

  it('旧 ae:setup 标记不能替代新浏览器环境门禁', () => {
    const prompt = '已经运行 ae:setup，现在使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
    expect(result).toContain('ae:agent-browser')
  })

  it('旧 /ae-setup 标记不能替代新浏览器环境门禁', () => {
    const prompt = '已经运行 /ae-setup，现在使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
  })

  it('旧 ae-setup-proof 标记不能替代新浏览器环境门禁', () => {
    const prompt = '已经调用 ae-setup-proof，现在使用 agent-browser open http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae-agent-browser-proof action=check')
  })

  it('提示词以 @ 引用开头时门禁放在首引用之后', () => {
    const prompt = '@design-iterator 帮我迭代首页'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toMatch(/^@design-iterator/)
    expect(result).toContain('ae:agent-browser')
    const gateIdx = result.indexOf('ae:agent-browser')
    const atIdx = result.indexOf('@design-iterator')
    expect(gateIdx).toBeGreaterThan(atIdx)
  })

  it('提示词以 / 命令开头时门禁放在首命令之后', () => {
    const prompt = '/ae-test-browser http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toMatch(/^\/ae-test-browser/)
    expect(result).toContain('ae:agent-browser')
  })

  it('多个触发词同时出现时门禁只注入一次', () => {
    const prompt = '使用 agent-browser 和 @design-iterator'
    const result = ensureBrowserEnvironmentGate(prompt)
    const gateCount = (result.match(/必须先调用/g) ?? []).length
    expect(gateCount).toBe(1)
  })

  it('仅包含环境标记但无触发词时不注入', () => {
    const prompt = '完成 ae:agent-browser 后继续'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })
})

describe('prompt optimize SKILL.md 浏览器能力环境门禁', () => {
  const content = readFileSync('src/assets/skills/ae-prompt-optimize/SKILL.md', 'utf8')

  it('应该要求目标新会话为浏览器任务注入环境门禁', () => {
    expect(content).toContain('浏览器能力门禁')
    expect(content).toContain('agent-browser')
    expect(content).toContain('ae:test-browser')
    expect(content).toContain('/ae-test-browser')
    expect(content).toContain('@design-iterator')
    expect(content).toContain('@figma-design-sync')
    expect(content).toContain('ae:frontend-design')
    expect(content).toContain('/ae-frontend-design')
    expect(content).toContain('目标新会话先调用 `ae-agent-browser-proof action=check`')
    expect(content).toContain('若未完成，则先执行 `ae:agent-browser` / `/ae-agent-browser`')
    expect(content).toContain('写入证明后再执行浏览器流程')
    expect(content).toContain('同一工作区的合法 agent-browser 环境证明可以跨会话复用')
  })

  it('应该保留首 token 引用约束', () => {
    const firstReferenceRule = content.indexOf('首个引用必须是优化后提示词的第一个 token')
    const gateRule = content.indexOf('浏览器环境约束必须放在该首引用之后')

    expect(firstReferenceRule).toBeGreaterThan(-1)
    expect(gateRule).toBeGreaterThan(firstReferenceRule)
  })
})
