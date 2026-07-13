import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'
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

    expect(entry?.argumentHint).toBe('[设计路径|交接文件路径|任务描述]')
    expect(entry?.description).toContain('实施阶段')
    expect(frontmatter.description).toBe(entry?.description)
  })

  it('核心技能 catalog 应使用通用生命周期阶段描述', () => {
    const entries = getPhaseOneEntries()

    expect(entries.find((item) => item.skillName === SKILL.PRD)?.description).toContain('探索阶段')
    expect(entries.find((item) => item.skillName === SKILL.DESIGN)?.description).toContain('设计阶段')
    expect(entries.find((item) => item.skillName === SKILL.DESIGN)?.description).toContain('refactor=true')
    expect(entries.find((item) => item.skillName === SKILL.WORK)?.description).toContain('实施阶段')
    expect(entries.find((item) => item.skillName === SKILL.REVIEW)?.description).toContain('审查阶段')
    expect(entries.find((item) => item.skillName === SKILL.WORK)?.description).toContain('实施阶段')
  })

  it('ae:prd 的 catalog 应与 frontmatter 字面一致', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.PRD)
    const frontmatter = readFrontmatter('src/assets/skills/ae-prd/SKILL.md')

    expect(entry?.argumentHint).toBe('[目标描述|需求文档路径]')
    expect(entry?.description).toContain('探索阶段')
    expect(frontmatter.description).toBe(entry?.description)
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

  it('ae:agent-creator 应注册为非组合入口并可被帮助目录发现', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.AGENT_CREATOR)
    const frontmatter = readFrontmatter('src/assets/skills/ae-agent-creator/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-agent-creator')
    expect(entry?.skillFile).toBe('src/assets/skills/ae-agent-creator/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.description).toContain('创建或更新')
  })

  it('ae:agent-creator 应保持单一创建与更新入口', () => {
    const entries = getPhaseOneEntries()
    const entry = entries.find((item) => item.skillName === SKILL.AGENT_CREATOR)
    const text = readFileSync('src/assets/skills/ae-agent-creator/SKILL.md', 'utf8')

    expect(entry?.description).toContain('更新')
    expect(entries.map((item) => item.skillName as string)).not.toContain('ae:agent-updater')
    expect(entries.map((item) => item.commandName as string)).not.toContain('ae-agent-updater')
    expect(text).toContain('不新增或引导寻找 `ae:agent-updater`')
    expect(text).toContain('init_agent.mjs` 拒绝覆盖既有目标是预期安全语义')
  })

  it('ae:image 应注册为图片转 Markdown 入口', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.IMAGE)
    const frontmatter = readFrontmatter('src/assets/skills/ae-image/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-image')
    expect(entry?.skillFile).toBe('src/assets/skills/ae-image/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
  })

  it('ae:chrome-devtools 应注册为浏览器能力中枢入口', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.CHROME_DEVTOOLS)
    const frontmatter = readFrontmatter('src/assets/skills/ae-chrome-devtools/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-chrome-devtools')
    expect(entry?.skillFile).toBe('src/assets/skills/ae-chrome-devtools/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
    expect(entry?.customTemplate).toBeUndefined()
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

  it('ae:work-report 应注册为内置日报周报入口', () => {
    const entry = getPhaseOneEntries().find((item) => item.skillName === SKILL.WORK_REPORT)
    const frontmatter = readFrontmatter('src/assets/skills/ae-work-report/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-work-report')
    expect(entry?.skillFile).toBe('src/assets/skills/ae-work-report/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
  })

  it('ae:skill-creator 应支持 --from-session 模式', () => {
    const entries = getPhaseOneEntries()
    const entry = entries.find((item) => item.skillName === SKILL.SKILL_CREATOR)

    expect(entry).toBeDefined()
    expect(entry?.description).toContain('--from-session')
  })

  it('ae:prompt-optimize 应注册为提示词优化入口并与 frontmatter 一致', () => {
    const entries = getPhaseOneEntries()
    const entry = entries.find((item) => item.skillName === SKILL.PROMPT_OPTIMIZE)
    const frontmatter = readFrontmatter('src/assets/skills/ae-prompt-optimize/SKILL.md')

    expect(entry).toBeDefined()
    expect(entry?.commandName).toBe('ae-prompt-optimize')
    expect(entry?.skillFile).toBe('src/assets/skills/ae-prompt-optimize/SKILL.md')
    expect(entry?.description).toBe(frontmatter.description)
    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
    expect(entry?.description).toContain('禁止与原始逻辑违背')
  })
})
