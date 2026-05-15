import { afterEach, describe, expect, it, vi } from 'vitest'

describe('tree-sitter-loader', () => {
  afterEach(() => {
    vi.doUnmock('web-tree-sitter')
    vi.doUnmock('node:fs')
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('应该通过 web-tree-sitter 的 Parser.init 初始化解析器', async () => {
    const webTreeSitter = await import('web-tree-sitter')
    const init = vi.spyOn(webTreeSitter.Parser, 'init')

    const { isTreeSitterAvailable } = await import('../../src/services/graph/tree-sitter-loader.js')

    await expect(isTreeSitterAvailable()).resolves.toBe(true)
    expect(init).toHaveBeenCalledOnce()
  })

  it('应该为 tsx 语法定位对应的 wasm 文件', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((path: string) => path.includes('web-tree-sitter') || path.endsWith('tree-sitter-tsx.wasm')),
    }))
    const load = vi.fn(async () => ({}) )
    const setLanguage = vi.fn()
    vi.doMock('web-tree-sitter', () => ({
      default: {
        Parser: class {
          static init = vi.fn(async () => {})
          setLanguage = setLanguage
          parse = vi.fn()
          delete = vi.fn()
        },
        Language: { load },
      },
    }))

    const { loadTreeSitterLanguage } = await import('../../src/services/graph/tree-sitter-loader.js')

    await expect(loadTreeSitterLanguage('tsx')).resolves.toBeDefined()
    expect(load).toHaveBeenCalledWith(expect.stringContaining('tree-sitter-tsx.wasm'))
    expect(setLanguage).toHaveBeenCalledOnce()
  })

  it('应该在 cwd 没有依赖时从插件 node_modules 定位 web-tree-sitter wasm', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('D:\\outside-project')
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((path: string) => !path.startsWith(process.cwd()) && path.includes('web-tree-sitter')),
    }))
    const init = vi.fn(async (_options?: { locateFile?(scriptName: string, scriptDirectory: string): string }) => {})
    vi.doMock('web-tree-sitter', () => ({
      default: {
        Parser: { init },
        Language: { load: vi.fn() },
      },
    }))

    const { isTreeSitterAvailable } = await import('../../src/services/graph/tree-sitter-loader.js')

    await expect(isTreeSitterAvailable()).resolves.toBe(true)
    const locateFile = init.mock.calls[0]?.[0]?.locateFile
    expect(locateFile?.('tree-sitter.wasm', '')).toContain('web-tree-sitter')
  })

  it('应该在 setLanguage 失败时释放 parser', async () => {
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn((path: string) => path.includes('web-tree-sitter') || path.endsWith('tree-sitter-typescript.wasm')),
    }))
    const load = vi.fn(async () => ({}) )
    const deleteParser = vi.fn()
    vi.doMock('web-tree-sitter', () => ({
      default: {
        Parser: class {
          static init = vi.fn(async () => {})
          setLanguage(): void {
            throw new Error('incompatible grammar')
          }
          parse = vi.fn()
          delete = deleteParser
        },
        Language: { load },
      },
    }))

    const { loadTreeSitterLanguage } = await import('../../src/services/graph/tree-sitter-loader.js')

    await expect(loadTreeSitterLanguage('typescript')).rejects.toThrow('incompatible grammar')
    expect(deleteParser).toHaveBeenCalledOnce()
  })
})
