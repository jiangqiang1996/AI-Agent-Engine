import type { BrainstormConfig } from './builtin-opencode-config-service.js'

let _config: BrainstormConfig | null = null

export function setBrainstormConfig(config: BrainstormConfig | undefined): void {
  _config = config ?? null
}

export function getBrainstormConfig(): BrainstormConfig | undefined {
  return _config ?? undefined
}
