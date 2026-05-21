import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { generateSessionTitle, executePromptSubmit } from '../../src/services/prompt-optimize.service.js'

vi.mock('../../src/services/session.service.js', () => ({
  createNewSession: vi.fn(),
  navigateToSession: vi.fn(),
}))

vi.mock('../../src/services/session-create.service.js', () => ({
  createSessionFlow: vi.fn(),
}))

import { createNewSession, navigateToSession } from '../../src/services/session.service.js'
import { createSessionFlow } from '../../src/services/session-create.service.js'

const mockCreateNewSession = vi.mocked(createNewSession)
const mockNavigateToSession = vi.mocked(navigateToSession)
const mockCreateSessionFlow = vi.mocked(createSessionFlow)

function mockClient() {
  return {
    session: {
      create: vi.fn(),
      prompt: vi.fn().mockResolvedValue({}),
    },
    tui: {
      publish: vi.fn().mockResolvedValue({}),
    },
  } as unknown as import('@opencode-ai/sdk').OpencodeClient
}

describe('prompt-optimize.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
      recoverablePrompt: '优化后的提示词',
    }))
  })

  describe('generateSessionTitle', () => {
    it('从提示词语义内容生成标题', () => {
      const result = generateSessionTitle('/ae-work 帮我实现登录页面')
      expect(result).toMatch(/^优化：/)
      expect(result).toContain('帮我实现登录')
    })

    it('跳过开头的命令引用', () => {
      const result = generateSessionTitle('/ae-frontend-design 做个仪表盘')
      expect(result).not.toContain('/ae-frontend-design')
      expect(result).toContain('做个仪表盘')
    })

    it('跳过 auto 标记', () => {
      const result = generateSessionTitle('auto 帮我写个组件')
      expect(result).not.toContain('auto')
    })

    it('纯文本提示词直接提取', () => {
      const result = generateSessionTitle('帮我优化这段代码的性能')
      expect(result).toContain('帮我优化这段')
    })

    it('空内容回退到时间戳', () => {
      const result = generateSessionTitle('   ')
      expect(result).toMatch(/^优化会话：/)
    })

    it('标题不超过合理长度', () => {
      const result = generateSessionTitle('/ae-work ' + '这是一段非常长的提示词'.repeat(20))
      expect(result.length).toBeLessThan(50)
    })
  })

  describe('executePromptSubmit', () => {
    it('正常路径：创建会话、发送消息、导航成功', async () => {
      const client = mockClient()

      const result = await Effect.runPromise(
        executePromptSubmit(client, '优化后的提示词'),
      )

      expect(result.success).toBe(true)
      expect(result.sessionId).toBe('session-1')
      expect(result.sessionUrl).toBe('/sessions/session-1')
      expect(result.navigated).toBe(true)
      expect(result.optimizedPrompt).toBe('优化后的提示词')
      expect(mockCreateSessionFlow).toHaveBeenCalledWith(client, expect.objectContaining({
        userPrompt: '优化后的提示词',
        autoExecute: true,
        navigate: true,
      }))
    })

    it('导航失败为非致命，success 仍为 true', async () => {
      const client = mockClient()
      mockCreateSessionFlow.mockReturnValue(Effect.succeed({
        success: true,
        partial: true,
        sessionId: 'session-2',
        sessionUrl: '/sessions/session-2',
        navigated: false,
        contextInjected: false,
        fallbackMode: false,
        promptAttempted: true,
        promptSubmitted: true,
        warnings: ['导航失败'],
      }))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      )

      expect(result.success).toBe(true)
      expect(result.navigated).toBe(false)
    })

    it('会话创建失败时返回错误', async () => {
      const client = mockClient()
      mockCreateSessionFlow.mockReturnValue(Effect.fail(new Error('创建失败')))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      ).catch((e) => e)

      expect(result).toBeInstanceOf(Error)
      expect(result.name).toBe('PromptSessionCreateError')
    })

    it('提示词提交失败时返回错误，避免误报成功', async () => {
      const client = mockClient()
      mockCreateSessionFlow.mockReturnValue(Effect.succeed({
        success: false,
        partial: true,
        sessionId: 'session-3',
        sessionUrl: '/sessions/session-3',
        navigated: true,
        contextInjected: false,
        fallbackMode: false,
        promptAttempted: true,
        promptSubmitted: false,
        warnings: ['提示词提交失败：发送失败'],
        recoverablePrompt: '提示词',
      }))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      ).catch((e) => e)

      expect(result).toBeInstanceOf(Error)
      expect(result.message).toContain('发送失败')
      expect(result.recoverablePrompt).toBe('提示词')
    })

    it('使用自定义会话标题', async () => {
      const client = mockClient()

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词', '自定义标题'),
      )

      expect(result.success).toBe(true)
      expect(mockCreateSessionFlow).toHaveBeenCalledWith(client, expect.objectContaining({ title: '自定义标题' }))
    })
  })
})
