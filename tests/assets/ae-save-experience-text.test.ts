import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const skill = readFileSync('src/assets/skills/ae-save-experience/SKILL.md', 'utf8')
const saveSolution = readFileSync('src/assets/skills/ae-save-experience/references/save-solution.md', 'utf8')
const saveRules = readFileSync('src/assets/skills/ae-save-experience/references/save-rules.md', 'utf8')

describe('ae:save-experience 文本契约', () => {
  it('主技能应该先执行 solution 分支，再执行 rules 分支', () => {
    expect(skill.indexOf('references/save-solution.md')).toBeLessThan(skill.indexOf('references/save-rules.md'))
    expect(skill).toContain('先保存 solution')
    expect(skill).toContain('再按需提炼 rules')
  })

  it('应允许取消 solution 后继续 rules 确认', () => {
    expect(skill).toContain('无 solution 写入')
    expect(skill).toContain('继续 rules')
  })

  it('solution 写入前必须展示确认要素', () => {
    for (const phrase of ['目标路径', '标题', '语境标签', '证据摘要', '脱敏结果', '用户未确认时不得写入文件']) {
      expect(saveSolution).toContain(phrase)
    }
  })

  it('solution 和 rules 都必须包含敏感信息门禁', () => {
    for (const content of [skill, saveSolution, saveRules]) {
      for (const phrase of ['token', '私钥', '完整环境变量', '含密 URL', '原始敏感日志', 'PII']) {
        expect(content).toContain(phrase)
      }
    }
  })

  it('rules 脱敏边界应该与 solution 对齐', () => {
    for (const phrase of ['内部 URL', '私有工单或 PR 链接', '绝对本机路径', '客户/租户标识', '安全事件原始细节', '不得写入 `.opencode/rules/`']) {
      expect(saveRules).toContain(phrase)
    }
  })

  it('rules 分支应该内嵌在统一入口中，不引用旧技能', () => {
    expect(skill).toContain('即使只保存长期项目规范')
    expect(saveRules).toContain('ae:save-experience')
    expect(`${skill}\n${saveRules}`).not.toContain('ae:save-rules')
  })

  it('solution 与 rules 子流程应该保留结构化写入字段', () => {
    for (const phrase of ['type: solution', 'status: active', 'date:', 'source:', 'sensitive_checked: true']) {
      expect(saveSolution).toContain(phrase)
    }
    for (const phrase of ['适用场景', '问题', '证据摘要', '已验证方案', '权衡', '不适用场景', '后续引用方式']) {
      expect(saveSolution).toContain(phrase)
    }
    for (const phrase of ['候选识别', '读取当前项目 `.opencode/rules/**/*.md`', '已有 `.opencode/rules/` 去重', '历史交叉验证', '冲突处理', '用户确认后写入']) {
      expect(saveRules).toContain(phrase)
    }
  })
})
