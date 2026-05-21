import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'

import { executeHandoff } from '../../src/services/handoff.service.js'

vi.mock('../../src/services/session.service.js', () => ({
  formatContextMessage: vi.fn(() => 'context message'),
  formatSystemPrompt: vi.fn(() => 'system prompt'),
}))

vi.mock('../../src/services/session-create.service.js', () => ({
  createSessionFlow: vi.fn(),
}))

import { createSessionFlow } from '../../src/services/session-create.service.js'

const mockCreateSessionFlow = vi.mocked(createSessionFlow)

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
})
