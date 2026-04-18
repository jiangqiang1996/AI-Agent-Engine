import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getPhaseOneEntries } from '../../src/services/ae-catalog.js'
import { parseFrontmatter } from '../../src/utils/frontmatter.js'

describe('skill-command-parity', () => {
  it('应该保证每个 skill 与 command 真源都存在', () => {
    for (const entry of getPhaseOneEntries()) {
      expect(existsSync(resolve(process.cwd(), entry.commandFile))).toBe(true)
      if (entry.skillFile) {
        expect(existsSync(resolve(process.cwd(), entry.skillFile))).toBe(true)
      }
    }
  })

  it('应该保证 skill frontmatter 与 catalog 一致', () => {
    for (const entry of getPhaseOneEntries()) {
      if (!entry.skillFile) continue
      const content = readFileSync(resolve(process.cwd(), entry.skillFile), 'utf8')
      const parsed = parseFrontmatter(content)
      expect(parsed.data.name).toBe(entry.skillName)
    }
  })
})
