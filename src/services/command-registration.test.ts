import { describe, expect, it } from 'vitest'

import { createTuiCommands } from './command-registration.js'

describe('command-registration', () => {
  it('应该为全部公开入口生成 TUI 命令', () => {
    expect(createTuiCommands()).toHaveLength(11)
  })

  it('应该把 ae-lfg 标记为建议入口', () => {
    const entry = createTuiCommands().find((command) => command.title === 'ae-lfg')
    expect(entry?.suggested).toBe(true)
  })
})
