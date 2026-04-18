import { describe, expect, it } from 'vitest'

import { getAllAgentDefinitions, getDeferredAgents, getGildedAgents, getRequiredAgents } from '../../src/services/ae-catalog.js'

describe('agent-matrix-contract', () => {
  it('应该保证三个层级互不重复', () => {
    const names = getAllAgentDefinitions().map((agent) => agent.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('应该同时存在 required、gilded 与 deferred 三个层级', () => {
    expect(getRequiredAgents().length).toBeGreaterThan(0)
    expect(getGildedAgents().length).toBeGreaterThan(0)
    expect(getDeferredAgents().length).toBeGreaterThan(0)
  })
})
