import type { OpencodeClient } from '@opencode-ai/sdk/v2'

let _client: OpencodeClient | null = null

export function setGlobalClient(client: OpencodeClient): void {
  _client = client
}

export function getGlobalClient(): OpencodeClient | null {
  return _client
}
