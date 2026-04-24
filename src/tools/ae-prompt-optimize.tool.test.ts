import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/client-holder.js', () => ({
  getGlobalClient: vi.fn(),
}))

vi.mock('../services/prompt-optimize.service.js', () => ({
  executePromptSubmit: vi.fn(),
  generateSessionTitle: vi.fn(),
}))

import { getGlobalClient } from '../services/client-holder.js'
import { executePromptSubmit } from '../services/prompt-optimize.service.js'
import { Effect } from 'effect'

const mockGetGlobalClient = vi.mocked(getGlobalClient)
const mockExecutePromptSubmit = vi.mocked(executePromptSubmit)

async function callTool(args: { optimized_prompt: string; session_title?: string }) {
  const { aePromptOptimizeTool: tool } = await import('./ae-prompt-optimize.tool.js')
  const definition = tool as unknown as {
    args: Record<string, { _def: unknown }>
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }

  const mockCtx = {
    metadata: vi.fn(),
    directory: '/test',
    sessionID: 'test-session',
    worktree: '/test',
    abort: new AbortController().signal,
  }

  return definition.execute(args, mockCtx)
}

describe('ae-prompt-optimize 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('客户端未初始化时返回友好错误并包含提示词原文', async () => {
    mockGetGlobalClient.mockReturnValue(null)

    const result = await callTool({ optimized_prompt: '测试提示词' })

    expect(result).toContain('客户端初始化失败')
    expect(result).toContain('测试提示词')
  })

  it('成功提交后返回会话地址', async () => {
    const mockClient = { session: {} } as never
    mockGetGlobalClient.mockReturnValue(mockClient)
    mockExecutePromptSubmit.mockReturnValue(
      Effect.succeed({
        success: true,
        sessionId: 'new-session',
        sessionUrl: '/sessions/new-session',
        navigated: true,
        optimizedPrompt: '提示词',
      }),
    )

    const result = await callTool({ optimized_prompt: '提示词' })

    expect(result).toContain('提示词已提交到新会话')
    expect(result).toContain('/sessions/new-session')
    expect(result).toContain('已自动切换到新会话窗口')
  })

  it('导航失败时显示降级提示', async () => {
    const mockClient = { session: {} } as never
    mockGetGlobalClient.mockReturnValue(mockClient)
    mockExecutePromptSubmit.mockReturnValue(
      Effect.succeed({
        success: true,
        sessionId: 'new-session',
        sessionUrl: '/sessions/new-session',
        navigated: false,
        optimizedPrompt: '提示词',
      }),
    )

    const result = await callTool({ optimized_prompt: '提示词' })

    expect(result).toContain('导航未成功')
    expect(result).toContain('/sessions/new-session')
  })

  it('提交失败时返回提示词原文', async () => {
    const mockClient = { session: {} } as never
    mockGetGlobalClient.mockReturnValue(mockClient)
    mockExecutePromptSubmit.mockImplementation(() =>
      Effect.fail(Object.assign(new Error('发送失败'), { name: 'PromptSubmitError' })),
    )

    const result = await callTool({ optimized_prompt: '我的提示词' })

    expect(result).toContain('提交失败')
    expect(result).toContain('我的提示词')
  })
})
