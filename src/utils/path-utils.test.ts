import { describe, expect, it } from 'vitest'

import { isInsideRoot, toPosixPath, toRepoRelativePath } from './path-utils.js'

describe('path-utils', () => {
  it('应该把 Windows 路径转换为 posix 形式', () => {
    expect(toPosixPath('skills\\ae-plan\\SKILL.md')).toBe('skills/ae-plan/SKILL.md')
  })

  it('应该判断目标路径位于仓库内', () => {
    expect(isInsideRoot('E:\\repo', 'E:\\repo\\skills\\ae-plan\\SKILL.md')).toBe(true)
  })

  it('应该在路径位于仓库外时报错', () => {
    expect(() => toRepoRelativePath('E:\\repo', 'E:\\other\\file.md')).toThrow('路径不在仓库内')
  })
})
