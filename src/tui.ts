import type { TuiPluginModule } from '@opencode-ai/plugin/tui'

import { createTuiCommands } from './services/command-registration.js'

const plugin: TuiPluginModule = {
  id: 'ae-tui',
  tui: async (api) => {
    const dispose = api.command.register(() => createTuiCommands(api.command.trigger))
    api.lifecycle.onDispose(dispose)
  },
}

export default plugin
