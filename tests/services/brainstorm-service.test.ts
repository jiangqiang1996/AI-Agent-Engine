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

let globalSessionCounter = 0

import { getGlobalClient } from '../../src/services/client-holder.js'
import { resolveBrainstormModels } from '../../src/services/brainstorm-config-service.js'

const mockGetGlobalClient = vi.mocked(getGlobalClient)
const mockResolveBrainstormModels = vi.mocked(resolveBrainstormModels)

function createMockClient(sessionTexts: Map<string, string>, options?: {
  createErrorOnCall?: number
  promptErrorOnCall?: number
  alwaysPromptError?: boolean
  promptErrorMessage?: string
}) {
  let createCallCount = 0
  let promptCallCount = 0
  const deletedSessions: string[] = []

  const client = {
    session: {
      create: vi.fn(async () => {
        createCallCount++
        if (options?.createErrorOnCall && createCallCount === options.createErrorOnCall) {
          return { data: undefined, error: { data: { message: '创建临时会话失败' }, name: 'Error' } }
        }
        const id = `session-${++globalSessionCounter}`
        return { data: { id, title: `session-${id}` }, error: undefined }
      }),
      prompt: vi.fn(async (args: { path: { id: string } }) => {
        promptCallCount++
        if (options?.alwaysPromptError || (options?.promptErrorOnCall && promptCallCount === options.promptErrorOnCall)) {
          const msg = options?.promptErrorMessage ?? '模型调用失败'
          return { data: undefined, error: { data: { message: msg }, name: 'Error' } }
        }
        const text = sessionTexts.get(args.path.id) ?? '默认响应'
        return { data: { parts: [{ type: 'text', text }] }, error: undefined }
      }),
      delete: vi.fn(async (args: { path: { id: string } }) => {
        deletedSessions.push(args.path.id)
        return { data: undefined, error: undefined }
      }),
    },
  }
  return { client, deletedSessions, getCreateCallCount: () => createCallCount, getPromptCallCount: () => promptCallCount }
}

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
  it('应该构建包含观点汇总表和详细输出的汇总 prompt', () => {
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
    expect(prompt).toContain('## 观点汇总表')
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

  it('多视角应该生成包含所有视角的汇总表', () => {
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
        perspectiveId: 'optimist',
        perspectiveName: '乐观派',
        round: 1,
        content: '## 核心观点\n- 机会A',
      },
    ]

    const prompt = buildSynthesisPrompt('主题', outputs)

    const lines = prompt.split('\n')
    const criticRow = lines.find((l) => l.includes('批评者'))
    const optimistRow = lines.find((l) => l.includes('乐观派'))

    expect(criticRow).toBeDefined()
    expect(criticRow).toContain('风险A')
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
    const { client } = createMockClient(sessionTexts)
    mockGetGlobalClient.mockReturnValue(client as never)

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
    const { client } = createMockClient(new Map(), { createErrorOnCall: 1 })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic'], rounds: 1 }),
    ).rejects.toThrow(/所有视角讨论均失败/)
  })

  it('客户端未初始化时所有视角应失败并抛出"所有视角讨论均失败"', async () => {
    mockGetGlobalClient.mockReturnValue(null as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic'], rounds: 1 }),
    ).rejects.toThrow(/所有视角讨论均失败/)
  })

  it('无效视角 ID 应抛出异常', async () => {
    const { client } = createMockClient(new Map())
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['invalid'], rounds: 1 }),
    ).rejects.toThrow('未找到有效视角')
  })

  it('所有视角失败时应抛出异常', async () => {
    const { client } = createMockClient(new Map(), { alwaysPromptError: true, promptErrorMessage: '总是失败' })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic', 'optimist'], rounds: 1 }),
    ).rejects.toThrow(/所有视角讨论均失败/)
  })

  it('临时会话用完后应删除', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 汇总')
    const { client, deletedSessions } = createMockClient(sessionTexts)
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic'],
      rounds: 1,
    })

    expect(result.failedCount).toBe(0)
    expect(deletedSessions).toHaveLength(2)
  })

  it('prompt 失败时仍应通过 finally 删除临时会话', async () => {
    const { client, deletedSessions } = createMockClient(new Map(), { promptErrorOnCall: 1, promptErrorMessage: '模型调用超时' })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    await expect(
      executeBrainstorm({ topic: '主题', perspectives: ['critic'], rounds: 1 }),
    ).rejects.toThrow(/所有视角讨论均失败/)

    expect(deletedSessions).toHaveLength(1)
  })

  it('部分视角失败时仍应完成汇总', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-3', '## 汇总')
    const { client } = createMockClient(sessionTexts, { promptErrorOnCall: 2, promptErrorMessage: '第二个会话失败' })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic', 'optimist'],
      rounds: 1,
    })

    expect(result.failedCount).toBe(1)
    expect(result.perspectives).toHaveLength(2)
    expect(result.perspectives[0].error).toBeUndefined()
    expect(result.perspectives[1].error).toContain('模型调用失败')
    expect(result.synthesis).toBe('## 汇总')
  })

  it('应该正确传递 onProgress 进度回调', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 汇总')
    const { client } = createMockClient(sessionTexts)
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

    let createCallCount = 0
    const client = {
      session: {
        create: vi.fn(async () => {
          createCallCount++
          const id = `session-${++globalSessionCounter}`
          return { data: { id, title: `session-${id}` }, error: undefined }
        }),
        prompt: vi.fn(async (args: { path: { id: string } }) => {
          promptCallCount++
          if (promptCallCount === 1) {
            return { data: undefined, error: { data: { message: 'Rate limit exceeded' }, name: 'Error' } }
          }
          const text = sessionTexts.get(args.path.id) ?? '默认'
          return { data: { parts: [{ type: 'text', text }] }, error: undefined }
        }),
        delete: vi.fn(async () => ({ data: undefined, error: undefined })),
      },
    }
    mockGetGlobalClient.mockReturnValue(client as never)

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

describe('brainstorm-service - 轮询分配模型', () => {
  beforeEach(() => {
    globalSessionCounter = 0
    setBrainstormConfig(undefined)
    setModelScenarioRoutingContext(createModelScenarioRoutingContext(new Map()))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('配置多模型时应轮询分配，每个视角一个模型', async () => {
    mockResolveBrainstormModels.mockReturnValue({ models: ['provider/m1', 'provider/m2'], source: 'test' })

    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 批评者洞察')
    sessionTexts.set('session-2', '## 核心观点\n- 乐观派洞察')
    sessionTexts.set('session-3', '## 核心观点\n- 实用主义者洞察')
    sessionTexts.set('session-4', '## 汇总')

    const promptCalls: Array<{ model?: { providerID: string; modelID: string } }> = []
    const { client } = createMockClient(sessionTexts)
    client.session.prompt.mockImplementation(async (args: { path: { id: string }; body?: { model?: { providerID: string; modelID: string } } }) => {
      if (args.body?.model) {
        promptCalls.push({ model: args.body.model })
      }
      const text = sessionTexts.get(args.path.id) ?? '默认'
      return { data: { parts: [{ type: 'text', text }] }, error: undefined }
    })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic', 'optimist', 'pragmatist'],
      rounds: 1,
    })

    expect(result.totalSessions).toBe(4)
    expect(promptCalls).toHaveLength(3)
    expect(promptCalls[0].model).toEqual({ providerID: 'provider', modelID: 'm1' })
    expect(promptCalls[1].model).toEqual({ providerID: 'provider', modelID: 'm2' })
    expect(promptCalls[2].model).toEqual({ providerID: 'provider', modelID: 'm1' })
    expect(result.modelsUsed).toEqual(['provider/m1', 'provider/m2'])
  })

  it('配置模型数大于视角数时 modelsUsed 应只含实际使用的模型', async () => {
    mockResolveBrainstormModels.mockReturnValue({ models: ['p/m1', 'p/m2', 'p/m3'], source: 'test' })

    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 洞察1')
    sessionTexts.set('session-2', '## 核心观点\n- 洞察2')
    sessionTexts.set('session-3', '## 汇总')

    const { client } = createMockClient(sessionTexts)
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic', 'optimist'],
      rounds: 1,
    })

    expect(result.totalSessions).toBe(3)
    expect(result.modelsUsed).toEqual(['p/m1', 'p/m2'])
  })

  it('深化轮时模型应向后偏移一位，避免同一视角两轮使用同一模型', async () => {
    mockResolveBrainstormModels.mockReturnValue({ models: ['p/m1', 'p/m2', 'p/m3'], source: 'test' })

    const sessionTexts = new Map<string, string>()
    for (let i = 1; i <= 5; i++) {
      sessionTexts.set(`session-${i}`, `## 核心观点\n- 洞察${i}`)
    }
    sessionTexts.set('session-6', '## 汇总')

    const promptCalls: Array<{ model?: { providerID: string; modelID: string } }> = []
    const { client } = createMockClient(sessionTexts)
    client.session.prompt.mockImplementation(async (args: { path: { id: string }; body?: { model?: { providerID: string; modelID: string } } }) => {
      if (args.body?.model) {
        promptCalls.push({ model: args.body.model })
      }
      const text = sessionTexts.get(args.path.id) ?? '默认'
      return { data: { parts: [{ type: 'text', text }] }, error: undefined }
    })
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic', 'optimist'],
      rounds: 2,
    })

    expect(result.totalSessions).toBe(5)
    expect(promptCalls).toHaveLength(4)

    // R1: critic→m1, optimist→m2
    expect(promptCalls[0].model).toEqual({ providerID: 'p', modelID: 'm1' })
    expect(promptCalls[1].model).toEqual({ providerID: 'p', modelID: 'm2' })
    // R2: critic→m2, optimist→m3（偏移1位）
    expect(promptCalls[2].model).toEqual({ providerID: 'p', modelID: 'm2' })
    expect(promptCalls[3].model).toEqual({ providerID: 'p', modelID: 'm3' })
  })
})

describe('brainstorm-service - session.delete 重试', () => {
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

  it('delete 首次失败时应延迟重试一次', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 洞察')
    sessionTexts.set('session-2', '## 汇总')

    let deleteCallCount = 0
    const client = {
      session: {
        create: vi.fn(async () => {
          const id = `session-${++globalSessionCounter}`
          return { data: { id, title: `session-${id}` }, error: undefined }
        }),
        prompt: vi.fn(async (args: { path: { id: string } }) => {
          const text = sessionTexts.get(args.path.id) ?? '默认'
          return { data: { parts: [{ type: 'text', text }] }, error: undefined }
        }),
        delete: vi.fn(async () => {
          deleteCallCount++
          if (deleteCallCount === 1) {
            throw new Error('429 rate limit')
          }
          return { data: undefined, error: undefined }
        }),
      },
    }
    mockGetGlobalClient.mockReturnValue(client as never)

    const { executeBrainstorm } = await import('../../src/services/brainstorm-service.js')

    const result = await executeBrainstorm({
      topic: '主题',
      perspectives: ['critic'],
      rounds: 1,
    })

    expect(result.failedCount).toBe(0)
    expect(deleteCallCount).toBeGreaterThanOrEqual(2)
  })

  it('delete 两次都失败时不应阻塞主流程', async () => {
    const sessionTexts = new Map<string, string>()
    sessionTexts.set('session-1', '## 核心观点\n- 洞察')
    sessionTexts.set('session-2', '## 汇总')

    const client = {
      session: {
        create: vi.fn(async () => {
          const id = `session-${++globalSessionCounter}`
          return { data: { id, title: `session-${id}` }, error: undefined }
        }),
        prompt: vi.fn(async (args: { path: { id: string } }) => {
          const text = sessionTexts.get(args.path.id) ?? '默认'
          return { data: { parts: [{ type: 'text', text }] }, error: undefined }
        }),
        delete: vi.fn(async () => {
          throw new Error('429 rate limit')
        }),
      },
    }
    mockGetGlobalClient.mockReturnValue(client as never)

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
