import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Effect } from 'effect'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function syncAgentAssets(manifest: RuntimeAssetManifest): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.tryPromise(() => rm(manifest.runtimeAgentDir, { recursive: true, force: true }))
      yield* Effect.tryPromise(() => mkdir(manifest.runtimeAgentDir, { recursive: true }))

      for (const file of manifest.runtimeAgentFiles) {
        const sourceExists = yield* Effect.tryPromise(() => exists(file.source))
        if (!sourceExists) {
          continue
        }

        yield* Effect.tryPromise(() => mkdir(dirname(file.target), { recursive: true }))
        yield* Effect.tryPromise(() => cp(file.source, file.target))
      }
    }),
  )
}
