import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'

vi.mock('../../src/services/client-holder.js', () => ({
  getGlobalClient: vi.fn(),
}))

vi.mock('../../src/services/session-create.service.js', () => ({
  createSessionFlow: vi.fn(),
}))

import { getGlobalClient } from '../../src/services/client-holder.js'
import { createSessionFlow } from '../../src/services/session-create.service.js'

const mockGetGlobalClient = vi.mocked(getGlobalClient)
const mockCreateSessionFlow = vi.mocked(createSessionFlow)

async function callTool(
  args: Record<string, unknown>,
  ask: (input: unknown) => Promise<void> = () => Promise.resolve(),
) {
  return callToolWithContext(args, { ask })
}

async function callToolWithContext(
  args: Record<string, unknown>,
  overrides: Record<string, unknown>,
) {
  const { aeCreateSessionTool: tool } = await import('../../src/tools/ae-create-session.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<{ output: string; metadata: Record<string, unknown> }>
  }
  return definition.execute(args, {
    metadata: vi.fn(),
    worktree: process.cwd(),
    directory: process.cwd(),
    sessionID: 'test-session',
    abort: new AbortController().signal,
    ...overrides,
  })
}

describe('ae-create-session 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('客户端缺失时返回友好错误', async () => {
    mockGetGlobalClient.mockReturnValue(null)

    const result = await callTool({ title: '测试', require_confirmation: false })

    expect(result.output).toContain('客户端初始化失败')
    expect(result.metadata.success).toBe(false)
  })

  it('缺少 require_confirmation 时返回可恢复错误且不创建会话', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)

    const result = await callTool({ title: '测试' })

    expect(result.output).toContain('缺少必填参数 require_confirmation')
    expect(result.metadata.success).toBe(false)
    expect(result.metadata.missingRequiredArgument).toBe('require_confirmation')
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('require_confirmation=false 时普通创建不需要 ask 授权', async () => {
    const ask = vi.fn(() => Promise.reject(new Error('should not ask')))
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: [],
    }))

    const result = await callTool({ title: '测试', require_confirmation: false }, ask)

    expect(result.output).toContain('新会话创建完成')
    expect(ask).not.toHaveBeenCalled()
    expect(mockCreateSessionFlow).toHaveBeenCalled()
  })

  it('用户取消创建确认时不创建会话', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)

    const result = await callTool(
      { title: '测试', user_prompt: '提示词', auto_execute: true, require_confirmation: true },
      () => Promise.reject(new Error('denied')),
    )

    expect(result.output).toContain('用户已取消新会话创建')
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('创建确认请求异常时不误报为用户取消', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)

    const result = await callTool(
      { title: '测试', user_prompt: '提示词', auto_execute: true, require_confirmation: true },
      () => Promise.reject(new Error('unsupported permission: session')),
    )

    expect(result.output).toContain('新会话创建确认请求失败')
    expect(result.output).toContain('unsupported permission: session')
    expect(result.metadata.authorizationFailed).toBe(true)
    expect(result.metadata.cancelled).toBeUndefined()
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('require_confirmation=true 但 ctx.ask 缺失时进入 catch 返回失败提示', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)

    const result = await callToolWithContext({ title: '测试', require_confirmation: true }, {})

    expect(result.output).toContain('新会话创建确认请求失败')
    expect(result.metadata?.authorizationFailed).toBe(true)
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('正常路径：创建新会话并返回地址', async () => {
    const ask = vi.fn(() => Promise.resolve())
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: [],
    }))

    const result = await callTool({ title: '测试', require_confirmation: false }, ask)

    expect(result.output).toContain('新会话创建完成')
    expect(result.output).toContain('/sessions/session-1')
    expect(ask).not.toHaveBeenCalled()
    expect(mockCreateSessionFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: '测试',
      autoExecute: false,
    }))
  })

  it('普通独立工具调用不依赖运行时 ask', async () => {
    const ask = vi.fn(() => Promise.resolve())
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: false,
      contextInjected: true,
      fallbackMode: false,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: [],
    }))

    const result = await callTool({ title: '测试', context_message: '上下文', navigate: false, require_confirmation: false }, ask)

    expect(result.output).toContain('新会话创建完成')
    expect(result.output).toContain('上下文已注入')
    expect(ask).not.toHaveBeenCalled()
    expect(mockCreateSessionFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      contextMessage: '上下文',
      navigate: false,
    }))
  })

  it('require_confirmation=true 时请求确认并调用通用服务', async () => {
    const ask = vi.fn(() => Promise.resolve())
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: true,
      promptSubmitted: true,
      warnings: [],
      recoverablePrompt: '提示词',
    }))

    const result = await callTool(
      { title: '测试', user_prompt: '提示词', auto_execute: true, require_confirmation: true },
      ask,
    )

    expect(result.output).toContain('提示词已提交')
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        auto_execute: true,
        user_prompt: expect.objectContaining({ present: true, length: 3, preview: '提示词' }),
      }),
    }))
    expect(mockCreateSessionFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userPrompt: '提示词',
      autoExecute: true,
    }))
  })

  it('自动执行授权兼容运行时 ask 返回 Promise', async () => {
    const ask = vi.fn(() => Promise.resolve())
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: true,
      promptSubmitted: true,
      warnings: [],
      recoverablePrompt: '提示词',
    }))

    const result = await callTool(
      { title: '测试', user_prompt: '提示词', auto_execute: true, require_confirmation: true },
      ask,
    )

    expect(result.output).toContain('提示词已提交')
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      patterns: ['create-session-and-prompt'],
    }))
  })

  it('require_confirmation=false 时 auto_execute=true 不额外请求确认', async () => {
    const ask = vi.fn(() => Promise.reject(new Error('should not ask')))
    mockGetGlobalClient.mockReturnValue({} as never)
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: true,
      promptSubmitted: true,
      warnings: [],
      recoverablePrompt: '提示词',
    }))

    const result = await callTool(
      { title: '测试', user_prompt: '提示词', auto_execute: true, require_confirmation: false },
      ask,
    )

    expect(result.output).toContain('提示词已提交')
    expect(ask).not.toHaveBeenCalled()
    expect(mockCreateSessionFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userPrompt: '提示词',
      autoExecute: true,
    }))
  })
})
