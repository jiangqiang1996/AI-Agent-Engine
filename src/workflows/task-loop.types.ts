import { z } from 'zod'
import type { Ctx } from '../services/orchestrator/types.js'

export const TaskLoopInputSchema = z.object({
  goal: z.string().min(1).describe('用户目标描述'),
})

export type TaskLoopInput = z.infer<typeof TaskLoopInputSchema>

export const ScanResultSchema = z.object({
  hasImplementation: z.boolean().describe('目标相关实现是否存在'),
  summary: z.string().describe('实现概况'),
})

export const QuestionsAnalysisSchema = z.object({
  questions: z.array(z.object({
    id: z.string().describe('问题唯一标识'),
    question: z.string().describe('问题文本'),
    type: z.enum(['text', 'choice', 'confirm']).describe('问题类型'),
    defaultValue: z.string().optional().describe('建议默认值'),
  })).describe('预分析提问列表'),
})

export const CollectedAnswersSchema = z.object({
  answers: z.array(z.object({
    id: z.string().describe('问题 ID'),
    answer: z.string().describe('用户回答'),
  })).describe('用户回答列表'),
})

export const ConditionsSchema = z.object({
  conditions: z.array(z.object({
    id: z.string().describe('条件唯一标识'),
    description: z.string().describe('条件描述'),
  })).describe('成功条件列表'),
})

export const VerificationResultSchema = z.object({
  results: z.array(z.object({
    conditionId: z.string().describe('条件 ID'),
    passed: z.boolean().describe('是否通过'),
    evidence: z.string().describe('通过或不通过的证据'),
  })).describe('验证结果列表'),
  unrecoverable: z.boolean().optional().describe('是否遇到不可恢复错误'),
})

export interface TaskLoopState {
  goal: string
  executionSkill: string | null
  hasImplementation: boolean
  implementationSummary: string
  questionsAndAnswers: Array<{ id: string; question: string; answer: string }>
  successConditions: Array<{ id: string; description: string }>
  currentRound: number
  maxRounds: number
  executionMode: 'REBUILD' | 'FIX' | null
  problemList: string[]
  lastVerificationResults: Array<{ conditionId: string; passed: boolean; evidence: string }>
  previousPassedCount: number
  consecutiveNoProgress: number
  exitReason: 'done' | 'bottleneck' | 'limit' | 'unrecoverable' | null
}

export type TL_Ctx = Ctx<TaskLoopInput, TaskLoopState>
