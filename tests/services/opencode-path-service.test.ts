import { homedir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getOpencodeGlobalConfigDir } from '../../src/services/opencode-path-service.js'

describe('opencode-path-service', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getOpencodeGlobalConfigDir', () => {
    it('XDG_CONFIG_HOME 设置时返回 join(XDG_CONFIG_HOME, "opencode")', () => {
      vi.stubEnv('XDG_CONFIG_HOME', '/xdg/config')
      expect(getOpencodeGlobalConfigDir()).toBe(join('/xdg/config', 'opencode'))
    })

    it('XDG_CONFIG_HOME 未设置时返回 join(homedir(), ".config", "opencode")', () => {
      vi.stubEnv('XDG_CONFIG_HOME', '')
      delete process.env.XDG_CONFIG_HOME
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })

    it('XDG_CONFIG_HOME 为空字符串时 fall through 到 homedir 兜底', () => {
      vi.stubEnv('XDG_CONFIG_HOME', '')
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })
  })
})
