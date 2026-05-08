import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getPhaseOneEntries, getPhaseOnePaEntries, getPhaseOnePoEntries } from '../../src/services/ae-catalog.js'
import { SKILL } from '../../src/schemas/ae-asset-schema.js'

function readFrontmatter(filePath: string): Record<string, string> {
  const text = readFileSync(filePath, 'utf8')
  const match = /^---\r?\n(?<body>[\s\S]*?)\r?\n---/.exec(text)
  const body = match?.groups?.body ?? ''
  return Object.fromEntries(body.split('\n').map((line) => {
    const separator = line.indexOf(':')
    if (separator === -1) {
      return ['', '']
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '')
    return [key, value]
  }).filter(([key]) => key))
}

describe('AE catalog 一致性', () => {
  it('ae:work 的 catalog argumentHint 应与 frontmatter 字面一致', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.WORK)
    const frontmatter = readFrontmatter('src/assets/skills/ae-work/SKILL.md')

    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
    expect(entry?.description).toContain('按')
    expect(frontmatter.description).toContain('按计划高效执行工作')
  })

  it('ae:merge-branch 的 catalog 应与 frontmatter 字面一致', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.MERGE_BRANCH)
    const frontmatter = readFrontmatter('src/assets/skills/ae-merge-branch/SKILL.md')

    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.commandName).toBe('ae-merge-branch')
  })

  it('ae:merge-branch 应包含合并安全边界', () => {
    const text = readFileSync('src/assets/skills/ae-merge-branch/SKILL.md', 'utf8')

    expect(text).toContain('git merge --no-commit --no-ff -- <target>')
    expect(text).toContain('git show <target>:<path>')
    expect(text).toContain('git worktree list --porcelain')
    expect(text).toContain('/ae-commit')
    expect(text).toContain('未提交文件不会进入接收分支')
    expect(text).toContain('不可信数据')
    expect(text).toContain('冲突修复前')
    expect(text).toContain('来源文档权威覆盖')
    expect(text).toContain('同名需求文档或设计文档')
  })

  it('ae:agent-creator 应注册为非默认入口并可被帮助目录发现', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.AGENT_CREATOR)
    const frontmatter = readFrontmatter('src/assets/skills/ae-agent-creator/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-agent-creator')
    expect(entry?.skillSlug).toBe('ae-agent-creator')
    expect(entry?.defaultEntry).toBe(false)
    expect(entry?.skillFile).toBe('src/assets/skills/ae-agent-creator/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
  })

  it('ae:agent-creator 应生成提示词优化命令变体', () => {
    expect(getPhaseOnePoEntries().some((item) => item.commandName === 'ae-agent-creator-po')).toBe(true)
    expect(getPhaseOnePaEntries().some((item) => item.commandName === 'ae-agent-creator-pa')).toBe(true)
  })

  it('ae:skill-creator 应保持单一入口并描述创建与更新能力', () => {
    const entries = getPhaseOneEntries()
    const entry = entries.find((item) => item.skillName === SKILL.SKILL_CREATOR)
    const skillNames = entries.map((item) => item.skillName as string)
    const commandNames = entries.map((item) => item.commandName as string)
    const skillText = readFileSync('src/assets/skills/ae-skill-creator/SKILL.md', 'utf8')
    const frontmatter = readFrontmatter('src/assets/skills/ae-skill-creator/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-skill-creator')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.description).toContain('创建或更新')
    expect(skillText).toContain('先读取现有 `SKILL.md`')
    expect(skillText).toContain('展示更新摘要或草案')
    expect(skillText).toContain('得到明确确认后再编辑')
    expect(skillNames).not.toContain('ae:skill-updater')
    expect(commandNames).not.toContain('ae-skill-updater')
  })
})
