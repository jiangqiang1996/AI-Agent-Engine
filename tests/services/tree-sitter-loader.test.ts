import { afterEach, describe, expect, it, vi } from 'vitest'

describe('tree-sitter-loader', () => {
  afterEach(() => {
    vi.doUnmock('web-tree-sitter')
    vi.resetModules()
  })

  it('应该通过 web-tree-sitter 的 Parser.init 初始化解析器', async () => {
    const webTreeSitter = await import('web-tree-sitter')
    const init = vi.spyOn(webTreeSitter.Parser, 'init')

    const { isTreeSitterAvailable } = await import('../../src/services/graph/tree-sitter-loader.js')

    await expect(isTreeSitterAvailable()).resolves.toBe(true)
    expect(init).toHaveBeenCalledOnce()
  })
})
