import { join } from 'node:path'
import { homedir } from 'node:os'

import { getGlobalClient } from './client-holder.js'

let _cachedConfigDir: string | null = null

function fallbackConfigDir(): string {
  return join(homedir(), '.config', 'opencode')
}

/**
 * 通过 SDK client.path.get() 异步获取 opencode 全局配置路径。
 * 插件初始化时调用一次，后续同步代码通过 getOpencodeGlobalConfigDir() 读取缓存。
 */
export async function resolveOpencodePaths(): Promise<void> {
  if (_cachedConfigDir) return

  const client = getGlobalClient()
  if (client) {
    try {
      const response = await client.path.get()
      if (response.data?.config) {
        _cachedConfigDir = response.data.config
        return
      }
    } catch {
      // SDK 调用失败，降级到 fallback
    }
  }

  _cachedConfigDir = fallbackConfigDir()
}

/** 获取 opencode 全局配置目录。 */
export function getOpencodeGlobalConfigDir(): string {
  return _cachedConfigDir ?? fallbackConfigDir()
}
