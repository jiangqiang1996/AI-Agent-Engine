import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { generateSessionTitle, executePromptSubmit } from './prompt-optimize.service.js'

vi.mock('./session.service.js', () => ({
  createNewSession: vi.fn(),
  navigateToSession: vi.fn(),
}))

import { createNewSession, navigateToSession } from './session.service.js'

const mockCreateNewSession = vi.mocked(createNewSession)
const mockNavigateToSession = vi.mocked(navigateToSession)

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
      mockCreateNewSession.mockReturnValue(Effect.succeed({
        id: 'session-1',
        title: '测试会话',
        url: '/sessions/session-1',
      }))
      mockNavigateToSession.mockReturnValue(Effect.succeed(undefined))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '优化后的提示词'),
      )

      expect(result.success).toBe(true)
      expect(result.sessionId).toBe('session-1')
      expect(result.sessionUrl).toBe('/sessions/session-1')
      expect(result.navigated).toBe(true)
      expect(result.optimizedPrompt).toBe('优化后的提示词')
    })

    it('导航失败为非致命，success 仍为 true', async () => {
      const client = mockClient()
      mockCreateNewSession.mockReturnValue(Effect.succeed({
        id: 'session-2',
        title: '测试',
        url: '/sessions/session-2',
      }))
      mockNavigateToSession.mockReturnValue(Effect.fail(new Error('导航失败')))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      )

      expect(result.success).toBe(true)
      expect(result.navigated).toBe(false)
    })

    it('会话创建失败时返回错误', async () => {
      const client = mockClient()
      mockCreateNewSession.mockReturnValue(Effect.fail(new Error('创建失败')))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      ).catch((e) => e)

      expect(result).toBeInstanceOf(Error)
      expect(result.name).toBe('PromptSessionCreateError')
    })

    it('提示词提交失败时返回错误', async () => {
      const client = {
        session: {
          prompt: vi.fn().mockRejectedValue(new Error('发送失败')),
        },
        tui: { publish: vi.fn() },
      } as unknown as import('@opencode-ai/sdk').OpencodeClient

      mockCreateNewSession.mockReturnValue(Effect.succeed({
        id: 'session-3',
        title: '测试',
        url: '/sessions/session-3',
      }))
      mockNavigateToSession.mockReturnValue(Effect.succeed(undefined))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词'),
      ).catch((e) => e)

      expect(result).toBeInstanceOf(Error)
      expect(result.name).toBe('PromptSubmitError')
    })

    it('使用自定义会话标题', async () => {
      const client = mockClient()
      mockCreateNewSession.mockImplementation((_client, options) =>
        Effect.succeed({
          id: 'session-4',
          title: options.title,
          url: '/sessions/session-4',
        }),
      )
      mockNavigateToSession.mockReturnValue(Effect.succeed(undefined))

      const result = await Effect.runPromise(
        executePromptSubmit(client, '提示词', '自定义标题'),
      )

      expect(result.success).toBe(true)
    })
  })
})
