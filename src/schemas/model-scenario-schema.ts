import { z } from 'zod'

export const MODEL_SCENARIO = {
  QUICK: 'quick',
  STANDARD: 'standard',
  DEEP: 'deep',
  VISION: 'vision',
  AUDIO: 'audio',
  VIDEO: 'video',
} as const

export const ModelScenarioSchema = z
  .enum([
    MODEL_SCENARIO.QUICK,
    MODEL_SCENARIO.STANDARD,
    MODEL_SCENARIO.DEEP,
    MODEL_SCENARIO.VISION,
    MODEL_SCENARIO.AUDIO,
    MODEL_SCENARIO.VIDEO,
  ])
  .describe('AE 内置稳定模型场景')

export type ModelScenario = z.infer<typeof ModelScenarioSchema>
