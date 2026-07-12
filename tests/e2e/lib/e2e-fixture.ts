import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { spawn } from 'node:child_process'
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

  const pluginPath = options?.pluginPath ?? path.resolve(process.cwd(), 'dist')

  const baseConfig: Record<string, unknown> = {
    plugin: {
      'ai-agent-engine': {
        path: pluginPath,
      },
    },
    ...options?.config,
  }

  let server: { url: string; close: () => void } | undefined
  try {
    const opencodePath = await resolveOpencodeBinary()
    if (!opencodePath) {
      throw new Error('opencode CLI not found in PATH')
    }

    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      XDG_DATA_HOME: path.join(tmpDir, 'share'),
      XDG_CACHE_HOME: path.join(tmpDir, 'cache'),
      XDG_STATE_HOME: path.join(tmpDir, 'state'),
      OPENCODE_DB: ':memory:',
      OPENCODE_DISABLE_AUTOUPDATE: '1',
      OPENCODE_DISABLE_AUTOCOMPACT: '1',
      OPENCODE_DISABLE_MODELS_FETCH: '1',
    }

    server = await new Promise<{ url: string; close: () => void }>((resolve, reject) => {
      const args = ['serve', '--hostname=127.0.0.1', '--port=0']
      const envWithConfig: Record<string, string | undefined> = {
        ...env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(baseConfig),
      }

      const proc = spawn(opencodePath!, args, {
        env: envWithConfig as Record<string, string>,
      })

      const timeout = setTimeout(() => {
        proc.kill()
        reject(new Error('Timeout waiting for server to start after 30000ms'))
      }, 30000)

      let output = ''
      let resolved = false

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (resolved) return
        output += chunk.toString()
        const lines = output.split('\n')
        for (const line of lines) {
          if (line.startsWith('opencode server listening')) {
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
            if (!match) {
              clearTimeout(timeout)
              proc.kill()
              reject(new Error(`Failed to parse server url from output: ${line}`))
              return
            }
            clearTimeout(timeout)
            resolved = true
            resolve({
              url: match[1],
              close: () => {
                proc.kill()
              },
            })
            return
          }
        }
      })

      proc.stderr?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
      })

      proc.on('exit', (code: number | null) => {
        clearTimeout(timeout)
        let msg = `Server exited with code ${code}`
        if (output.trim()) {
          msg += `\nServer output: ${output}`
        }
        reject(new Error(msg))
      })

      proc.on('error', (error: Error) => {
        clearTimeout(timeout)
        reject(error)
      })
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
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function resolveOpencodeBinary(): Promise<string | undefined> {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? 'where' : 'which'
  return new Promise<string | undefined>((resolve) => {
    const proc = spawn(cmd, ['opencode'])
    let output = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on('exit', (code: number | null) => {
      if (code === 0) {
        resolve(output.trim().split('\n')[0])
      } else {
        resolve(undefined)
      }
    })
  })
}

export { createOpencodeClient }
