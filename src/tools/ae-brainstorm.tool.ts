import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { executeBrainstorm, DEFAULT_PERSPECTIVE_IDS, PERSPECTIVE_IDS } from '../services/brainstorm-service.js'

export const aeBrainstormTool = tool({
  description: [
    '多视角头脑风暴：对指定主题从多个认知视角进行结构化讨论，自动汇总跨视角分歧与共识。',
    '',
    '适用场景：',
    '- 用户说"让我们头脑风暴一下"、"帮我想想 X"、"有哪些选项"、"还有什么可能性"',
    '- 任何需要多角度发散讨论的场景',
    '',
    '功能说明：',
    '- 根据 ae.jsonc brainstorm 配置（字符串数组）选择讨论模型，未配置时 fallback 到 modelScenarios.deep',
    '- 配置了多个模型时轮询分配：每个视角分配一个模型，会话数 = 视角数 × 轮次',
    '- 未配置模型时全部视角由 opencode 动态路由，会话数 = 视角数 × 轮次',
    '- 阶段 1：纯视角生成——每个视角创建临时会话并行讨论，用完即删',
    '- 阶段 2：跨视角碰撞汇总——构建观点汇总表，识别分歧、共识、碰撞洞见和盲区',
    '- 执行期间实时输出进度（当前/总数、模型、视角、状态）',
    '',
    '视角选择建议：',
    '- 默认 optimist/critic/pragmatist（3 个）',
    '- 技术话题可加 innovator',
    '- 系统话题可加 systems',
    '',
    '注意事项：',
    '- 视角数最多 5，轮次最多 2',
    '- 同一轮次内所有视角并行执行，遇到速率限制自动降级并发数并重试；轮次间串行，单条失败不影响其余',
    '- 必须通过本工具执行，不要自行派发子代理或模拟讨论',
    '',
    '不适用场景：',
    '- 不产出持久产物（需求/设计文档转交 ae:prd / ae:design）',
    '- 不做需求澄清或路由决策',
    '- 不适合需要单一权威答案的事实性问题',
  ].join('\n'),
  args: {
    topic: z
      .string()
      .min(1)
      .describe('讨论主题，需要头脑风暴的问题或想法'),
    perspectives: z
      .enum(PERSPECTIVE_IDS as [string, ...string[]])
      .array()
      .min(1)
      .max(5)
      .optional()
      .describe('视角 ID 列表，默认 optimist/critic/pragmatist；可选 innovator/systems'),
    rounds: z
      .number()
      .int()
      .min(1)
      .max(2)
      .optional()
      .describe('讨论轮次，默认 1；2 表示深化轮（各视角看到前轮摘要后补充）'),
  },
  execute: async (args, ctx) => {
    const perspectives = args.perspectives ?? [...DEFAULT_PERSPECTIVE_IDS]
    const rounds = args.rounds ?? 1

    ctx.metadata({
      title: `Brainstorm: ${args.topic.slice(0, 30)}`,
      metadata: { perspectives, rounds },
    })

    try {
      const result = await executeBrainstorm({
        topic: args.topic,
        perspectives,
        rounds,
        onProgress: (p) => {
          const modelLabel = p.model ?? '动态模型'
          if (p.phase === 'synthesis') {
            ctx.metadata({
              title: `汇总中 (${p.current}/${p.total})`,
              metadata: { phase: 'synthesis', model: modelLabel },
            })
          } else {
            ctx.metadata({
              title: `[${p.current}/${p.total}] R${p.round} ${p.perspectiveName} · ${modelLabel} · ${p.status}`,
              metadata: {
                phase: p.phase,
                round: p.round,
                model: modelLabel,
                perspective: p.perspectiveName,
                status: p.status,
                current: p.current,
                total: p.total,
              },
            })
          }
        },
      })

      let output = `# 头脑风暴：${args.topic}\n\n`
      output += `**模型**：${result.modelsUsed.map((m) => m ?? '动态模型').join(', ')}\n`
      output += `**来源**：${result.modelSource}\n`
      output += `**视角**：${result.perspectiveNames.join(', ')}\n`
      output += `**会话**：${result.totalSessions} 次（${result.failedCount} 失败）\n`
      if (result.failedCount > 0) {
        output += `\n> ⚠ ${result.failedCount} 个视角讨论失败，结果可能不完整\n`
      }
      output += `\n---\n\n${result.synthesis}\n`

      return {
        output,
        metadata: {
          tool: TOOL.AE_BRAINSTORM,
          modelsUsed: result.modelsUsed,
          modelSource: result.modelSource,
          perspectiveCount: result.perspectiveNames.length,
          failedCount: result.failedCount,
          totalSessions: result.totalSessions,
        },
      }
    } catch (error) {
      return `头脑风暴执行失败：${error instanceof Error ? error.message : String(error)}`
    }
  },
})
