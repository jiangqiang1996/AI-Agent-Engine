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

    expect(entry?.argumentHint).toBe(frontmatter['argument-hint'])
    expect(entry?.description).toContain('按')
    expect(frontmatter.description).toContain('按计划高效执行工作')
  })
})
