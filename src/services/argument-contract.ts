import type { AeAssetEntry } from '../schemas/ae-asset-schema.js'

import { getPhaseOneEntries } from './ae-catalog.js'

export interface ArgumentContract {
  commandName: string
  skillName: string
  argumentHint?: string
  supportsModes: boolean
}

export function buildArgumentContract(entry: AeAssetEntry): ArgumentContract {
  return {
    commandName: entry.commandName,
    skillName: entry.skillName,
    argumentHint: entry.argumentHint,
    supportsModes: entry.argumentHint?.includes('mode:*') ?? false,
  }
}

export function getArgumentContracts(): ArgumentContract[] {
  return getPhaseOneEntries().map(buildArgumentContract)
}
