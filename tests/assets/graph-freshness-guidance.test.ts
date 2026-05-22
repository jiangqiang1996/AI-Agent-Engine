import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('graph freshness guidance', () => {
  it('graph-first 规则应该要求读取 freshness 并限制非 fresh 空结果结论', () => {
    const content = readFileSync(join(process.cwd(), 'src/assets/rules/graph-first.md'), 'utf8')

    expect(content).toContain('freshness')
    expect(content).toContain('freshness.status')
    expect(content).toContain('不是 `fresh`')
    expect(content).toContain('无影响、无依赖、完整覆盖或无需修改')
  })
})
