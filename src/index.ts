import type { PluginModule } from '@opencode-ai/plugin'

import { buildCommandConfig } from './services/command-registration.js'
import { createRuntimeAssetManifest } from './services/runtime-asset-manifest.js'
import { registerSkillsPath } from './services/skills-path-service.js'
import { createToolRegistry } from './tools/index.js'

interface RuntimeConfigShape {
  command?: Record<string, {
    template: string
    description?: string
  }>
  skills?: {
    paths?: string[]
  }
}

function mergeCommandConfig(config: RuntimeConfigShape, manifest = createRuntimeAssetManifest(import.meta.url)): void {
  config.command = {
    ...(config.command ?? {}),
    ...buildCommandConfig(manifest),
  }
}

const plugin: PluginModule = {
  id: 'ae-server',
  server: async () => {
    const manifest = createRuntimeAssetManifest(import.meta.url)

    return {
      config: async (config) => {
        registerSkillsPath(config as RuntimeConfigShape, manifest)
        mergeCommandConfig(config as RuntimeConfigShape, manifest)
      },
      tool: createToolRegistry(),
    }
  },
}

export default plugin
