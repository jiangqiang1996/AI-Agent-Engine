import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

import { createRuntimeAssetManifest } from './services/runtime-asset-manifest.js'
import { createTuiCommands } from './services/command-registration.js'

const manifest = createRuntimeAssetManifest(import.meta.url)

const plugin: TuiPluginModule = {
  id: 'ae-tui',
  tui: async (api) => {
    const dispose = api.command.register(() =>
      createTuiCommands(api.command.trigger, manifest.commandsDir),
    )
    api.lifecycle.onDispose(dispose)
  },
}

export default plugin
