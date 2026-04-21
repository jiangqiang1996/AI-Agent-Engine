import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { getRequiredAgents } from '../../src/services/ae-catalog.js'

describe('required-agent-matrix', () => {
  it('应该覆盖全部必需 agent', () => {
    for (const agent of getRequiredAgents()) {
      expect(existsSync(resolve(process.cwd(), agent.path))).toBe(true)
    }
  })
})
