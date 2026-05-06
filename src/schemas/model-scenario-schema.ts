import { z } from 'zod'

export const MODEL_SCENARIO = {
  QUICK: 'quick',
  STANDARD: 'standard',
  DEEP: 'deep',
  VISION: 'vision',
} as const

export const ModelScenarioSchema = z
  .enum([
    MODEL_SCENARIO.QUICK,
    MODEL_SCENARIO.STANDARD,
    MODEL_SCENARIO.DEEP,
    MODEL_SCENARIO.VISION,
  ])
  .describe('AE 内置稳定模型场景')

export type ModelScenario = z.infer<typeof ModelScenarioSchema>
