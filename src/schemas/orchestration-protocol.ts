import { z } from 'zod'
import { DomainExecutionResultSchema } from './ae-asset-schema.js'

export const TaskIntentSchema = z.object({
  stage: z.literal('entry').describe('阶段标签'),
  intent: z.string().min(1).describe('意图标签'),
  domain: z.string().describe('目标域名'),
  constraints: z.array(z.string()).describe('约束条件'),
  rawInput: z.string().describe('原始输入'),
  timestamp: z.string().describe('时间戳'),
})

export const ConfirmedContextSchema = z.object({
  stage: z.literal('interact').describe('阶段标签'),
  confirmedParams: z.record(z.string(), z.unknown()).describe('确认的参数'),
  exclusions: z.array(z.string()).describe('排除项'),
  boundaries: z.array(z.string()).describe('边界条件'),
  timestamp: z.string().describe('时间戳'),
})

export const DispatchResultsSchema = z.object({
  stage: z.literal('dispatch').describe('阶段标签'),
  domainResults: z.array(DomainExecutionResultSchema).describe('域执行结果列表'),
  timestamp: z.string().describe('时间戳'),
})

export const DeliverableSchema = z.object({
  stage: z.literal('summary').describe('阶段标签'),
  description: z.string().min(1).describe('交付物描述'),
  validationResults: z.array(z.string()).describe('验证结果'),
  artifacts: z.array(z.string()).describe('产出物路径列表'),
  timestamp: z.string().describe('时间戳'),
})

export type TaskIntent = z.infer<typeof TaskIntentSchema>
export type ConfirmedContext = z.infer<typeof ConfirmedContextSchema>
export type DispatchResults = z.infer<typeof DispatchResultsSchema>
export type Deliverable = z.infer<typeof DeliverableSchema>
