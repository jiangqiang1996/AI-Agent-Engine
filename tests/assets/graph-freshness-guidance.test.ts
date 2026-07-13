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

  it('图谱消费技能应该声明 freshness 门控边界', () => {
    const paths = [
      'src/assets/skills/ae-graph-query/SKILL.md',
      'src/assets/skills/ae-review/SKILL.md',
      'src/assets/skills/ae-work/SKILL.md',
    ]

    for (const path of paths) {
      const content = readFileSync(join(process.cwd(), path), 'utf8')
      expect(content).toContain('freshness')
      expect(content).toContain('freshness.status')
      expect(content).toContain('无影响')
      expect(content).toContain('无依赖')
      expect(content).toMatch(/不是 `fresh`|非 `fresh`|非 fresh|maybe_stale|stale|updating/)
      expect(content).toMatch(/不得|不能|才可|只能/)
      expect(content).toMatch(/刷新图谱|真实文件|源码搜索|Git 状态|验证命令/)
      expect(content).toMatch(/定位线索|辅助定位|候选.*线索|阅读顺序.*线索/)
    }
  })
})
