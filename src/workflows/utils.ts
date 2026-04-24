import type { z } from 'zod'
import type { Ctx } from '../services/orchestrator/types.js'

export function transferResult<I, S, T>(
  ctx: Ctx<I, S>,
  stepName: string,
  schema: z.ZodType<T>,
  mapper: (result: T) => Partial<S>,
): Partial<S> | void {
  const raw = ctx.results.get(stepName)
  if (raw === undefined || raw === null) return undefined
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return undefined
  return mapper(parsed.data)
}
