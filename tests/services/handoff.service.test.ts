import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'

import { executeHandoff } from '../../src/services/handoff.service.js'

vi.mock('../../src/services/session.service.js', () => ({
  formatContextMessage: vi.fn(() => 'context message'),
  formatSystemPrompt: vi.fn(() => 'system prompt'),
  forkSession: vi.fn(() => Effect.fail(new Error('fork not available in test'))),
  injectSystemPrompt: vi.fn(() => Effect.succeed(undefined)),
  injectNoReplyMessage: vi.fn(() => Effect.succeed(undefined)),
  navigateToSession: vi.fn(() => Effect.succeed(undefined)),
}))

vi.mock('../../src/services/session-create.service.js', () => ({
  createSessionFlow: vi.fn(),
}))

import { createSessionFlow } from '../../src/services/session-create.service.js'
import { forkSession, navigateToSession, injectSystemPrompt } from '../../src/services/session.service.js'

const mockCreateSessionFlow = vi.mocked(createSessionFlow)
const mockForkSession = vi.mocked(forkSession)
const mockNavigateToSession = vi.mocked(navigateToSession)
const mockInjectSystemPrompt = vi.mocked(injectSystemPrompt)

const extractResult = {
  userRequests: '用户请求',
  goal: '目标',
  workCompleted: '已完成',
  currentState: '当前状态',
  pendingTasks: '待办',
  keyFiles: '关键文件',
  importantDecisions: '决策',
  explicitConstraints: '约束',
  contextForContinuation: '续会注意事项',
  compressionLevel: 1,
}

describe('handoff.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockForkSession.mockReturnValue(Effect.fail(new Error('fork not available in test')))
    mockInjectSystemPrompt.mockReturnValue(Effect.succeed(undefined))
    mockNavigateToSession.mockReturnValue(Effect.succeed(undefined))
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: false,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: true,
      fallbackMode: false,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: [],
    }))
  })

  it('正常路径：调用通用服务创建并注入交接上下文', async () => {
    const result = await Effect.runPromise(executeHandoff({} as never, {} as never, extractResult))

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(result.sessionUrl).toBe('/sessions/session-1')
    expect(result.fallbackMode).toBe(false)
    expect(mockCreateSessionFlow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      systemPrompt: 'system prompt',
      contextMessage: 'context message',
      navigate: true,
    }))
  })

  it('边界情况：system 注入失败后降级结果透传', async () => {
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: true,
      partial: true,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: false,
      contextInjected: true,
      fallbackMode: true,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: ['system 注入失败'],
    }))

    const result = await Effect.runPromise(executeHandoff({} as never, {} as never, extractResult))

    expect(result.success).toBe(true)
    expect(result.fallbackMode).toBe(true)
    expect(result.navigated).toBe(false)
  })

  it('错误路径：上下文未注入时返回 ContextInjectError', async () => {
    mockCreateSessionFlow.mockReturnValue(Effect.succeed({
      success: false,
      partial: true,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      navigated: true,
      contextInjected: false,
      fallbackMode: false,
      promptAttempted: false,
      promptSubmitted: false,
      warnings: [],
      error: '注入失败',
    }))

    const error = await Effect.runPromise(executeHandoff({} as never, {} as never, extractResult)).catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContextInjectError')
  })

  it('错误路径：通用服务上下文注入失败时保留 ContextInjectError 分类', async () => {
    mockCreateSessionFlow.mockReturnValue(Effect.fail(new Error('上下文注入失败：boom')))

    const error = await Effect.runPromise(executeHandoff({} as never, {} as never, extractResult)).catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ContextInjectError')
    expect(error.message).toContain('boom')
  })

  it('fork 成功路径：优先使用 fork 会话并注入 system prompt', async () => {
    mockForkSession.mockReturnValueOnce(Effect.succeed({
      id: 'forked-session',
      title: 'forked',
      url: '/sessions/forked-session',
    }))

    const result = await Effect.runPromise(executeHandoff(
      { sessionID: 'source-session' } as never,
      {} as never,
      extractResult,
    ))

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('forked-session')
    expect(result.sessionUrl).toBe('/sessions/forked-session')
    expect(result.fallbackMode).toBe(false)
    expect(mockForkSession).toHaveBeenCalledWith({} as never, 'source-session')
    expect(mockInjectSystemPrompt).toHaveBeenCalledWith({} as never, 'forked-session', 'system prompt')
    expect(mockNavigateToSession).toHaveBeenCalledWith({} as never, 'forked-session')
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('fork 成功但 system 注入失败时降级为 noReply 仍使用 fork 会话', async () => {
    mockForkSession.mockReturnValueOnce(Effect.succeed({
      id: 'forked-session',
      title: 'forked',
      url: '/sessions/forked-session',
    }))
    mockInjectSystemPrompt.mockReturnValueOnce(Effect.fail(new Error('system not supported')))

    const result = await Effect.runPromise(executeHandoff(
      { sessionID: 'source-session' } as never,
      {} as never,
      extractResult,
    ))

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('forked-session')
    expect(result.fallbackMode).toBe(false)
    expect(mockCreateSessionFlow).not.toHaveBeenCalled()
  })

  it('无 sessionID 时直接走创建新会话路径', async () => {
    const result = await Effect.runPromise(executeHandoff(
      { sessionID: '' } as never,
      {} as never,
      extractResult,
    ))

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(mockForkSession).not.toHaveBeenCalled()
    expect(mockCreateSessionFlow).toHaveBeenCalled()
  })
})
