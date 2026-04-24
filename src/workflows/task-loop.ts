import { z } from 'zod'
import { defineWorkflow, fn, delegate, ask, when, loop } from '../services/orchestrator/builder.js'
import {
  TaskLoopInputSchema,
  ScanResultSchema,
  QuestionsAnalysisSchema,
  CollectedAnswersSchema,
  ConditionsSchema,
  VerificationResultSchema,
} from './task-loop.types.js'
import type { TaskLoopInput, TaskLoopState } from './task-loop.types.js'
import type { Ctx } from '../services/orchestrator/types.js'
import { transferResult } from './utils.js'
import * as P from './prompts/task-loop-prompts.js'

const KNOWN_SKILLS = [
  'ae:work', 'ae:ideate', 'ae:brainstorm', 'ae:plan',
  'ae:review', 'ae:frontend-design', 'ae:test-browser', 'ae:sql',
]

const MAX_ROUNDS = 30
const BOTTLENECK_THRESHOLD = 3

function parseExecutionSkill(goal: string): { skill: string | null; cleanGoal: string } {
  const firstToken = goal.trim().split(/\s+/)[0] ?? ''
  if (KNOWN_SKILLS.includes(firstToken)) {
    return { skill: firstToken, cleanGoal: goal.trim().slice(firstToken.length).trim() }
  }
  return { skill: null, cleanGoal: goal.trim() }
}

export const taskLoopWorkflow = defineWorkflow<TaskLoopInput, TaskLoopState>({
  name: 'ae-task-loop',
  input: TaskLoopInputSchema,
  init: (input): TaskLoopState => {
    const { skill, cleanGoal } = parseExecutionSkill(input.goal)
    return {
      goal: cleanGoal,
      executionSkill: skill,
      hasImplementation: false,
      implementationSummary: '',
      questionsAndAnswers: [],
      successConditions: [],
      currentRound: 0,
      maxRounds: MAX_ROUNDS,
      executionMode: null,
      problemList: [],
      lastVerificationResults: [],
      previousPassedCount: 0,
      consecutiveNoProgress: 0,
      exitReason: null,
    }
  },
  flow: [
    fn('init-state', async (ctx) => {
      if (!ctx.state.goal) {
        ctx.report({ title: '错误', detail: '目标为空，无法执行' })
        return { exitReason: 'limit' as const }
      }
      ctx.report({ title: '初始化', detail: ctx.state.goal })
      return undefined
    }),

    delegate({
      name: 'scan-project',
      title: () => '扫描项目状态',
      message: (ctx) => P.scanProjectMessage(ctx),
      output: ScanResultSchema,
    }),

    fn('apply-scan-result', async (ctx) => {
      return transferResult(ctx, 'scan-project', ScanResultSchema, (r) => ({
        hasImplementation: r.hasImplementation,
        implementationSummary: r.summary,
      }))
    }),

    delegate({
      name: 'analyze-questions',
      title: () => '预分析提问',
      message: (ctx) => P.analyzeQuestionsMessage(ctx),
      output: QuestionsAnalysisSchema,
    }),

    fn('prepare-questions', async (ctx) => {
      return transferResult(ctx, 'analyze-questions', QuestionsAnalysisSchema, (r) => {
        const defaulted = r.questions
          .filter((q) => q.defaultValue)
          .map((q) => ({ id: q.id, question: q.question, answer: q.defaultValue! }))
        const nonDefaulted = r.questions
          .filter((q) => !q.defaultValue)
          .map((q) => ({ id: q.id, question: q.question, answer: '' }))
        return { questionsAndAnswers: [...defaulted, ...nonDefaulted] }
      })
    }),

    delegate({
      name: 'collect-answers',
      title: () => '收集用户回答',
      message: (ctx) => P.collectAnswersMessage(ctx),
      output: CollectedAnswersSchema,
    }),

    fn('merge-answers', async (ctx) => {
      return transferResult(ctx, 'collect-answers', CollectedAnswersSchema, (r) => {
        const merged = ctx.state.questionsAndAnswers.map((qa) => {
          const userAnswer = r.answers.find((a) => a.id === qa.id)
          return userAnswer ? { ...qa, answer: userAnswer.answer } : qa
        })
        return { questionsAndAnswers: merged }
      })
    }),

    delegate({
      name: 'derive-conditions',
      title: () => '推导成功条件',
      message: (ctx) => P.deriveConditionsMessage(ctx),
      output: ConditionsSchema,
    }),

    fn('prepare-checklist', async (ctx) => {
      return transferResult(ctx, 'derive-conditions', ConditionsSchema, (r) => ({
        successConditions: r.conditions,
      }))
    }),

    ask({
      name: 'confirm-checklist',
      question: (ctx) => {
        const conditions = ctx.state.successConditions
          .map((c) => `- [${c.id}] ${c.description}`)
          .join('\n')
        return [
          '请确认以下执行计划：',
          '',
          `**目标**：${ctx.state.goal}`,
          '',
          `**项目状态**：${ctx.state.hasImplementation ? ctx.state.implementationSummary : '无相关实现'}`,
          '',
          '**成功条件**：',
          conditions,
          '',
          '确认后将全程禁止交互。',
        ].join('\n')
      },
      handle: async () => ({ }),
    }),

    when(
      (ctx) => ctx.state.hasImplementation,
      [],
      [delegate({
        name: 'first-execution',
        title: () => '首次执行',
        message: (ctx) => P.firstExecutionMessage(ctx),
        systemPrompt: async (ctx) => {
          if (!ctx.state.executionSkill) return ''
          const slug = ctx.state.executionSkill.replace(/^ae:/, 'ae-')
          try {
            const content = await ctx.resolveContent(`skill:${slug}`)
            return `## 执行技能参考\n${content}`
          } catch {
            return ''
          }
        },
      })],
    ),

    fn('enter-loop', async () => {
      return undefined
    }),

    loop({
      name: 'verify-fix-loop',
      max: MAX_ROUNDS,
      until: (ctx) => ctx.state.exitReason !== null,
      body: [
        delegate({
          name: 'verify',
          title: () => '验证',
          message: (ctx) => P.verifyMessage(ctx),
          output: VerificationResultSchema,
          retries: 2,
        }),

        fn('judge', async (ctx) => {
          const raw = ctx.results.get('verify')
          const parsed = VerificationResultSchema.safeParse(raw)
          if (!parsed.success) {
            return { exitReason: 'limit' as const }
          }
          const verifyResult = parsed.data

          if (verifyResult.unrecoverable) {
            return { exitReason: 'unrecoverable' as const }
          }

          const passedCount = verifyResult.results.filter((r) => r.passed).length
          const failedResults = verifyResult.results.filter((r) => !r.passed)
          const allPassed = passedCount === verifyResult.results.length

          const consecutiveNoProgress =
            passedCount === ctx.state.previousPassedCount
              ? ctx.state.consecutiveNoProgress + 1
              : 0

          const currentRound = ctx.round

          const problems = failedResults.map((r) => `[${r.conditionId}] ${r.evidence}`)

          let executionMode: 'REBUILD' | 'FIX' | null = null
          if (!allPassed) {
            const passRate = passedCount / verifyResult.results.length
            executionMode = passRate < 0.3 ? 'REBUILD' : 'FIX'
          }

          let exitReason: TaskLoopState['exitReason'] = null
          if (allPassed) {
            exitReason = 'done'
          } else if (consecutiveNoProgress >= BOTTLENECK_THRESHOLD) {
            exitReason = 'bottleneck'
          } else if (currentRound >= ctx.state.maxRounds) {
            exitReason = 'limit'
          }

          return {
            currentRound,
            lastVerificationResults: verifyResult.results,
            previousPassedCount: passedCount,
            consecutiveNoProgress,
            problemList: problems,
            executionMode,
            exitReason,
          }
        }),

        when(
          (ctx) => ctx.state.exitReason === null && (ctx.state.executionMode === 'REBUILD' || ctx.state.executionMode === 'FIX'),
          [delegate({
            name: 'execute',
            title: (ctx) => `执行 (${ctx.state.executionMode})`,
            message: (ctx) => P.executeMessage(ctx),
            systemPrompt: async (ctx) => {
              if (!ctx.state.executionSkill) return ''
              const slug = ctx.state.executionSkill.replace(/^ae:/, 'ae-')
              try {
                const content = await ctx.resolveContent(`skill:${slug}`)
                return `## 执行技能参考\n${content}`
              } catch {
                return ''
              }
            },
          })],
        ),
      ],
    }),

    fn('exit-handling', async (ctx) => {
      const reason = ctx.state.exitReason
      const summary = [
        `**退出原因**：${reason}`,
        `**总轮次**：${ctx.state.currentRound}`,
        `**目标**：${ctx.state.goal}`,
      ]

      if (reason === 'done') {
        const passed = ctx.state.lastVerificationResults.filter((r) => r.passed)
        summary.push(`**通过条件**：${passed.length}/${ctx.state.successConditions.length}`)
        ctx.report({ title: '任务完成', detail: summary.join('\n') })
      } else if (reason === 'bottleneck') {
        const passed = ctx.state.lastVerificationResults.filter((r) => r.passed)
        const failed = ctx.state.lastVerificationResults.filter((r) => !r.passed)
        summary.push(`**通过**：${passed.length}，**未通过**：${failed.length}`)
        summary.push('', '**未通过条件**：')
        failed.forEach((r) => summary.push(`- [${r.conditionId}] ${r.evidence}`))
        ctx.report({ title: '瓶颈退出', detail: summary.join('\n') })
      } else if (reason === 'unrecoverable') {
        ctx.report({ title: '不可恢复错误', detail: summary.join('\n') })
      } else {
        ctx.report({ title: '轮次上限退出', detail: summary.join('\n') })
      }

      return undefined
    }),
  ],
})
