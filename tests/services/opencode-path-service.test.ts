import { homedir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { getOpencodeGlobalConfigDir } from '../../src/services/opencode-path-service.js'

describe('opencode-path-service', () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  describe('getOpencodeGlobalConfigDir', () => {
    it('XDG_CONFIG_HOME 设置时返回 join(XDG_CONFIG_HOME, "opencode")', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = '/xdg/config'
      expect(getOpencodeGlobalConfigDir()).toBe(join('/xdg/config', 'opencode'))
    })

    it('XDG_CONFIG_HOME 未设置时返回 join(homedir(), ".config", "opencode")', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      delete process.env.XDG_CONFIG_HOME
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })

    it('XDG_CONFIG_HOME 为空字符串时 fall through 到 homedir 兜底', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = ''
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })
  })
})
