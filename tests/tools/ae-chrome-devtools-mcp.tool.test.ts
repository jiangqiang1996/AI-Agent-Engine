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
        if (cb) {
          cb()
        }
      }),
      destroy: vi.fn(),
    }
  },
}))

// 控制注册后 MCP 状态轮询行为
let statusMode: 'immediateConnected' | 'immediateFailed' | 'transient' | 'notRegistered' | 'disabled' | 'neverReady' | 'checkFailed' | 'needsAuth' = 'immediateConnected'
let transientFailCount = 0
let transientCurrentCount = 0

let statusCallCount = 0
let mockAddThrow = false
let lastAddCommand: string[] | null = null
// 控制 client 是否可用（check/disconnect 测试需要）
let clientAvailable = true
// 控制 disconnect 是否抛出异常
let mockDisconnectThrow = false

vi.mock('../../src/services/client-holder.js', () => ({
  getGlobalClient: () => {
    if (!clientAvailable) return null
    return {
      mcp: {
        status: vi.fn().mockImplementation(() => {
          statusCallCount++
          if (statusMode === 'checkFailed') {
            return Promise.reject(new Error('client 连接失败'))
          }
          if (statusMode === 'notRegistered') {
            return Promise.resolve({ data: {} })
          }
          if (statusMode === 'disabled') {
            return Promise.resolve({
              data: { 'chrome-devtools': { status: 'disabled' } },
            })
          }
          // 默认模式：第一次调用返回 not_registered（让 register 继续），后续按 statusMode
          if (statusCallCount === 1 && statusMode !== 'immediateConnected' && statusMode !== 'needsAuth') {
            return Promise.resolve({
              data: { 'chrome-devtools': { status: 'not_registered' } },
            })
          }
          // register 前置检查或 waitForMcpReady 轮询
          let status: string
          if (statusMode === 'immediateConnected') {
            status = 'connected'
          } else if (statusMode === 'immediateFailed') {
            status = 'failed'
          } else if (statusMode === 'needsAuth') {
            status = 'needs_auth'
          } else if (statusMode === 'neverReady') {
            status = 'needs_client_registration'
          } else {
            transientCurrentCount++
            if (transientCurrentCount <= transientFailCount) {
              status = 'needs_client_registration'
            } else {
              status = 'connected'
            }
          }
          return Promise.resolve({
            data: statusMode === 'immediateFailed'
              ? { 'chrome-devtools': { status: 'failed', error: '连接被拒绝' } }
              : { 'chrome-devtools': { status } },
          })
        }),
        add: vi.fn().mockImplementation((params: { body: { config: { command: string[] } } }) => {
          if (mockAddThrow) {
            return Promise.reject(new Error('npx 不可用'))
          }
          lastAddCommand = params.body.config.command
          return Promise.resolve({ data: {} })
        }),
        disconnect: vi.fn().mockImplementation(() => {
          if (mockDisconnectThrow) {
            return Promise.reject(new Error('MCP 尚未注册'))
          }
          return Promise.resolve({ data: {} })
        }),
      },
    }
  },
}))

async function callTool(args: Record<string, unknown>) {
  const { aeChromeDevtoolsMcpTool: tool } = await import(
    '../../src/tools/ae-chrome-devtools-mcp.tool.js'
  )
  const definition = tool as unknown as {
    execute: (
      args: Record<string, unknown>,
      ctx: Record<string, unknown>,
    ) => Promise<{ output: string; metadata: Record<string, unknown> } | string>
  }
  return definition.execute(args, {
    metadata: vi.fn(),
    worktree: '/test',
    directory: '/test',
    sessionID: 'test',
    abort: new AbortController().signal,
  })
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

function resetState() {
  portReachableMode = 'error'
  statusMode = 'immediateConnected'
  transientFailCount = 0
  transientCurrentCount = 0
  statusCallCount = 0
  mockAddThrow = false
  lastAddCommand = null
  clientAvailable = true
  mockDisconnectThrow = false
}

describe('ae-chrome-devtools-mcp 工具 - detect action', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetState()
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  it('应该在无浏览器安装时返回安装提示', async () => {
    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('浏览器环境检测结果')
    expect(r.output).toContain('installed=false')
    expect(r.output).toContain('请先安装')
  })

  it('应该在浏览器已安装但未运行时返回 isolated 建议', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('installed=true')
    expect(r.output).toContain('processRunning=false')
    expect(r.output).toContain('--isolated')
  })

  it('应该在浏览器可调试时返回 wsEndpoint 和端口', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc123')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=true')
    expect(r.output).toContain('port=9222')
    expect(r.output).toContain('--wsEndpoint')
  })

  it('应该在浏览器运行但未启用远程调试时返回提示', async () => {
    const { mockFsAccess, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('processRunning=true')
    expect(r.output).toContain('debuggable=false')
    expect(r.output).toContain('inspect#remote-debugging')
  })

  it('应该在 DevToolsActivePort 文件存在但端口不可达时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc123')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'error'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=false')
    expect(r.output).toContain('processRunning=true')
  })

  it('应该在检测全部浏览器时返回所有三个浏览器的结果', async () => {
    const result = await callTool({ action: 'detect' })
    const r = result as { output: string }
    expect(r.output).toContain('Chrome')
    expect(r.output).toContain('Edge')
    expect(r.output).toContain('Chromium')
    const lines = r.output.split('\n')
    const detectionLines = lines.filter((l) => l.includes('installed='))
    expect(detectionLines.length).toBe(3)
  })

  it('不应该在检测结果中包含 Brave 或 Vivaldi', async () => {
    const result = await callTool({ action: 'detect' })
    const r = result as { output: string }
    expect(r.output).not.toContain('Brave')
    expect(r.output).not.toContain('Vivaldi')
  })

  it('应该在多个浏览器已安装时返回自动选择优先级最高的建议', async () => {
    const { mockFsAccess } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsAccess.mockResolvedValueOnce(undefined)

    const result = await callTool({ action: 'detect' })
    const r = result as { output: string }
    expect(r.output).toContain('自动选择优先级最高的')
    expect(r.output).toContain('Chrome')
  })

  it('应该在多个浏览器可调试时返回选择提示', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValue(undefined)
    mockFsReadFile.mockResolvedValue('9222\n/devtools/browser/abc123')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect' })
    const r = result as { output: string }
    expect(r.output).toContain('多个浏览器')
    expect(r.output).toContain('请选择一个接管')
  })

  it('应该在非Chrome浏览器可调试时建议中包含 wsEndpoint', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9333\n/devtools/browser/def456')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Edge' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=true')
    expect(r.output).toContain('port=9333')
    expect(r.output).toContain('--wsEndpoint')
  })

  it('应该在DevToolsActivePort端口越界(0)时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('0\n/devtools/browser/abc')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=false')
    expect(r.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort端口越界(99999)时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('99999\n/devtools/browser/abc')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=false')
    expect(r.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort的wsPath格式非法时判定为非可调试', async () => {
    const { mockFsAccess, mockFsReadFile, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n@evil.com/path')
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=false')
    expect(r.output).toContain('processRunning=true')
  })

  it('应该在DevToolsActivePort包含CRLF时正确解析端口', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\r\n/devtools/browser/abc123\r\n')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=true')
    expect(r.output).toContain('port=9222')
  })

  it('应该在DevToolsActivePort包含空行时正确解析', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('\n9222\n/devtools/browser/abc123\n')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string }
    expect(r.output).toContain('debuggable=true')
    expect(r.output).toContain('port=9222')
  })

  it('应该在浏览器运行但未启用远程调试时在 metadata 中记录 runningNotDebuggableBrowsers', async () => {
    const { mockFsAccess, mockExec } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockExec.mockResolvedValueOnce({ stdout: 'chrome.exe,1234,Console,0,100,000' })

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string; metadata: Record<string, unknown> }
    const running = r.metadata.runningNotDebuggableBrowsers as string[]
    expect(running).toContain('Chrome')
  })

  it('应该在检测结果 metadata 中返回 executablePath 和 wsEndpoint', async () => {
    const { mockFsAccess, mockFsReadFile } = await getMocks()
    mockFsAccess.mockResolvedValueOnce(undefined)
    mockFsReadFile.mockResolvedValueOnce('9222\n/devtools/browser/abc123')
    portReachableMode = 'connect'

    const result = await callTool({ action: 'detect', browser: 'Chrome' })
    const r = result as { output: string; metadata: Record<string, unknown> }
    const debuggable = r.metadata.debuggableBrowsers as Array<{ browser: string; port: number; wsEndpoint: string }>
    expect(debuggable).toHaveLength(1)
    expect(debuggable[0].port).toBe(9222)
    expect(debuggable[0].wsEndpoint).toContain('ws://127.0.0.1:9222')
  })
})

describe('ae-chrome-devtools-mcp 工具 - schema 和描述', () => {
  it('应该包含 detect action 在描述中且标注为只读操作', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('detect')
    expect(definition.description).toContain('不注册')
    expect(definition.description).toContain('不连接')
  })

  it('应该在描述中包含全部三种浏览器', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('Chrome')
    expect(definition.description).toContain('Edge')
    expect(definition.description).toContain('Chromium')
  })

  it('不应该在描述中包含 Brave 或 Vivaldi', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).not.toContain('Brave')
    expect(definition.description).not.toContain('Vivaldi')
  })

  it('应该在描述中包含稳定性轮询等待说明', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('轮询')
    expect(definition.description).toContain('connected')
  })

  it('应该在描述中包含 mcpArgs 参数说明', async () => {
    const { aeChromeDevtoolsMcpTool: tool } = await import(
      '../../src/tools/ae-chrome-devtools-mcp.tool.js'
    )
    const definition = tool as unknown as { description: string }
    expect(definition.description).toContain('mcpArgs')
    expect(definition.description).toContain('--isolated')
    expect(definition.description).toContain('--headless')
  })
})

describe('ae-chrome-devtools-mcp 工具 - register mcpArgs 透传', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetState()
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  it('应该将 mcpArgs 原样追加到 BASE_COMMAND 之后', async () => {
    statusMode = 'immediateConnected'
    // statusCallCount 从 1 开始跳过前置检查（第一次返回 not_registered）
    statusCallCount = 0
    // 但 immediateConnected 模式下第一次返回 connected... 需要特殊处理
    // 改为 notRegistered 模式让前置检查通过，后续返回 connected
    statusMode = 'notRegistered'
    // 重新设置：第一次 status 返回 not_registered（前置检查通过），
    // 但 notRegistered 模式后续也返回空 data... 不行
    // 改用 transient 模式 + 0 failures
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const mcpArgs = ['--isolated', '--headless', '--executablePath', 'C:\\edge.exe']
    const result = await callTool({ action: 'register', mcpArgs })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true, status: 'connected' })
    expect(lastAddCommand).not.toBeNull()
    expect(lastAddCommand!).toContain('npx')
    expect(lastAddCommand!).toContain('chrome-devtools-mcp@latest')
    expect(lastAddCommand!).toContain('--isolated')
    expect(lastAddCommand!).toContain('--headless')
    expect(lastAddCommand!).toContain('--executablePath')
    expect(lastAddCommand!).toContain('C:\\edge.exe')
  })

  it('应该在 mcpArgs 为空时以默认配置启动', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const result = await callTool({ action: 'register', mcpArgs: [] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true })
    expect(lastAddCommand).not.toBeNull()
    expect(lastAddCommand!.length).toBe(3) // npx -y chrome-devtools-mcp@latest
  })

  it('应该在 mcpArgs 省略时以默认配置启动', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const result = await callTool({ action: 'register' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true })
    expect(lastAddCommand).not.toBeNull()
    expect(lastAddCommand!.length).toBe(3)
  })

  it('应该支持 --wsEndpoint 参数透传', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const wsEndpoint = 'ws://127.0.0.1:9222/devtools/browser/abc123'
    const result = await callTool({ action: 'register', mcpArgs: ['--wsEndpoint', wsEndpoint] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true })
    expect(lastAddCommand!).toContain('--wsEndpoint')
    expect(lastAddCommand!).toContain(wsEndpoint)
  })

  it('应该支持 --browserUrl 参数透传', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const result = await callTool({ action: 'register', mcpArgs: ['--browserUrl', 'http://127.0.0.1:9222'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true })
    expect(lastAddCommand!).toContain('--browserUrl')
    expect(lastAddCommand!).toContain('http://127.0.0.1:9222')
  })

  it('应该支持 --autoConnect 参数透传', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const result = await callTool({ action: 'register', mcpArgs: ['--autoConnect'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true })
    expect(lastAddCommand!).toContain('--autoConnect')
  })

  it('应该在 MCP 已连接时拒绝重复注册', async () => {
    // immediateConnected 模式下第一次 status 返回 connected
    statusMode = 'immediateConnected'

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('已注册且已连接')
    expect(r.metadata).toMatchObject({ connected: true })
  })

  it('应该在 client.mcp.add 抛出异常时返回错误提示', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0
    mockAddThrow = true

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    expect(result).toContain('注册 chrome-devtools MCP 失败')
    expect(result).toContain('npx 不可用')
  })
})

describe('ae-chrome-devtools-mcp 工具 - 稳定性轮询等待', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetState()
    const { mockExec, mockFsAccess, mockFsReadFile } = await getMocks()
    mockExec.mockRejectedValue(new Error('no process'))
    mockFsAccess.mockRejectedValue(new Error('not found'))
    mockFsReadFile.mockRejectedValue(new Error('not found'))
  })

  it('应该在 MCP 注册后立即就绪时返回 connected', async () => {
    statusMode = 'transient'
    transientFailCount = 0
    transientCurrentCount = 0

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true, status: 'connected' })
  })

  it('应该在 MCP 状态为 failed 时提前终止轮询并返回失败', async () => {
    statusMode = 'immediateFailed'

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: false, status: 'failed' })
    expect(r.output).toContain('failed')
  })

  it('应该在 MCP 需要时间就绪时轮询等待最终 connected', async () => {
    statusMode = 'transient'
    transientFailCount = 2
    transientCurrentCount = 0

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: true, status: 'connected' })
  })

  it('应该在 MCP 持续未就绪时轮询超时并返回 timeout 状态', async () => {
    statusMode = 'neverReady'

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: false, status: 'timeout' })
    expect(r.output).toContain('超时')
    expect(r.output).toContain('needs_client_registration')
  })

  it('应该在 MCP 状态检查抛出异常时返回 check_failed 状态', async () => {
    statusMode = 'checkFailed'

    const result = await callTool({ action: 'check' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: false, status: 'check_failed' })
  })

  it('应该在 MCP 需要授权时轮询超时后提示需要授权', async () => {
    statusMode = 'needsAuth'

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.metadata).toMatchObject({ connected: false, status: 'timeout' })
    expect(r.output).toContain('超时')
    expect(r.output).toContain('needs_auth')
    expect(r.output).toContain('授权')
  })
})

describe('ae-chrome-devtools-mcp 工具 - check 和 disconnect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    resetState()
  })

  it('应该在 check 时返回已连接状态', async () => {
    statusMode = 'immediateConnected'

    const result = await callTool({ action: 'check' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('已注册且已连接')
    expect(r.metadata).toMatchObject({ connected: true })
  })

  it('应该在 check 时返回未注册提示', async () => {
    statusMode = 'notRegistered'

    const result = await callTool({ action: 'check' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('未就绪')
    expect(r.metadata).toMatchObject({ connected: false, status: 'not_registered' })
  })

  it('应该在 check 时返回 disabled 提示', async () => {
    statusMode = 'disabled'

    const result = await callTool({ action: 'check' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('禁用')
    expect(r.metadata).toMatchObject({ connected: false, status: 'disabled' })
  })

  it('应该在 check 失败时返回 check_failed 提示', async () => {
    statusMode = 'checkFailed'

    const result = await callTool({ action: 'check' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('未就绪')
    expect(r.metadata).toMatchObject({ connected: false, status: 'check_failed' })
  })

  it('应该在 disconnect 时断开连接', async () => {
    const result = await callTool({ action: 'disconnect' })

    const r = result as { output: string; metadata: Record<string, unknown> }
    expect(r.output).toContain('已断开')
    expect(r.metadata).toMatchObject({ connected: false, status: 'disconnected' })
  })

  it('应该在 disconnect 失败时返回错误提示', async () => {
    mockDisconnectThrow = true

    const result = await callTool({ action: 'disconnect' })

    expect(result).toContain('断开 chrome-devtools MCP 失败')
  })

  it('应该在 client 不可用时返回提示', async () => {
    clientAvailable = false

    const result = await callTool({ action: 'register', mcpArgs: ['--isolated'] })

    expect(result).toContain('客户端不可用')
  })
})
