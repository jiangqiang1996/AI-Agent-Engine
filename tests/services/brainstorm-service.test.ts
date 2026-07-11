import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PERSPECTIVE_IDS,
  PERSPECTIVE_IDS,
  buildPerspectivePrompt,
  buildSynthesisPrompt,
  extractCoreViewpoint,
  extractTextFromParts,
  isRateLimitLikeError,
  parseModelReference,
  type PerspectiveOutput,
} from '../../src/services/brainstorm-service.js'

import { setBrainstormConfig } from '../../src/services/brainstorm-config-holder.js'
import { setModelScenarioRoutingContext } from '../../src/services/model-scenario-holder.js'
import { createModelScenarioRoutingContext } from '../../src/services/model-scenario-routing-service.js'

vi.mock('../../src/services/client-holder.js', () => ({
  getGlobalClient: vi.fn(),
}))

vi.mock('../../src/services/brainstorm-config-service.js', () => ({
  resolveBrainstormModels: vi.fn(() => ({ models: [], source: 'test' })),
}))

vi.mock('../../src/services/session-sub.service.js', () => ({
  promptAsyncAndWait: vi.fn(),
  createSubSession: vi.fn(async (_client: unknown, options: { title: string; parentID?: string }) => {
    return { id: `session-${++globalSessionCounter}`, title: options.title }
  }),
}))

let globalSessionCounter = 0

import { getGlobalClient } from '../../src/services/client-holder.js'
import { resolveBrainstormModels } from '../../src/services/brainstorm-config-service.js'
import { promptAsyncAndWait, createSubSession } from '../../src/services/session-sub.service.js'

const mockGetGlobalClient = vi.mocked(getGlobalClient)
const mockResolveBrainstormModels = vi.mocked(resolveBrainstormModels)

describe('brainstorm-service - parseModelReference', () => {
  it('应该正确解析 provider/model 格式', () => {
    const result = parseModelReference('anthropic/claude-3-5-sonnet')
    expect(result).toEqual({ providerID: 'anthropic', modelID: 'claude-3-5-sonnet' })
  })

  it('应该对 undefined 返回 undefined', () => {
    expect(parseModelReference(undefined)).toBeUndefined()
  })

  it('应该对不含斜杠的字符串返回 undefined', () => {
    expect(parseModelReference('invalid')).toBeUndefined()
  })

  it('应该对以斜杠开头的字符串返回 undefined（provider 为空）', () => {
    expect(parseModelReference('/model')).toBeUndefined()
  })

  it('应该正确处理含多个斜杠的模型标识', () => {
    const result = parseModelReference('openai/gpt-4o/mini')
    expect(result).toEqual({ providerID: 'openai', modelID: 'gpt-4o/mini' })
  })
})

describe('brainstorm-service - extractTextFromParts', () => {
  it('应该提取 text 类型 parts 的文本', () => {
    const parts = [
      { type: 'text', text: '第一段' },
      { type: 'text', text: '第二段' },
    ]
    expect(extractTextFromParts(parts)).toBe('第一段\n第二段')
  })

  it('应该过滤非 text 类型的 parts', () => {
    const parts = [
      { type: 'text', text: '文本' },
      { type: 'image', text: '图片描述' },
      { type: 'reasoning', text: '推理' },
    ]
    expect(extractTextFromParts(parts)).toBe('文本')
  })

  it('应该过滤 text 属性非字符串的 parts', () => {
    const parts = [
      { type: 'text', text: '文本' },
      { type: 'text' },
    ]
    expect(extractTextFromParts(parts)).toBe('文本')
  })

  it('应该对空数组返回空字符串', () => {
    expect(extractTextFromParts([])).toBe('')
  })

  it('应该 trim 首尾空白', () => {
    const parts = [{ type: 'text', text: '  内容  ' }]
    expect(extractTextFromParts(parts)).toBe('内容')
  })
})

describe('brainstorm-service - isRateLimitLikeError', () => {
  it('应该识别 rate limit 关键词', () => {
    expect(isRateLimitLikeError(new Error('Rate limit exceeded'))).toBe(true)
    expect(isRateLimitLikeError(new Error('429 Too Many Requests'))).toBe(true)
    expect(isRateLimitLikeError(new Error('quota exceeded'))).toBe(true)
    expect(isRateLimitLikeError(new Error('throttled'))).toBe(true)
    expect(isRateLimitLikeError(new Error('resource_exhausted'))).toBe(true)
    expect(isRateLimitLikeError(new Error('overloaded'))).toBe(true)
  })

  it('应该对非速率限制错误返回 false', () => {
    expect(isRateLimitLikeError(new Error('network error'))).toBe(false)
    expect(isRateLimitLikeError(new Error('timeout'))).toBe(false)
  })

  it('应该对非 Error 对象返回 false', () => {
    expect(isRateLimitLikeError('string error')).toBe(false)
    expect(isRateLimitLikeError(null)).toBe(false)
    expect(isRateLimitLikeError(undefined)).toBe(false)
  })

  it('应该大小写不敏感', () => {
    expect(isRateLimitLikeError(new Error('RATE LIMIT'))).toBe(true)
    expect(isRateLimitLikeError(new Error('Too many requests'))).toBe(true)
  })
})

describe('brainstorm-service - extractCoreViewpoint', () => {
  it('应该提取"## 核心观点"小节下的列表项', () => {
    const content = `## 核心观点\n- 第一条核心洞察\n- 第二条核心洞察\n- 第三条核心洞察\n\n## 关键机会\n- 机会1`
    const result = extractCoreViewpoint(content)
    expect(result).toBe('第一条核心洞察；第二条核心洞察；第三条核心洞察')
  })

  it('应该在小节只有 3 条以内列表时全部提取', () => {
    const content = `## 核心观点\n- 唯一一条`
    expect(extractCoreViewpoint(content)).toBe('唯一一条')
  })

  it('应该最多只提取 3 条列表项', () => {
    const content = `## 核心观点\n- A\n- B\n- C\n- D\n- E`
    expect(extractCoreViewpoint(content)).toBe('A；B；C')
  })

  it('应该支持数字编号列表', () => {
    const content = `## 核心观点\n1. 第一点\n2. 第二点\n3. 第三点`
    expect(extractCoreViewpoint(content)).toBe('第一点；第二点；第三点')
  })

  it('应该支持中文顿号编号列表', () => {
    const content = `## 核心观点\n1、第一点\n2、第二点`
    expect(extractCoreViewpoint(content)).toBe('第一点；第二点')
  })

  it('应该遇到下一个标题停止提取', () => {
    const content = `## 核心观点\n- 核心条目\n\n## 关键风险\n- 不该提取的风险`
    expect(extractCoreViewpoint(content)).toBe('核心条目')
  })

  it('应该支持不同级别的标题', () => {
    const content = `### 核心观点\n- 条目A\n- 条目B`
    expect(extractCoreViewpoint(content)).toBe('条目A；条目B')
  })

  it('应该跳过空行', () => {
    const content = `## 核心观点\n\n- 条目A\n\n- 条目B`
    expect(extractCoreViewpoint(content)).toBe('条目A；条目B')
  })

  it('无"核心观点"小节时应降级到首行提取', () => {
    const content = `## 其他标题\n\n这是第一段正文内容。`
    expect(extractCoreViewpoint(content)).toBe('这是第一段正文内容。')
  })

  it('无"核心观点"小节且首行为列表时应降级到句子边界切片', () => {
    const content = `这是一段没有标题的正文。第二句话。`
    expect(extractCoreViewpoint(content)).toBe('这是一段没有标题的正文。')
  })

  it('无"核心观点"小节且首行过长时应截断到 80 字符', () => {
    const longLine = 'A'.repeat(120)
    const content = longLine
    const result = extractCoreViewpoint(content)
    expect(result).toHaveLength(80)
    expect(result).toBe('A'.repeat(80))
  })

  it('"核心观点"小节为散文而非列表时应收集到 80 字符', () => {
    const content = `## 核心观点\n这是一段散文形式的观点描述，没有使用列表格式。`
    const result = extractCoreViewpoint(content)
    expect(result).toContain('散文形式的观点描述')
  })

  it('空字符串应返回空字符串', () => {
    expect(extractCoreViewpoint('')).toBe('')
  })

  it('只有空白的内容应返回空字符串', () => {
    expect(extractCoreViewpoint('   \n\n  \n')).toBe('')
  })

  it('小节标题含额外空白也应匹配', () => {
    const content = `##  核心观点  \n- 条目A`
    expect(extractCoreViewpoint(content)).toBe('条目A')
  })

  it('无列表项的散文小节在下一标题出现时应停止', () => {
    const content = `## 核心观点\n散文段落。\n## 下一节\n不该提取`
    expect(extractCoreViewpoint(content)).toBe('散文段落。')
  })
})

describe('brainstorm-service - buildPerspectivePrompt', () => {
  it('应该包含角色和关注焦点', () => {
    const prompt = buildPerspectivePrompt('批评者', '风险和失败模式', '关键风险')
    expect(prompt).toContain('批评者')
    expect(prompt).toContain('风险和失败模式')
  })

  it('应该包含结构化输出格式要求', () => {
    const prompt = buildPerspectivePrompt('乐观派', '机会', '关键机会')
    expect(prompt).toContain('## 核心观点')
    expect(prompt).toContain('## 关键机会')
    expect(prompt).toContain('## 反直觉洞察')
    expect(prompt).toContain('## 质疑的假设')
  })

  it('应该使用传入的 sectionLabel 作为第二级标题', () => {
    const prompt = buildPerspectivePrompt('系统思维者', '长期影响', '关键系统性影响')
    expect(prompt).toContain('## 关键系统性影响')
    expect(!prompt.includes('## 关键机会')).toBe(true)
  })
})

describe('brainstorm-service - buildSynthesisPrompt', () => {
  it('应该构建包含观点矩阵和详细输出的汇总 prompt', () => {
    const outputs: PerspectiveOutput[] = [
      {
        model: 'provider/m1',
        perspectiveId: 'critic',
        perspectiveName: '批评者',
        round: 1,
        content: '## 核心观点\n- 风险一\n- 风险二',
      },
      {
        model: 'provider/m2',
        perspectiveId: 'optimist',
        perspectiveName: '乐观派',
        round: 1,
        content: '## 核心观点\n- 机会一',
      },
    ]

    const prompt = buildSynthesisPrompt('测试主题', outputs)

    expect(prompt).toContain('讨论主题：测试主题')
    expect(prompt).toContain('## 观点矩阵')
    expect(prompt).toContain('批评者')
    expect(prompt).toContain('乐观派')
    expect(prompt).toContain('provider/m1')
    expect(prompt).toContain('provider/m2')
    expect(prompt).toContain('## 各视角详细输出')
    expect(prompt).toContain('风险一')
    expect(prompt).toContain('机会一')
  })

  it('应该处理 undefined 模型标识', () => {
    const outputs: PerspectiveOutput[] = [
      {
        model: undefined,
        perspectiveId: 'critic',
        perspectiveName: '批评者',
        round: 1,
        content: '## 核心观点\n- 条目',
      },
    ]

    const prompt = buildSynthesisPrompt('主题', outputs)

    expect(prompt).toContain('动态模型')
    expect(prompt).toContain('条目')
  })

  it('空内容视角应该在矩阵中显示为 -', () => {
    const outputs: PerspectiveOutput[] = [
      {
        model: 'p/m',
        perspectiveId: 'critic',
        perspectiveName: '批评者',
        round: 1,
        content: '',
      },
    ]

    const prompt = buildSynthesisPrompt('主题', outputs)

    const matrixRow = prompt.split('\n').find((l) => l.includes('批评者'))
    expect(matrixRow).toBeDefined()
    expect(matrixRow!.includes('-')).toBe(true)
  })

  it('多模型多视角应该生成正确的矩阵单元格', () => {
    const outputs: PerspectiveOutput[] = [
      {
        model: 'p/m1',
        perspectiveId: 'critic',
        perspectiveName: '批评者',
        round: 1,
        content: '## 核心观点\n- 风险A',
      },
      {
        model: 'p/m2',
        perspectiveId: 'critic',
        perspectiveName: '批评者',
        round: 1,
        content: '## 核心观点\n- 风险B',
      },
      {
        model: 'p/m1',
        perspectiveId: 'optimist',
        perspectiveName: '乐观派',
        round: 1,
        content: '## 核心观点\n- 机会A',
      },
    ]

    const prompt = buildSynthesisPrompt('主题', outputs)

    const lines = prompt.split('\n')
    const criticRow = lines.find((l) => l.startsWith('| 批评者'))
    const optimistRow = lines.find((l) => l.startsWith('| 乐观派'))

    expect(criticRow).toBeDefined()
    expect(criticRow).toContain('风险A')
    expect(criticRow).toContain('风险B')
    expect(optimistRow).toBeDefined()
    expect(optimistRow).toContain('机会A')
  })
})

describe('brainstorm-service - PERSPECTIVE_IDS 和 DEFAULT_PERSPECTIVE_IDS', () => {
  it('应该包含 5 个视角', () => {
    expect(PERSPECTIVE_IDS).toHaveLength(5)
    expect(PERSPECTIVE_IDS).toContain('optimist')
    expect(PERSPECTIVE_IDS).toContain('critic')
    expect(PERSPECTIVE_IDS).toContain('pragmatist')
    expect(PERSPECTIVE_IDS).toContain('innovator')
    expect(PERSPECTIVE_IDS).toContain('systems')
  })

  it('默认视角应该包含 3 个', () => {
    expect(DEFAULT_PERSPECTIVE_IDS).toHaveLength(3)
    expect([...DEFAULT_PERSPECTIVE_IDS]).toEqual(['optimist', 'critic', 'pragmatist'])
  })
})

describe('brainstorm-service - executeBrainstorm 集成流程', () => {
  function createMockClient(): {
    client: unknown
    sessions: Map<string, { created: boolean }>
  } {
    const sessions = new Map<string, { created: boolean }>()

    const client = {
      session: {
        create: vi.fn(async ({ body }: { body: { title: string } }) => {
          const id = `session-${sessions.size + 1}`
          sessions.set(id, { created: true })
          return { data: { id, title: body.title }, error: undefined }
        }),
        delete: vi.fn(async ({ path }: { path: { id: string } }) => {
      sessions.delete(path.id)
      return { data: undefined, error: undefined }
    }),
      },
    }

    return { client, sessions }
  }

  beforeEach(() => {
    globalSessionCounter = 0
    setBrainstormConfig(undefined)
    setModelScenarioRoutingContext(createModelScenarioRoutingContext(new Map()))
    vi.clearAllMocks()
    mockResolveBrainstormModels.mockReturnValue({ models: [], source: 'test' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该创建所有临时会话，返回汇总结果', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 核心观点\n- 乐观派洞察')
    sessionTexts.set('session-3', '## 核心观点\n- 实用主义者洞察')
    sessionTexts.set('session-4', '## 汇总结果')
    vi.mocked(promptAsyncAndWait).mockImplementation(async (_client, options) => {
      const text = sessionTexts.get(options.sessionID) ?? '默认响应'
      return { sessionID: options.sessionID, assistantText: text, toolCalls: [], raw: { parts: [{ type: 'text', text }] } }
    })

    mockGetGlobalClient.mockReturnValue({} as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '测试主题',
      perspectives: ['critic', 'optimist', 'pragmatist'],
      rounds: 1,
    })

    expect(result.perspectives).toHaveLength(3)
    expect(result.totalSessions).toBe(4)
    expect(result.failedCount).toBe(0)
    expect(result.synthesis).toBe('## 汇总结果')
    expect(result.modelsUsed).toEqual([undefined])
  })

  it('会话创建失败时所有视角应失败并抛出"所有视角讨论均失败"', async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ error: { name: 'Error', data: { message: '创建失败' } }, data: undefined })),
      },
    }
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic'], rounds: 1 }),
    ).rejects.toThrow('所有视角讨论均失败')
  })

  it('客户端未初始化时所有视角应失败并抛出"所有视角讨论均失败"', async () => {
    mockGetGlobalClient.mockReturnValue(null as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic'], rounds: 1 }),
    ).rejects.toThrow('所有视角讨论均失败')
  })

  it('无效视角 ID 应抛出异常', async () => {
    const { client } = createMockClient()
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['invalid'], rounds: 1 }),
    ).rejects.toThrow('未找到有效视角')
  })

  it('所有视角失败时应抛出异常', async () => {
    const client = {
      session: {
        create: vi.fn(async () => ({ error: { name: 'Error', data: { message: '总是失败' } }, data: undefined })),
      },
    }
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic', 'optimist'], rounds: 1 }),
    ).rejects.toThrow('所有视角讨论均失败')
  })

  it('临时会话不再删除，子会话保留供 TUI 查看', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 汇总')
    vi.mocked(promptAsyncAndWait).mockImplementation(async (_client, options) => {
      const text = sessionTexts.get(options.sessionID) ?? '默认'
      return { sessionID: options.sessionID, assistantText: text, toolCalls: [], raw: { parts: [{ type: 'text', text }] } }
    })

    const mockDelete = vi.fn(async () => ({ data: undefined, error: undefined }))
    mockGetGlobalClient.mockReturnValue({ session: { delete: mockDelete } } as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic'],
      rounds: 1,
    })

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('部分视角失败时仍应完成汇总', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-3', '## 汇总')
    vi.mocked(promptAsyncAndWait).mockImplementation(async (_client, options) => {
      const text = sessionTexts.get(options.sessionID) ?? '默认'
      return { sessionID: options.sessionID, assistantText: text, toolCalls: [], raw: { parts: [{ type: 'text', text }] } }
    })

    let createCallCount = 0
    vi.mocked(createSubSession).mockImplementation(async (_client: unknown, options: { title?: string; parentID?: string }) => {
      createCallCount++
      if (createCallCount === 2) {
        throw new Error('创建临时会话失败 - 第二个会话失败')
      }
      return { id: `session-${createCallCount}`, title: options.title ?? '' }
    })
    mockGetGlobalClient.mockReturnValue({} as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic', 'optimist'],
      rounds: 1,
    })

    expect(result.failedCount).toBe(1)
    expect(result.perspectives).toHaveLength(2)
    expect(result.perspectives[0].error).toBeUndefined()
    expect(result.perspectives[1].error).toContain('创建临时会话失败')
    expect(result.synthesis).toBe('## 汇总')
  })

  it('应该正确传递 onProgress 进度回调', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 汇总')
    vi.mocked(promptAsyncAndWait).mockImplementation(async (_client, options) => {
      const text = sessionTexts.get(options.sessionID) ?? '默认响应'
      return { sessionID: options.sessionID, assistantText: text, toolCalls: [], raw: { parts: [{ type: 'text', text }] } }
    })

    const { client } = createMockClient()
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const progressEvents: Array<{ phase: string; status: string; round: number }> = []

    await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic'],
      rounds: 1,
      onProgress: (p) => {
        progressEvents.push({ phase: p.phase, status: p.status, round: p.round })
      },
    })

    const statuses = progressEvents.map((p) => p.status)
    expect(statuses).toContain('running')
    expect(statuses).toContain('success')
  })
})

describe('brainstorm-service - 速率限制降级', () => {
  beforeEach(() => {
    globalSessionCounter = 0
    setBrainstormConfig(undefined)
    setModelScenarioRoutingContext(createModelScenarioRoutingContext(new Map()))
    vi.clearAllMocks()
    mockResolveBrainstormModels.mockReturnValue({ models: [], source: 'test' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('遇到速率限制错误时应重试并最终成功', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 洞察')
    sessionTexts.set('session-2', '## 汇总')
    let promptCallCount = 0
    vi.mocked(promptAsyncAndWait).mockImplementation(async (_client, options) => {
      promptCallCount++
      if (promptCallCount === 1) {
        throw new Error('Rate limit exceeded')
      }
      const text = sessionTexts.get(options.sessionID) ?? '默认'
      return { sessionID: options.sessionID, assistantText: text, toolCalls: [], raw: { parts: [{ type: 'text', text }] } }
    })

    mockGetGlobalClient.mockReturnValue({} as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic'],
      rounds: 1,
    })

    expect(result.failedCount).toBe(0)
    expect(result.synthesis).toBeDefined()
  })
})
