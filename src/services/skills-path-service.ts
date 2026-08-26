import { resolve } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

interface SkillPathConfig {
  skills?: {
    paths?: string[]
  }
}

export async function registerSkillsPath(
  config: SkillPathConfig,
  manifest: RuntimeAssetManifest,
): Promise<void> {
  config.skills = config.skills ?? {}
  config.skills.paths = orderSkillPaths(config.skills.paths ?? [], manifest.skillsDir)
}

export function orderSkillPaths(existingPaths: string[], dynamicSkillsDir: string): string[] {
  return uniquePaths([...existingPaths, dynamicSkillsDir])
}

function uniquePaths(paths: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const path of paths) {
    const key = normalizePath(path)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(path)
  }

  return result
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\\/g, '/').toLowerCase()
}
