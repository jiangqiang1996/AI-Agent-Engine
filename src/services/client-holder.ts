import type { OpencodeClient } from '@opencode-ai/sdk'
import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'

let _client: OpencodeClient | null = null
let _manifest: RuntimeAssetManifest | null = null

export function setGlobalClient(client: OpencodeClient): void {
  _client = client
}

export function getGlobalClient(): OpencodeClient | null {
  return _client
}

export function setGlobalManifest(manifest: RuntimeAssetManifest): void {
  _manifest = manifest
}

export function getGlobalManifest(): RuntimeAssetManifest | null {
  return _manifest
}
