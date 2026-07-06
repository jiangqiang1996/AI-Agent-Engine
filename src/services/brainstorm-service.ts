import { getGlobalClient } from './client-holder.js'
import { resolveBrainstormModels } from './brainstorm-config-service.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { MODEL_SCENARIO } from '../schemas/model-scenario-schema.js'

function parseModelReference(model: string | undefined): { providerID: string; modelID: string } | undefined {
  if (!model) return undefined
  const slashIndex = model.indexOf('/')
  if (slashIndex <= 0) return undefined
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  }
}

function extractTextFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim()
}

interface PerspectiveDef {
  id: string
  name: string
  role: string
  focus: string
  systemPrompt: string
}

function buildPerspectivePrompt(role: string, focus: string, sectionLabel: string): string {
  return `你是一个${role}讨论者。你对任何话题都关注${focus}。
你的任务是从${role}的角度对给定主题进行发散讨论。
输出必须使用以下结构化格式：

## 核心观点
列出 3-5 条最核心的洞察。

## ${sectionLabel}
列出从该角度看到的关键要点。

## 反直觉洞察
提出 1 个从该角度得出的反直觉洞察。

## 质疑的假设
指出 1 个你最想挑战的假设。

直接输出 Markdown，不要包装在代码块中。`
}

const PERSPECTIVES: PerspectiveDef[] = [
  { id: 'optimist', name: '乐观派', role: '乐观派', focus: '最好的可能结果、最大价值和机会窗口', systemPrompt: buildPerspectivePrompt('乐观派', '最好的可能结果、最大价值和机会窗口', '关键机会') },
  { id: 'critic', name: '批评者', role: '批评者', focus: '风险、失败模式、隐藏假设和最坏情况', systemPrompt: buildPerspectivePrompt('批评者', '风险、失败模式、隐藏假设和最坏情况', '关键风险') },
  { id: 'pragmatist', name: '实用主义者', role: '实用主义者', focus: '可行性、成本、时间约束和现有基础', systemPrompt: buildPerspectivePrompt('实用主义者', '可行性、成本、时间约束和现有基础', '关键约束') },
  { id: 'innovator', name: '创新者', role: '创新者', focus: '非常规角度、类比、约束移除和横向想法', systemPrompt: buildPerspectivePrompt('创新者', '非常规角度、类比、约束移除和横向想法', '关键创新方向') },
  { id: 'systems', name: '系统思维', role: '系统思维者', focus: '长期影响、二阶效应、与其他系统的交互和持久能力', systemPrompt: buildPerspectivePrompt('系统思维者', '长期影响、二阶效应、与其他系统的交互和持久能力', '关键系统性影响') },
]

export const PERSPECTIVE_IDS = PERSPECTIVES.map((p) => p.id) as readonly string[]
export const DEFAULT_PERSPECTIVE_IDS = ['optimist', 'critic', 'pragmatist'] as const

const SYNTHESIS_SYSTEM_PROMPT = `你是一个头脑风暴汇总分析师。你收到了多个模型从多个视角对同一主题的结构化讨论输出。

你的任务是：
1. 构建观点矩阵——每个视角下，不同模型说了什么，用表格呈现
2. 识别跨模型真分歧——不同模型对同一视角的不同判断，标注分歧性质（事实分歧 vs 价值分歧 vs 假设分歧）
3. 识别跨视角共识——无论哪个模型、哪个视角，都反复出现的观点
4. 发现碰撞洞见——某视角质疑的假设恰好是另一视角的突破点
5. 标注盲区——所有模型和视角都未充分讨论的方面
6. 给出简短行动建议——基于以上分析，最值得深入探索的 1-2 个方向

输出格式：Markdown，结构化，每个维度用标题+列表，观点矩阵用表格。`

/** 进度回调，供工具层通过 ctx.metadata 实时反馈 */
export interface BrainstormProgress {
  phase: 'perspective' | 'synthesis'
  current: number
  total: number
  round: number
  model: string | undefined
  perspectiveName: string | undefined
  status: 'running' | 'success' | 'failed'
}

export interface PerspectiveOutput {
  /** 实际使用的模型标识；undefined 表示未指定，由 opencode 动态路由 */
  model: string | undefined
  perspectiveId: string
  perspectiveName: string
  round: number
  content: string
  error?: string
}

export interface BrainstormResult {
  perspectives: PerspectiveOutput[]
  synthesis: string
  modelsUsed: (string | undefined)[]
  modelSource: string
  perspectiveNames: string[]
  totalSessions: number
  failedCount: number
}

export interface BrainstormOptions {
  topic: string
  perspectives?: string[]
  rounds?: number
  onProgress?: (progress: BrainstormProgress) => void
}

function modelDisplayLabel(model: string | undefined): string {
  return model ?? 'opencode 动态模型'
}

async function runTemporarySession(
  title: string,
  userPrompt: string,
  systemPrompt: string,
  modelRef: { providerID: string; modelID: string } | undefined,
): Promise<string> {
  const client = getGlobalClient()
  if (!client) {
    throw new Error('opencode 客户端未初始化')
  }

  let sessionId: string | undefined
  try {
    const createRes = await client.session.create({ body: { title } })
    if (createRes.error || !createRes.data?.id) {
      throw new Error(`[${title}] 创建临时会话失败 - ${createRes.error?.data?.message ?? '未知错误'}`)
    }
    sessionId = createRes.data.id

    const promptBody: Record<string, unknown> = {
      parts: [{ type: 'text', text: userPrompt }],
      system: systemPrompt,
      tools: {},
    }
    if (modelRef) {
      promptBody.model = modelRef
    }

    const promptRes = await client.session.prompt({
      path: { id: sessionId },
      body: promptBody as Parameters<typeof client.session.prompt>[0]['body'],
    })

    if (promptRes.error) {
      throw new Error(`[${title}] 模型调用失败 - ${promptRes.error.data?.message ?? promptRes.error.name ?? '未知错误'}`)
    }

    return extractTextFromParts(promptRes.data?.parts ?? [])
  } finally {
    if (sessionId) {
      try { await client.session.delete({ path: { id: sessionId } }) } catch { /* 临时会话清理失败不影响主流程 */ }
    }
  }
}

function buildSynthesisPrompt(topic: string, outputs: PerspectiveOutput[]): string {
  const models = [...new Set(outputs.map((o) => modelDisplayLabel(o.model)))]
  const uniquePerspectives = [...new Set(outputs.map((o) => o.perspectiveName))]

  let viewMatrix = `## 观点矩阵\n\n| 视角 | ${models.join(' | ')} |\n|------|${models.map(() => '---').join('|')}|\n`

  for (const pName of uniquePerspectives) {
    const cells = models.map((m) => {
      const matching = outputs.filter((o) => o.perspectiveName === pName && modelDisplayLabel(o.model) === m)
      if (matching.length === 0) return '-'
      const content = matching[0].content
      if (!content) return '-'
      const lines = content.split('\n').filter((l) => l.trim())
      const coreSection = lines.filter((l) => /^[-*•]/.test(l) || /^\d+\./.test(l))
      return coreSection.slice(0, 3).join('；') || content.slice(0, 80)
    })
    viewMatrix += `| ${pName} | ${cells.join(' | ')} |\n`
  }

  let detailSections = `\n\n## 各视角详细输出\n\n`
  for (const output of outputs) {
    detailSections += `### ${output.perspectiveName}（${modelDisplayLabel(output.model)}）\n\n${output.content}\n\n`
  }

  return `讨论主题：${topic}\n\n${viewMatrix}\n${detailSections}\n\n请根据以上多模型多视角讨论结果，进行汇总分析。`
}

export async function executeBrainstorm(options: BrainstormOptions): Promise<BrainstormResult> {
  const { topic, onProgress } = options
  const selectedPerspectiveIds: string[] = options.perspectives ?? [...DEFAULT_PERSPECTIVE_IDS]
  const rounds = Math.min(Math.max(options.rounds ?? 1, 1), 2)

  const resolved = resolveBrainstormModels()

  const selectedPerspectives = PERSPECTIVES.filter((p) => selectedPerspectiveIds.includes(p.id as string))
  if (selectedPerspectives.length === 0) {
    throw new Error(`未找到有效视角。可选视角：${PERSPECTIVE_IDS.join(', ')}`)
  }

  // models 为 undefined 表示不指定模型，由 opencode 动态路由
  const effectiveModels: (string | undefined)[] = resolved.models.length > 0 ? resolved.models : [undefined]
  const totalPerspectiveSessions = selectedPerspectives.length * effectiveModels.length * rounds
  const totalSessions = totalPerspectiveSessions + 1 // +1 synthesis
  const perspectiveOutputs: PerspectiveOutput[] = []
  let sessionIndex = 0

  for (let round = 1; round <= rounds; round++) {
    let previousSummary: string | undefined
    if (round > 1 && perspectiveOutputs.length > 0) {
      const lastBatchStart = (round - 2) * selectedPerspectives.length * effectiveModels.length
      const lastBatchEnd = (round - 1) * selectedPerspectives.length * effectiveModels.length
      previousSummary = perspectiveOutputs
        .slice(lastBatchStart, lastBatchEnd)
        .filter((o) => !o.error)
        .map((o) => `**${o.perspectiveName}（${modelDisplayLabel(o.model)}）**：${o.content.slice(0, 120)}…`)
        .join('\n')
    }

    for (const model of effectiveModels) {
      const modelRef = parseModelReference(model)
      for (const perspective of selectedPerspectives) {
        sessionIndex++
        onProgress?.({
          phase: 'perspective',
          current: sessionIndex,
          total: totalSessions,
          round,
          model,
          perspectiveName: perspective.name,
          status: 'running',
        })

        let userPrompt = `讨论主题：${topic}\n\n请从${perspective.role}的角度出发进行讨论。`
        if (previousSummary) {
          userPrompt += `\n\n以下是前一轮各视角讨论的摘要，请在此基础上补充、深化或提出新角度：\n\n${previousSummary}`
        }

        try {
          const content = await runTemporarySession(
            `brainstorm-r${round}-${perspective.id}`,
            userPrompt,
            perspective.systemPrompt,
            modelRef,
          )
          perspectiveOutputs.push({
            model,
            perspectiveId: perspective.id,
            perspectiveName: perspective.name,
            round,
            content,
          })
          onProgress?.({
            phase: 'perspective',
            current: sessionIndex,
            total: totalSessions,
            round,
            model,
            perspectiveName: perspective.name,
            status: 'success',
          })
        } catch (error) {
          perspectiveOutputs.push({
            model,
            perspectiveId: perspective.id,
            perspectiveName: perspective.name,
            round,
            content: '',
            error: error instanceof Error ? error.message : String(error),
          })
          onProgress?.({
            phase: 'perspective',
            current: sessionIndex,
            total: totalSessions,
            round,
            model,
            perspectiveName: perspective.name,
            status: 'failed',
          })
        }
      }
    }
  }

  const successfulOutputs = perspectiveOutputs.filter((o) => !o.error)
  if (successfulOutputs.length === 0) {
    throw new Error('所有视角讨论均失败，无法进行汇总')
  }

  const synthesisModel = getModelByScenario(
    getModelScenarioRoutingContext() ?? undefined,
    MODEL_SCENARIO.DEEP,
  )

  onProgress?.({
    phase: 'synthesis',
    current: totalPerspectiveSessions + 1,
    total: totalSessions,
    round: rounds,
    model: synthesisModel,
    perspectiveName: undefined,
    status: 'running',
  })

  const synthesisModelRef = parseModelReference(synthesisModel)
  const synthesisPrompt = buildSynthesisPrompt(topic, successfulOutputs)

  let synthesis: string
  try {
    synthesis = await runTemporarySession(
      'brainstorm-synthesis',
      synthesisPrompt,
      SYNTHESIS_SYSTEM_PROMPT,
      synthesisModelRef,
    )
  } catch (error) {
    onProgress?.({
      phase: 'synthesis',
      current: totalPerspectiveSessions + 1,
      total: totalSessions,
      round: rounds,
      model: synthesisModel,
      perspectiveName: undefined,
      status: 'failed',
    })
    throw error
  }

  onProgress?.({
    phase: 'synthesis',
    current: totalPerspectiveSessions + 1,
    total: totalSessions,
    round: rounds,
    model: synthesisModel,
    perspectiveName: undefined,
    status: 'success',
  })

  const failedCount = perspectiveOutputs.filter((o) => o.error).length

  return {
    perspectives: perspectiveOutputs,
    synthesis,
    modelsUsed: effectiveModels,
    modelSource: resolved.source,
    perspectiveNames: selectedPerspectives.map((p) => p.name),
    totalSessions,
    failedCount,
  }
}
