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

  it('包含 chrome-devtools 但无环境标记时注入门禁', () => {
    const prompt = '使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('不得执行')
    expect(result).toContain('MCP 注册')
    expect(result).toContain('不能替代')
    expect(result).toContain(prompt)
  })

  it('包含 @design-iterator 但无环境标记时注入门禁', () => {
    const prompt = '@design-iterator 帮我迭代首页设计'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:chrome-devtools')
  })

  it('包含 @figma-design-sync 但无环境标记时注入门禁', () => {
    const prompt = '@figma-design-sync 对齐按钮样式'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:chrome-devtools')
  })

  it('包含 ae:test-browser 但无环境标记时注入门禁', () => {
    const prompt = '运行 ae:test-browser http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:chrome-devtools')
  })

  it('包含 ae:frontend-design 但无环境标记时注入门禁', () => {
    const prompt = '使用 ae:frontend-design 做视觉验证'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toContain('ae:chrome-devtools')
  })

  it('仅包含 /ae-chrome-devtools 但缺少证明检查时仍然注入门禁', () => {
    const prompt = '先运行 /ae-chrome-devtools，然后使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('MCP 注册')
  })

  it('仅包含 ae:chrome-devtools 但缺少证明检查时仍然注入门禁', () => {
    const prompt = '完成 ae:chrome-devtools 后使用 chrome-devtools'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('MCP 注册')
  })

  it('已包含完整环境证明兜底流程时不重复注入', () => {
    const prompt = '先调用 ae-chrome-devtools-mcp action=check；若未完成，先执行 ae:chrome-devtools 后再使用 chrome-devtools'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })

  it('否定性提及 ae-chrome-devtools-mcp 时仍然注入门禁', () => {
    const prompt = '不要调用 ae-chrome-devtools-mcp action=check，直接使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('不能替代')
  })

  it('不需要语境提及 ae-chrome-devtools-mcp 时仍然注入门禁', () => {
    const prompt = '不需要先调用 ae-chrome-devtools-mcp action=check，直接使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('不能替代')
  })

  it('否定性提及 ae:chrome-devtools 时仍然注入门禁', () => {
    const prompt = '不要运行 ae:chrome-devtools，直接使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('不能替代')
  })

  it('多个触发词同时出现时门禁只注入一次', () => {
    const prompt = '使用 chrome-devtools 和 @design-iterator'
    const result = ensureBrowserEnvironmentGate(prompt)
    const gateCount = (result.match(/chrome-devtools MCP 门禁/g) ?? []).length
    expect(gateCount).toBe(1)
  })

  it('仅包含环境兜底标记但缺少证明检查时仍然注入门禁', () => {
    const prompt = '完成 ae:chrome-devtools 后继续'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
    expect(result).toContain('ae:chrome-devtools')
    expect(result).toContain('不能替代')
  })

  it('包含 action=check 和完整兜底流程时不注入', () => {
    const prompt = '先调用 ae-chrome-devtools-mcp action=check；若未完成，先执行 ae:chrome-devtools 后再使用 chrome-devtools_navigate_page'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).toBe(prompt)
  })

  it('包含 action=check 但被反门禁模式匹配时注入门禁', () => {
    const prompt = 'chrome-devtools MCP 已注册可用，无需MCP注册，直接使用 chrome-devtools_navigate_page'
    const result = ensureBrowserEnvironmentGate(prompt)
    expect(result).not.toBe(prompt)
  })
})

describe('prompt optimize SKILL.md 浏览器能力环境门禁', () => {
  const content = readFileSync('src/assets/skills/ae-prompt-optimize/SKILL.md', 'utf8')

  it('应该要求目标新会话为浏览器任务注入环境门禁', () => {
    expect(content).toContain('浏览器能力门禁')
    expect(content).toContain('chrome-devtools')
    expect(content).toContain('ae:test-browser')
    expect(content).toContain('/ae-test-browser')
    expect(content).toContain('@design-iterator')
    expect(content).toContain('@figma-design-sync')
    expect(content).toContain('ae:frontend-design')
    expect(content).toContain('/ae-frontend-design')
    expect(content).toContain('ae:chrome-devtools')
    expect(content).toContain('得到 MCP 连接就绪结果后再执行浏览器流程')
    expect(content).toContain('chrome-devtools MCP 注册状态可以跨会话复用')
  })

  it('应该保留首 token 引用约束', () => {
    const firstReferenceRule = content.indexOf('首个引用必须是优化后提示词的第一个 token')
    const gateRule = content.indexOf('浏览器环境约束必须放在该首引用之后')

    expect(firstReferenceRule).toBeGreaterThan(-1)
    expect(gateRule).toBeGreaterThan(firstReferenceRule)
  })
})
