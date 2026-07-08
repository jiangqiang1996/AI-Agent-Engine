import { describe, it, expect, vi, beforeEach } from 'vitest'

// 控制端口可达性模拟行为
let portReachableMode: 'connect' | 'timeout' | 'error' = 'error'

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))
vi.mock('node:util', () => ({
  promisify: (fn: unknown) => fn,
}))
vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}))
vi.mock('node:net', () => ({
  Socket: function () {
    const handlers: Record<string, (() => void) | undefined> = {}
    return {
      setTimeout: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        handlers[event] = cb
      }),
      connect: vi.fn(() => {
        const cb = handlers[portReachableMode]
        if (cb) cb()
      }),
      destroy: vi.fn(),
    }
  },
}))

// 可切换的 mock client
let mockAddConnected = false
vi.mock('../../src/services/client-holder.js', () => ({
  getGlobalClient: () => ({
    mcp: {
      // status 始终返回未注册，让 register 流程继续执行
      status: vi.fn().mockResolvedValue({
        data: { 'chrome-devtools': { status: 'not_registered' } },
      }),
      add: vi.fn().mockImplementation(() => {
        if (mockAddConnected) {
          return Promise.resolve({
            data: { 'chrome-devtools': { status: 'connected' } },
          })
        }
        return Promise.resolve({
          data: { 'chrome-devtools': { status: 'failed' } },
        })
      }),
      disconnect: vi.fn().mockResolvedValue({ data: {} }),
    },
  }),
}))

async function callDetect(browser?: string) {
  const { aeChromeDevtoolsMcpTool: tool } = await import(
    '../../src/tools/ae-chrome-devtools-mcp.tool.js'
  )
  const definition = tool as unknown as {
    execute: (
      args: Record<string, unknown>,
      ctx: Record<string, unknown>,
    ) => Promise<{ output: string; metadata: Record<string, unknown> }>
  }
  const result = await definition.execute(
    { action: 'detect', ...(browser ? { browser } : {}) },
    { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
  )
  return result
}

async function getMocks() {
  const cp = await import('node:child_process')
  const fs = await import('node:fs')
  return {
    mockExec: cp.exec as unknown as ReturnType<typeof vi.fn>,
    mockFsAccess: (fs.promises as unknown as { access: ReturnType<typeof vi.fn> }).access,
    mockFsReadFile: (fs.promises as unknown as { readFile: ReturnType<typeof vi.fn> }).readFile,
  }
}

describe('ae-chrome-devtools-mcp 工具 - detect action', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    portReachableMode = 'error'
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  it('应该在无浏览器安装时返回安装提示', async () => {
    const result = await callDetect('Chrome')
    expect(result.output).toContain('浏览器环境检测结果')
    expect(result.output).toContain('installed=false')
    expect(result.output).toContain('请先安装')
  })

  it('应该在浏览器已安装但未运行时返回 isolated 建议', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)

    const result = await callDetect('Chrome')
    expect(result.output).toContain('installed=true')
    expect(result.output).toContain('processRunning=false')
    expect(result.output).toContain('mode=isolated')
  })

  it('应该在浏览器可调试时返回 connect 建议和端口', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc123')
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=true')
    expect(result.output).toContain('port=9222')
    expect(result.output).toContain('mode=connect')
  })

  it('应该在浏览器运行但未启用远程调试时返回提示', async () => {
    const { mockFsAccess, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })

    const result = await callDetect('Chrome')
    expect(result.output).toContain('processRunning=true')
    expect(result.output).toContain('debuggable=false')
    expect(result.output).toContain('inspect#remote-debugging')
  })

  it('应该在 DevToolsActivePort 文件存在但端口不可达时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc123')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'error'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=false')
    expect(result.output).toContain('processRunning=true')
  })

  it('应该在检测全部浏览器时返回所有四个浏览器的结果', async () => {
    const result = await callDetect()
    expect(result.output).toContain('Chrome')
    expect(result.output).toContain('Edge')
    expect(result.output).toContain('Brave')
    expect(result.output).toContain('Vivaldi')
    const lines = result.output.split('\n')
    const detectionLines = lines.filter((l) => l.includes('installed='))
    expect(detectionLines.length).toBe(4)
  })

  it('应该在多个浏览器已安装时返回自动选择优先级最高的建议', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined) // Chrome
    mockFsAccess.mockResolvedValueOnce(undefined) // Edge

    const result = await callDetect()
    expect(result.output).toContain('自动选择优先级最高的')
    expect(result.output).toContain('Chrome')
  })

  // --- P2 新增测试 ---

  it('应该在多个浏览器可调试时返回选择提示', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    // 所有 fs.access 调用都成功（所有浏览器已安装）
    mockFsAccess.mockResolvedValue(undefined)
    // 所有 readFile 调用返回有效 DevToolsActivePort 内容
    mockFsReadFile.mockResolvedValue('9222\n/devtools/browser/abc123')
    portReachableMode = 'connect'

    const result = await callDetect()
    expect(result.output).toContain('多个浏览器')
    expect(result.output).toContain('请选择一个接管')
  })

  it('应该在非Chrome浏览器可调试时建议中包含browser参数', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9333\n/devtools/browser/def456')
    portReachableMode = 'connect'

    const result = await callDetect('Edge')
    expect(result.output).toContain('debuggable=true')
    expect(result.output).toContain('port=9333')
    expect(result.output).toContain('browser=Edge')
    expect(result.output).toContain('mode=connect')
  })

  it('应该在DevToolsActivePort端口越界(0)时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('0\n/devtools/browser/abc')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=false')
    expect(result.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort端口越界(99999)时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('99999\n/devtools/browser/abc')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=false')
    expect(result.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort的wsPath格式非法时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n@evil.com/path')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=false')
    expect(result.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort包含CRLF时正确解析端口', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\r\n/devtools/browser/abc123\r\n')
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=true')
    expect(result.output).toContain('port=9222')
  })

  it('应该在DevToolsActivePort包含空行时正确解析', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('\n9222\n/devtools/browser/abc123\n')
    portReachableMode = 'connect'

    const result = await callDetect('Chrome')
    expect(result.output).toContain('debuggable=true')
    expect(result.output).toContain('port=9222')
  })
})

describe('ae-chrome-devtools-mcp 工具 - schema 和描述', () => {
  it('应该包含 detect action 在描述中且标注为只读操作', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('detect')
    expect(definition.description).toContain('不注册 MCP')
    expect(definition.description).toContain('不连接浏览器')
  })

  it('应该包含 autoConnect 的 Chrome M144 版本要求', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('M144')
  })

  it('应该在描述中包含全部四种浏览器', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('Chrome')
    expect(definition.description).toContain('Edge')
    expect(definition.description).toContain('Brave')
    expect(definition.description).toContain('Vivaldi')
  })
})

describe('ae-chrome-devtools-mcp 工具 - autoConnect 显式 browser 参数', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    portReachableMode = 'error'
    mockAddConnected = false
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  it('应该在指定 browser=Edge 且读到 DevToolsActivePort 时用 wsEndpoint 连接', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValue(undefined)
    mockFsReadFile.mockResolvedValue('9222\n/devtools/browser/abc')
    portReachableMode = 'connect'
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', mode: 'autoConnect', browser: 'Edge' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.output).toContain('Edge')
    expect(result.metadata).toMatchObject({
      mode: 'autoConnect',
      browser: 'Edge',
      connected: true,
    })
  })

  it('应该在非 Chrome 浏览器读不到 DevToolsActivePort 时返回错误而非降级', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', mode: 'autoConnect', browser: 'Edge' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.output).toContain('未找到 Edge 的 DevToolsActivePort')
    expect(result.output).toContain('mode=connect')
    expect(result.metadata).toMatchObject({
      connected: false,
      status: 'no_devtools_active_port',
      browser: 'Edge',
    })
  })

  it('应该在未指定 browser 时使用 Chrome 的 autoConnect 命令', async () => {
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', mode: 'autoConnect' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'autoConnect',
      browser: 'Chrome',
      connected: true,
    })
  })
})

describe('ae-chrome-devtools-mcp 工具 - 智能决策流程', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    portReachableMode = 'error'
    mockAddConnected = false
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  // 场景1：指定 browser + headless → isolated
  it('场景1：指定 browser + headless=true 时应直接 isolated 启动', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined) // Edge 已安装
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', browser: 'Edge', headless: true },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'isolated',
      browser: 'Edge',
      headless: true,
      connected: true,
    })
  })

  // 场景2：指定 browser + 非无头 → 检测可接管则 connect，否则 isolated
  it('场景2：指定 browser 可调试时应 connect 接管', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc')
    portReachableMode = 'connect'
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', browser: 'Edge' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'connect',
      browser: 'Edge',
      port: 9222,
      connected: true,
    })
  })

  it('场景2：指定 browser 运行中但未启用调试时应提示', async () => {
    const { mockFsAccess, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockExec.mockResolvedValueOnce({ stdout: 'msedge.exe,1234,Console,0,100,000' })

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', browser: 'Edge' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({ status: 'not_debuggable' })
    expect(result.output).toContain('inspect#remote-debugging')
  })

  it('场景2：指定 browser 未运行时应 isolated 启动', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined) // 已安装
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', browser: 'Edge' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'isolated',
      browser: 'Edge',
      connected: true,
    })
  })

  // 场景3：未指定 browser + headless → 检测已安装，仅一个直接用，多个选最高优先级
  it('场景3：未指定 browser + headless 时应检测已安装并 isolated 启动', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockImplementation((p: string) => {
      if (p.includes('Microsoft') && p.includes('Edge')) return Promise.resolve(undefined)
      return Promise.reject(new Error('not found'))
    })
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', headless: true },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'isolated',
      browser: 'Edge',
      headless: true,
      connected: true,
    })
  })

  it('场景3：未指定 browser + headless 且无已安装浏览器时应提示安装', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register', headless: true },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({ status: 'no_browser_installed' })
    expect(result.output).toContain('未检测到已安装')
  })

  // 场景4：未指定 browser + 非无头 → 检测可接管，仅一个则 connect，多个让用户选
  it('场景4：未指定 browser + 非无头 且唯一可调试时应 connect 接管', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockImplementation((p: string) => {
      if (p.includes('Microsoft') && p.includes('Edge')) return Promise.resolve(undefined)
      return Promise.reject(new Error('not found'))
    })
    mockFsReadFile.mockImplementation((p: string) => {
      if (p.includes('Edge') && p.endsWith('DevToolsActivePort')) {
        return Promise.resolve('9222\n/devtools/browser/abc')
      }
      return Promise.reject(new Error('not found'))
    })
    portReachableMode = 'connect'
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'connect',
      browser: 'Edge',
      port: 9222,
      connected: true,
    })
  })

  it('场景4：多个可调试浏览器时应让用户选择', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValue(undefined)
    mockFsReadFile.mockResolvedValue('9222\n/devtools/browser/abc')
    portReachableMode = 'connect'

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({ status: 'multiple_debuggable' })
    expect(result.output).toContain('请选择一个接管')
  })

  it('场景4：无可调试浏览器但有已安装时应 isolated 启动', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined) // Chrome 已安装
    mockAddConnected = true

    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as {
      execute: (
        args: Record<string, unknown>,
        ctx: Record<string, unknown>,
      ) => Promise<{ output: string; metadata: Record<string, unknown> }>
    }
    const result = await definition.execute(
      { action: 'register' },
      { metadata: vi.fn(), worktree: '/test', directory: '/test', sessionID: 'test', abort: new AbortController().signal },
    )

    expect(result.metadata).toMatchObject({
      mode: 'isolated',
      browser: 'Chrome',
      connected: true,
    })
  })
})
