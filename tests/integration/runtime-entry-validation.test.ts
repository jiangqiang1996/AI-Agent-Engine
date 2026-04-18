import { describe, expect, it } from 'vitest'

import serverPlugin from '../../src/index.js'
import tuiPlugin from '../../src/tui.js'

describe('runtime-entry-validation', () => {
  it('应该通过 server plugin 注入 skills 路径和原生命令配置', async () => {
    const hooks = await serverPlugin.server({} as never)
    const config = {
      skills: {
        paths: [],
      },
      command: {},
    }

    await hooks.config?.(config as never)

    expect(config.skills.paths.length).toBeGreaterThan(0)
    expect(Object.keys(config.command)).toContain('ae-lfg')
  })

  it('应该通过 tui plugin 注册可发现命令', async () => {
    const registered: unknown[] = []
    const triggered: string[] = []
    const mockApi = {
      command: {
        register: (cb: () => unknown[]) => {
          registered.push(...cb())
          return () => undefined
        },
        trigger: (value: string) => {
          triggered.push(value)
        },
        show: () => undefined,
      },
      lifecycle: {
        signal: new AbortController().signal,
        onDispose: () => () => undefined,
      },
    }

    await tuiPlugin.tui(mockApi as never, undefined, {} as never)

    expect(registered.length).toBe(13)
    const first = registered[0] as { onSelect?: () => void; slash?: { name: string } }
    first.onSelect?.()
    expect(triggered.some((value) => value.startsWith('/ae-'))).toBe(true)
    expect(first.slash?.name.startsWith('ae-')).toBe(true)
  })
})
