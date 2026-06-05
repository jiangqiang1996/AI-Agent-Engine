import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'

import { createSessionFlow } from '../../src/services/session-create.service.js'

vi.mock('../../src/services/session.service.js', () => ({
  createNewSession: vi.fn(),
  injectNoReplyMessage: vi.fn(),
  injectSystemPrompt: vi.fn(),
  navigateToSession: vi.fn(),
  submitUserPrompt: vi.fn(),
}))

import {
  createNewSession,
  injectNoReplyMessage,
  injectSystemPrompt,
  navigateToSession,
  submitUserPrompt,
} from '../../src/services/session.service.js'

const mockCreateNewSession = vi.mocked(createNewSession)
const mockInjectNoReplyMessage = vi.mocked(injectNoReplyMessage)
const mockInjectSystemPrompt = vi.mocked(injectSystemPrompt)
const mockNavigateToSession = vi.mocked(navigateToSession)
const mockSubmitUserPrompt = vi.mocked(submitUserPrompt)

const client = {} as import('@opencode-ai/sdk').OpencodeClient

describe('session-create.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateNewSession.mockReturnValue(Effect.succeed({
      id: 'session-1',
      title: '测试会话',
      url: '/sessions/session-1',
    }))
    mockInjectNoReplyMessage.mockReturnValue(Effect.succeed(undefined))
    mockInjectSystemPrompt.mockReturnValue(Effect.succeed(undefined))
    mockNavigateToSession.mockReturnValue(Effect.succeed(undefined))
    mockSubmitUserPrompt.mockReturnValue(Effect.succeed(undefined))
  })

  it('正常路径：仅创建并导航新会话', async () => {
    const result = await Effect.runPromise(createSessionFlow(client, { title: '测试会话' }))

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(result.navigated).toBe(true)
    expect(result.contextInjected).toBe(false)
    expect(result.promptAttempted).toBe(false)
  })

  it('正常路径：优先注入 system 上下文', async () => {
    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      systemPrompt: 'system context',
      contextMessage: 'fallback context',
    }))

    expect(result.contextInjected).toBe(true)
    expect(result.fallbackMode).toBe(false)
    expect(mockInjectSystemPrompt).toHaveBeenCalledWith(client, 'session-1', 'system context')
    expect(mockInjectNoReplyMessage).not.toHaveBeenCalled()
  })

  it('边界情况：system 不支持时降级为普通上下文消息', async () => {
    mockInjectSystemPrompt.mockReturnValue(Effect.fail(new Error('不支持 system')))

    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      systemPrompt: 'system context',
      contextMessage: 'fallback context',
    }))

    expect(result.success).toBe(true)
    expect(result.partial).toBe(true)
    expect(result.fallbackMode).toBe(true)
    expect(mockInjectNoReplyMessage).toHaveBeenCalledWith(client, 'session-1', 'fallback context')
  })

  it('边界情况：system 不支持且无普通上下文时降级注入 system 内容', async () => {
    mockInjectSystemPrompt.mockReturnValue(Effect.fail(new Error('不支持 system')))

    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      systemPrompt: 'system context',
    }))

    expect(result.success).toBe(true)
    expect(result.fallbackMode).toBe(true)
    expect(mockInjectNoReplyMessage).toHaveBeenCalledWith(client, 'session-1', 'system context')
  })

  it('边界情况：提供 userPrompt 但未显式自动执行时不提交提示词', async () => {
    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      userPrompt: '请处理这个任务',
    }))

    expect(result.success).toBe(true)
    expect(result.promptAttempted).toBe(false)
    expect(mockSubmitUserPrompt).not.toHaveBeenCalled()
  })

  it('正常路径：自动执行时提交经过浏览器门禁处理的提示词', async () => {
    const prompt = '使用 chrome-devtools_navigate_page type=url url=http://localhost:3000'
    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      userPrompt: prompt,
      autoExecute: true,
    }))

    expect(result.promptAttempted).toBe(true)
    expect(result.promptSubmitted).toBe(true)
    expect(result.recoverablePrompt).toContain('ae:chrome-devtools')
    expect(mockSubmitUserPrompt).toHaveBeenCalledWith(client, 'session-1', result.recoverablePrompt)
  })

  it('正常路径：自动执行时对 system 上下文中的浏览器要求应用门禁', async () => {
    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      systemPrompt: '使用 chrome-devtools-mcp 打开页面并截图',
      userPrompt: '开始',
      autoExecute: true,
    }))

    expect(result.promptSubmitted).toBe(true)
    expect(result.recoverablePrompt).toContain('ae:chrome-devtools')
    expect(result.recoverablePrompt).toContain('使用 chrome-devtools-mcp 打开页面并截图')
    expect(result.recoverablePrompt).toContain('开始')
  })

  it('错误路径：autoExecute 为 true 但提示词为空时拒绝执行', async () => {
    const error = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      userPrompt: '   ',
      autoExecute: true,
    })).catch((e) => e)

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('user_prompt')
    expect(mockCreateNewSession).not.toHaveBeenCalled()
  })

  it('错误路径：提示词提交失败时返回部分成功和可恢复提示词', async () => {
    mockSubmitUserPrompt.mockReturnValue(Effect.fail(new Error('发送失败')))

    const result = await Effect.runPromise(createSessionFlow(client, {
      title: '测试会话',
      userPrompt: '提示词',
      autoExecute: true,
    }))

    expect(result.success).toBe(false)
    expect(result.partial).toBe(true)
    expect(result.promptSubmitted).toBe(false)
    expect(result.recoverablePrompt).toBe('提示词')
    expect(result.warnings.join('\n')).toContain('发送失败')
  })
})
