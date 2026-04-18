import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(process.cwd())

const coreAgents = [
  'agents/document-review/coherence-reviewer.md',
  'agents/document-review/feasibility-reviewer.md',
  'agents/review/correctness-reviewer.md',
  'agents/review/testing-reviewer.md',
  'agents/review/maintainability-reviewer.md',
  'agents/review/project-standards-reviewer.md',
]

describe('core-agent-inventory', () => {
  it('应该存在核心 agent 资产并包含中文说明', () => {
    for (const path of coreAgents) {
      const fullPath = resolve(repoRoot, path)
      expect(existsSync(fullPath)).toBe(true)
      expect(readFileSync(fullPath, 'utf8')).toContain('重点')
    }
  })
})
