import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

interface InstructionsConfig {
  instructions?: string[]
}

export function registerRulesInstructions(config: InstructionsConfig, manifest: RuntimeAssetManifest): void {
  const rulesGlob = toPosixPath(join(manifest.rulesDir, '**', '*.md'))
  config.instructions = [...new Set([...(config.instructions ?? []), rulesGlob])]
}
