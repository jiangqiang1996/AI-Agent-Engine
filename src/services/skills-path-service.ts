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
  config.skills.paths = [...new Set([...(config.skills.paths ?? []), manifest.skillsDir])]
}
