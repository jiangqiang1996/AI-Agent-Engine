import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readme = readFileSync('ae/solutions/README.md', 'utf8')
const patterns = readFileSync('ae/solutions/patterns/critical-patterns.md', 'utf8')
const reviewer = readFileSync('src/assets/agents/review/research-reviewer.md', 'utf8')

describe('research-reviewer 经验库文本契约', () => {
  it('README 应该区分 solution 与 rules 的用途', () => {
    expect(readme).toContain('历史方案')
    expect(readme).toContain('研究沉淀')
    expect(readme).toContain('长期遵守')
    expect(readme).toContain('.opencode/rules/')
  })

  it('README 应该声明脱敏边界', () => {
    for (const phrase of ['token', '私钥', '完整环境变量', '含密 URL', '原始敏感日志', 'PII', '内部 URL', '绝对本机路径', '客户/租户标识']) {
      expect(readme).toContain(phrase)
    }
  })

  it('critical-patterns 应该只维护索引和关键模式', () => {
    expect(existsSync('ae/solutions/patterns/critical-patterns.md')).toBe(true)
    expect(patterns).toContain('只维护高频风险、关键经验和 solution 索引')
    expect(patterns).toContain('不复制所有 solution 正文')
  })

  it('research-reviewer 应该在经验库缺失时自然降级', () => {
    expect(reviewer).toContain('ae/solutions/')
    expect(reviewer).toContain('ae/solutions/patterns/critical-patterns.md')
    expect(reviewer).toContain('缺失、为空或没有相关命中')
    expect(reviewer).toContain('无组织经验可用')
    expect(reviewer).toContain('继续技能、文档和外部研究')
    expect(reviewer).toContain('不得失败')
  })
})
