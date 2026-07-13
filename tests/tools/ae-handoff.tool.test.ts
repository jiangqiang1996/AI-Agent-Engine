import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'

vi.mock('../../src/services/client-holder.js', () => ({
  getGlobalClient: vi.fn(),
}))

vi.mock('../../src/services/handoff.service.js', () => ({
  executeHandoff: vi.fn(),
}))

import { getGlobalClient } from '../../src/services/client-holder.js'
import { executeHandoff } from '../../src/services/handoff.service.js'

const mockGetGlobalClient = vi.mocked(getGlobalClient)
const mockExecuteHandoff = vi.mocked(executeHandoff)

async function callTool(args: Record<string, unknown>) {
  const { aeHandoffTool: tool } = await import('../../src/tools/ae-handoff.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }
  return definition.execute(args, {
    metadata: vi.fn(),
    worktree: process.cwd(),
    directory: process.cwd(),
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
}

const args = {
  user_requests: '用户请求',
  goal: '目标',
  work_completed: '已完成',
  current_state: '当前状态',
  pending_tasks: '待办',
  key_files: '关键文件',
  important_decisions: '决策',
  explicit_constraints: '约束',
  context_for_continuation: '续会注意事项',
  compression_level: 1,
}

describe('ae-handoff 工具', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('客户端缺失时返回友好错误', async () => {
    mockGetGlobalClient.mockReturnValue(null)

    const result = await callTool(args)

    expect(result).toContain('客户端初始化失败')
  })

  it('正常路径：返回新会话地址和摘要', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)
    mockExecuteHandoff.mockReturnValue(Effect.succeed({
      success: true,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      fallbackMode: false,
      navigated: true,
      extractedSummary: {
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
      },
    }))

    const result = await callTool(args)

    expect(result).toContain('会话交接成功')
    expect(result).toContain('/sessions/session-1')
    expect(result).toContain('用户请求：用户请求')
  })

  it('pendingTasks 直接透传，不从历史中提取设计文件', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)
    mockExecuteHandoff.mockImplementation((ctx, client, extractResult) => {
      return Effect.succeed({
        success: true,
        sessionId: 'session-1',
        sessionUrl: '/sessions/session-1',
        fallbackMode: false,
        navigated: true,
        extractedSummary: {
          userRequests: extractResult.userRequests,
          goal: extractResult.goal,
          workCompleted: extractResult.workCompleted,
          currentState: extractResult.currentState,
          pendingTasks: extractResult.pendingTasks,
          keyFiles: extractResult.keyFiles,
          importantDecisions: extractResult.importantDecisions,
          explicitConstraints: extractResult.explicitConstraints,
          contextForContinuation: extractResult.contextForContinuation,
          compressionLevel: extractResult.compressionLevel,
        },
      })
    })

    const { aeHandoffTool: tool } = await import('../../src/tools/ae-handoff.tool.js')
    const definition = tool as unknown as {
      execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
    }

    const result = await definition.execute(args, {
      metadata: vi.fn(),
      worktree: process.cwd(),
      directory: process.cwd(),
      sessionID: 'test-session',
      abort: new AbortController().signal,
      history: [
        { content: '我们参考了 ./ae/designs/test-design.md 中的方案' },
      ],
    })

    expect(mockExecuteHandoff).toHaveBeenCalled()
    const callArgs = mockExecuteHandoff.mock.calls[0]
    const enrichedPending = callArgs[2].pendingTasks
    expect(enrichedPending).toBe('待办')
  })

  it('降级模式：输出上下文普通消息注入提示', async () => {
    mockGetGlobalClient.mockReturnValue({} as never)
    mockExecuteHandoff.mockReturnValue(Effect.succeed({
      success: true,
      sessionId: 'session-1',
      sessionUrl: '/sessions/session-1',
      fallbackMode: true,
      navigated: true,
      extractedSummary: {
        userRequests: 'None',
        goal: '目标',
        workCompleted: 'None',
        currentState: 'None',
        pendingTasks: 'None',
        keyFiles: 'None',
        importantDecisions: 'None',
        explicitConstraints: 'None',
        contextForContinuation: 'None',
      },
    }))

    const result = await callTool(args)

    expect(result).toContain('已使用降级模式')
  })
})
