import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { toPosixPath } from '../utils/path-utils.js'

interface ReferencesConfig {
  references?: Record<string, unknown>
}

/**
 * 扫描 referencesDir 下的子目录和 .md 文件，注册为 opencode references。
 */
export function registerReferences(config: ReferencesConfig, manifest: RuntimeAssetManifest): void {
  const { referencesDir } = manifest
  if (!existsSync(referencesDir)) {
    return
  }

  const existing = config.references ?? {}
  const entries = readdirSync(referencesDir)
  const registered: Record<string, string> = {}

  for (const entry of entries) {
    const fullPath = join(referencesDir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (Object.hasOwn(existing, entry) || Object.hasOwn(registered, entry)) {
        continue
      }
      registered[entry] = toPosixPath(fullPath)
    } else if (entry.endsWith('.md')) {
      const key = entry.replace(/\.md$/, '')
      if (Object.hasOwn(existing, key) || Object.hasOwn(registered, key)) {
        continue
      }
      registered[key] = toPosixPath(fullPath)
    }
  }

  if (Object.keys(registered).length > 0) {
    config.references = { ...existing, ...registered }
  }
}
