import { describe, expect, it } from 'vitest'

import { getAllAgentDefinitions, getDefaultEntry, getPhaseOneEntries, getRequiredAgents } from './ae-catalog.js'

describe('ae-catalog', () => {
  it('应该返回全部公开入口', () => {
    expect(getPhaseOneEntries()).toHaveLength(16)
  })

  it('应该把 ae:lfg 标记为默认入口', () => {
    expect(getDefaultEntry().skillName).toBe('ae:lfg')
  })

  it('应该包含 requirements 里要求的必需 agent', () => {
    expect(getRequiredAgents().length).toBeGreaterThan(20)
    expect(getAllAgentDefinitions().some((agent) => agent.name === 'coherence-reviewer')).toBe(true)
  })
})
