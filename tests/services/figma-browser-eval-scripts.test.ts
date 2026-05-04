import { describe, expect, it } from 'vitest'

import { EVAL_SCRIPTS, FIGMA_EXPORT_URLS_SCRIPT_ID, isValidScriptId } from '../../src/services/figma-browser-eval-scripts.js'

describe('Figma 浏览器 eval 脚本', () => {
  it('应该只接受预定义脚本 ID', () => {
    expect(isValidScriptId(FIGMA_EXPORT_URLS_SCRIPT_ID)).toBe(true)
    expect(isValidScriptId('custom-script')).toBe(false)
  })

  it('不应该读取浏览器敏感存储', () => {
    const script = EVAL_SCRIPTS[FIGMA_EXPORT_URLS_SCRIPT_ID]

    expect(script).not.toContain('document.cookie')
    expect(script).not.toContain('localStorage')
    expect(script).not.toContain('sessionStorage')
    expect(script).not.toContain('indexedDB')
  })

  it('默认发现结果应该标记为未绑定目标导出', () => {
    const script = EVAL_SCRIPTS[FIGMA_EXPORT_URLS_SCRIPT_ID]

    expect(script).toContain("targetBinding: 'unbound'")
  })
})
