import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { createOpencodeServer } from '@opencode-ai/sdk/server'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

export interface E2EFixture {
  client: ReturnType<typeof createOpencodeClient>
  serverUrl: string
  close: () => Promise<void>
}

export async function withE2E<T>(
  fn: (fixture: E2EFixture) => Promise<T>,
  options?: {
    pluginPath?: string
    config?: Record<string, unknown>
  },
): Promise<T> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ae-e2e-'))
  const homeDir = path.join(tmpDir, 'home')
  const configDir = path.join(tmpDir, 'config')
  await fs.mkdir(homeDir, { recursive: true })
  await fs.mkdir(configDir, { recursive: true })

  const baseConfig: Record<string, unknown> = {
    plugin: ['ai-agent-engine'],
    model: 'anthropic/claude-3-5-haiku-20241022',
    provider: {
      anthropic: {
        npm: '@ai-sdk/anthropic',
      },
    },
    ...options?.config,
  }

  // 保存原始 env，设置隔离环境
  const envKeys = [
    'HOME', 'USERPROFILE',
    'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_CONFIG_HOME',
    'OPENCODE_DB', 'OPENCODE_DISABLE_AUTOUPDATE', 'OPENCODE_DISABLE_AUTOCOMPACT',
    'OPENCODE_DISABLE_MODELS_FETCH',
  ]
  const savedEnv: Record<string, string | undefined> = {}
  for (const key of envKeys) {
    savedEnv[key] = process.env[key]
  }

  process.env.HOME = homeDir
  process.env.USERPROFILE = homeDir
  process.env.XDG_DATA_HOME = path.join(tmpDir, 'share')
  process.env.XDG_CACHE_HOME = path.join(tmpDir, 'cache')
  process.env.XDG_STATE_HOME = path.join(tmpDir, 'state')
  process.env.XDG_CONFIG_HOME = configDir
  process.env.OPENCODE_DB = ':memory:'
  process.env.OPENCODE_DISABLE_AUTOUPDATE = '1'
  process.env.OPENCODE_DISABLE_AUTOCOMPACT = '1'
  process.env.OPENCODE_DISABLE_MODELS_FETCH = '1'

  let server: { url: string; close: () => void } | undefined
  try {
    server = await createOpencodeServer({
      hostname: '127.0.0.1',
      port: 0,
      timeout: 30_000,
      config: baseConfig,
    })

    const client = createOpencodeClient({ baseUrl: server.url })

    const fixture: E2EFixture = {
      client,
      serverUrl: server.url,
      close: async () => {
        server?.close()
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      },
    }

    return await fn(fixture)
  } finally {
    server?.close()
    // 恢复原始 env
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export { createOpencodeClient }
