import { describe, expect, it } from 'vitest'

import { mergeReviewFindings, runReviewGate } from './review-orchestration.js'

describe('review-orchestration', () => {
  it('应该合并重复 findings 并保留更保守的路由', () => {
    const merged = mergeReviewFindings([
      {
        reviewer: 'correctness-reviewer',
        title: '恢复逻辑缺失',
        severity: 'P1',
        autofixClass: 'manual',
        message: '恢复逻辑缺失',
        evidence: ['A'],
        requiresVerification: true,
      },
      {
        reviewer: 'maintainability-reviewer',
        title: '恢复逻辑缺失',
        severity: 'P2',
        autofixClass: 'safe_auto',
        message: '恢复逻辑缺失',
        evidence: ['B'],
        requiresVerification: false,
      },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0]?.severity).toBe('P1')
    expect(merged[0]?.autofixClass).toBe('manual')
    expect(merged[0]?.reviewer).toContain('correctness-reviewer')
    expect(merged[0]?.evidence).toEqual(['A', 'B'])
  })

  it('应该在存在 P0/P1 时阻断', () => {
    const result = runReviewGate([
      {
        reviewer: 'testing-reviewer',
        title: '缺失测试',
        severity: 'P1',
        autofixClass: 'manual',
        message: '缺失测试',
        evidence: [],
        requiresVerification: true,
      },
    ])

    expect(result.blocked).toBe(true)
  })

  it('应该在 manual 与 advisory 冲突时保留更严格的 manual 路由', () => {
    const merged = mergeReviewFindings([
      {
        reviewer: 'correctness-reviewer',
        title: '需要人工处理',
        severity: 'P2',
        autofixClass: 'manual',
        message: '需要人工处理',
        evidence: ['A'],
        requiresVerification: true,
      },
      {
        reviewer: 'testing-reviewer',
        title: '需要人工处理',
        severity: 'P2',
        autofixClass: 'advisory',
        message: '需要人工处理',
        evidence: ['B'],
        requiresVerification: false,
      },
    ])

    expect(merged[0]?.autofixClass).toBe('manual')
  })
})
