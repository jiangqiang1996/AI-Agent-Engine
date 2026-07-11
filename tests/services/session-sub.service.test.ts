import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEventBus } from '../../src/services/event-bus.js'
import { createSubSession, promptAsyncAndWait, formatProgress, type PromptOptions } from '../../src/services/session-sub.service.js'

import type { OpencodeClient } from '@opencode-ai/sdk'

type MockClient = Partial<OpencodeClient>

function createMockClient(overrides: Partial<{
  create: ReturnType<typeof vi.fn>
  promptAsync: ReturnType<typeof vi.fn>
  status: ReturnType<typeof vi.fn>
  messages: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}> = {}): MockClient {
  return {
    session: {
      create: overrides.create ?? vi.fn(async () => ({ data: { id: 's1', title: 'test' }, error: undefined })),
      promptAsync: overrides.promptAsync ?? vi.fn(async () => ({ data: {}, error: undefined })),
      status: overrides.status ?? vi.fn(async () => ({ data: { s1: { type: 'idle' } }, error: undefined })),
      messages: overrides.messages ?? vi.fn(async () => ({ data: [], error: undefined })),
      delete: overrides.delete ?? vi.fn(async () => ({ data: undefined, error: undefined })),
    } as never,
  } as MockClient
}

describe('session-sub.service', () => {
  beforeEach(() => {
    resetEventBus()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSubSession', () => {
    it('正常创建返回 id 和 title', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: { id: 'session-abc', title: '标题' }, error: undefined })),
      })

      const result = await createSubSession(client as never, { title: '标题' })

      expect(result.id).toBe('session-abc')
      expect(result.title).toBe('标题')
    })

    it('res.error 时抛出错误', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: undefined, error: { message: '创建失败' } })),
      })

      await expect(createSubSession(client as never, { title: 't' })).rejects.toThrow('创建失败')
    })

    it('res.error 为字符串时保留原始错误', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: undefined, error: 'Session limit exceeded' })),
      })

      await expect(createSubSession(client as never, { title: 't' })).rejects.toThrow('Session limit exceeded')
    })

    it('res.error 无 message 时 JSON.stringify 序列化', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: undefined, error: { code: 500 } })),
      })

      await expect(createSubSession(client as never, { title: 't' })).rejects.toThrow('{"code":500}')
    })

    it('返回数据缺少 id 时抛出错误', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: { title: '无id' }, error: undefined })),
      })

      await expect(createSubSession(client as never, { title: 't' })).rejects.toThrow('缺少 id')
    })

    it('返回数据缺少 title 时使用 options.title 回退', async () => {
      const client = createMockClient({
        create: vi.fn(async () => ({ data: { id: 's1' }, error: undefined })),
      })

      const result = await createSubSession(client as never, { title: '回退标题' })
      expect(result.title).toBe('回退标题')
    })

    it('parentID 存在时传递给 body', async () => {
      const mockCreate = vi.fn(async () => ({ data: { id: 's1', title: 't' }, error: undefined }))
      const client = createMockClient({ create: mockCreate })

      await createSubSession(client as never, { title: 't', parentID: 'parent-1' })

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({ parentID: 'parent-1' }),
      }))
    })

    it('directory 存在时传递给 query', async () => {
      const mockCreate = vi.fn(async () => ({ data: { id: 's1', title: 't' }, error: undefined }))
      const client = createMockClient({ create: mockCreate })

      await createSubSession(client as never, { title: 't', directory: '/work/dir' })

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        query: { directory: '/work/dir' },
      }))
    })
  })

  describe('promptAsyncAndWait', () => {
    const baseOptions: PromptOptions = {
      sessionID: 's1',
      text: '测试消息',
    }

    it('正常流程返回消息提取结果', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'idle' } }, error: undefined })),
        messages: vi.fn(async () => ({
          data: [
            { info: { role: 'user' }, parts: [{ type: 'text', text: '用户消息' }] },
            { info: { role: 'assistant' }, parts: [{ type: 'text', text: '助手回复' }] },
          ],
          error: undefined,
        })),
      })

      const result = await promptAsyncAndWait(client as never, baseOptions)

      expect(result.sessionID).toBe('s1')
      expect(result.assistantText).toBe('助手回复')
      expect(result.toolCalls).toHaveLength(0)
    })

    it('promptAsync 返回 error 时抛出', async () => {
      const client = createMockClient({
        promptAsync: vi.fn(async () => ({ data: undefined, error: { message: '异步发送失败' } })),
      })

      await expect(promptAsyncAndWait(client as never, baseOptions)).rejects.toThrow('异步发送失败')
    })

    it('messages 返回 error 时抛出', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'idle' } }, error: undefined })),
        messages: vi.fn(async () => ({ data: undefined, error: { message: '获取消息失败' } })),
      })

      await expect(promptAsyncAndWait(client as never, baseOptions)).rejects.toThrow('获取消息失败')
    })

    it('status 返回 error 时抛出', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: undefined, error: { message: '状态检查失败' } })),
      })

      await expect(promptAsyncAndWait(client as never, baseOptions)).rejects.toThrow('状态检查失败')
    })

    it('会话 status 为 error 时抛出异常状态', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'error' } }, error: undefined })),
      })

      await expect(promptAsyncAndWait(client as never, baseOptions)).rejects.toThrow('状态异常')
    })

    it('会话 status 为 aborted 时抛出异常状态', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'aborted' } }, error: undefined })),
      })

      await expect(promptAsyncAndWait(client as never, baseOptions)).rejects.toThrow('状态异常')
    })

    it('status 未找到会话时继续轮询直到 idle', async () => {
      let callCount = 0
      const client = createMockClient({
        status: vi.fn(async () => {
          callCount++
          if (callCount < 3) {
            return { data: {}, error: undefined }
          }
          return { data: { s1: { type: 'idle' } }, error: undefined }
        }),
        messages: vi.fn(async () => ({ data: [{ info: { role: 'assistant' }, parts: [{ type: 'text', text: '结果' }] }], error: undefined })),
      })

      const result = await promptAsyncAndWait(client as never, baseOptions)

      expect(result.assistantText).toBe('结果')
      expect(callCount).toBeGreaterThanOrEqual(3)
    })

    it('abortSignal 已中止时抛出已中止错误', async () => {
      const controller = new AbortController()
      controller.abort()

      const client = createMockClient()

      await expect(
        promptAsyncAndWait(client as never, { ...baseOptions, abortSignal: controller.signal }),
      ).rejects.toThrow('已中止')
    })

    it('成功提取 toolCalls', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'idle' } }, error: undefined })),
        messages: vi.fn(async () => ({
          data: [{
            info: { role: 'assistant' },
            parts: [
              { type: 'text', text: '回复' },
              { type: 'tool', tool: 'read', state: { status: 'completed', input: { path: '/a' }, output: '内容' } },
            ],
          }],
          error: undefined,
        })),
      })

      const result = await promptAsyncAndWait(client as never, baseOptions)

      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls[0].tool).toBe('read')
      expect(result.toolCalls[0].input).toEqual({ path: '/a' })
      expect(result.toolCalls[0].output).toBe('内容')
    })

    it('onProgress 回调正确注册和注销', async () => {
      const client = createMockClient({
        status: vi.fn(async () => ({ data: { s1: { type: 'idle' } }, error: undefined })),
        messages: vi.fn(async () => ({ data: [], error: undefined })),
      })

      const onProgress = vi.fn()
      await promptAsyncAndWait(client as never, { ...baseOptions, onProgress })

      // onProgress 通过 event-bus 触发，当前没有 dispatch 事件，所以不会调用
      // 但确保不抛异常
      expect(onProgress).not.toHaveBeenCalled()
    })
  })

  describe('formatProgress', () => {
    it('text 类型返回文本', () => {
      expect(formatProgress({ kind: 'text', sessionID: 's1', text: 'hello' })).toBe('hello')
    })

    it('reasoning 类型返回带前缀', () => {
      expect(formatProgress({ kind: 'reasoning', sessionID: 's1', text: '思考中' })).toBe('[思考] 思考中')
    })

    it('tool_start 类型返回工具名和输入', () => {
      const result = formatProgress({ kind: 'tool_start', sessionID: 's1', tool: 'read', input: { path: '/a' } })
      expect(result).toContain('[工具] read')
      expect(result).toContain('path')
    })

    it('tool_end 完成时返回工具名和输出', () => {
      const result = formatProgress({ kind: 'tool_end', sessionID: 's1', tool: 'write', output: 'done' })
      expect(result).toContain('[工具] write 完成')
      expect(result).toContain('done')
    })

    it('tool_end 有 error 时返回失败信息', () => {
      const result = formatProgress({ kind: 'tool_end', sessionID: 's1', tool: 'read', output: '', error: '权限拒绝' })
      expect(result).toContain('失败')
      expect(result).toContain('权限拒绝')
    })

    it('step_start 返回步骤开始', () => {
      expect(formatProgress({ kind: 'step_start', sessionID: 's1' })).toBe('[步骤开始]')
    })

    it('step_finish 返回带原因', () => {
      expect(formatProgress({ kind: 'step_finish', sessionID: 's1', reason: '完成' })).toBe('[步骤结束] 完成')
    })

    it('status 返回状态', () => {
      expect(formatProgress({ kind: 'status', sessionID: 's1', status: 'idle' })).toBe('[状态] idle')
    })

    it('error 返回错误消息', () => {
      expect(formatProgress({ kind: 'error', sessionID: 's1', message: '出错了' })).toBe('[错误] 出错了')
    })
  })
})
