import { homedir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getOpencodeGlobalConfigDir } from '../../src/services/opencode-path-service.js'

describe('opencode-path-service', () => {
  const env = { ...process.env }

  afterEach(() => {
    process.env = { ...env }
  })

  describe('getOpencodeGlobalConfigDir', () => {
    it('OPENCODE_CONFIG_DIR 设置时返回该值', () => {
      process.env.OPENCODE_CONFIG_DIR = '/custom/config/dir'
      expect(getOpencodeGlobalConfigDir()).toBe('/custom/config/dir')
    })

    it('XDG_CONFIG_HOME 设置且 OPENCODE_CONFIG_DIR 未设置时返回 join(XDG_CONFIG_HOME, "opencode")', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = '/xdg/config'
      expect(getOpencodeGlobalConfigDir()).toBe(join('/xdg/config', 'opencode'))
    })

    it('两者均未设置时返回 join(homedir(), ".config", "opencode")', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      delete process.env.XDG_CONFIG_HOME
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })

    it('OPENCODE_CONFIG_DIR 优先于 XDG_CONFIG_HOME', () => {
      process.env.OPENCODE_CONFIG_DIR = '/priority/test'
      process.env.XDG_CONFIG_HOME = '/xdg/config'
      expect(getOpencodeGlobalConfigDir()).toBe('/priority/test')
    })

    it('OPENCODE_CONFIG_DIR 为空字符串时 fall through 到 XDG_CONFIG_HOME', () => {
      process.env.OPENCODE_CONFIG_DIR = ''
      process.env.XDG_CONFIG_HOME = '/xdg/config'
      expect(getOpencodeGlobalConfigDir()).toBe(join('/xdg/config', 'opencode'))
    })

    it('XDG_CONFIG_HOME 为空字符串时 fall through 到 homedir 兜底', () => {
      delete process.env.OPENCODE_CONFIG_DIR
      process.env.XDG_CONFIG_HOME = ''
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })

    it('OPENCODE_CONFIG_DIR 和 XDG_CONFIG_HOME 均为空字符串时 fall through 到 homedir 兜底', () => {
      process.env.OPENCODE_CONFIG_DIR = ''
      process.env.XDG_CONFIG_HOME = ''
      expect(getOpencodeGlobalConfigDir()).toBe(join(homedir(), '.config', 'opencode'))
    })
  })
})
