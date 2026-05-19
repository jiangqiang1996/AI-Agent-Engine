import { describe, it, expect } from 'vitest'
import { ArtifactFrontmatterSchema, ArtifactStatusSchema } from '../../src/schemas/artifact-schema.js'

describe('ArtifactStatusSchema', () => {
  it('应该包含 active 枚举值', () => {
    const values = ArtifactStatusSchema.options
    expect(values).toContain('active')
  })

  it('应该拒绝无效的状态值', () => {
    const result = ArtifactStatusSchema.safeParse('invalid')
    expect(result.success).toBe(false)
  })
})

describe('ArtifactFrontmatterSchema', () => {
  describe('brainstorm 类型', () => {
    it('应该接受有效的 brainstorm frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })

    it('应该接受 review-passed 状态的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'review-passed',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 date 的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        topic: 'test-topic',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const dateIssue = result.error.issues.find((i) => i.path[0] === 'date')
        expect(dateIssue).toBeDefined()
      }
    })

    it('应该拒绝缺少 topic 的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const topicIssue = result.error.issues.find((i) => i.path[0] === 'topic')
        expect(topicIssue).toBeDefined()
      }
    })

    it('应该拒绝 status: review-needs-fix 的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'review-needs-fix',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const statusIssue = result.error.issues.find((i) => i.path[0] === 'status')
        expect(statusIssue).toBeDefined()
      }
    })

    it('应该接受含可选字段的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'ae/brainstorms/xxx.md',
        originFingerprint: '2026-04-27-xxx',
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝 origin 与 originFingerprint 只填写一个', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'ae/brainstorms/source.md',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'originFingerprint')
        expect(issue).toBeDefined()
      }
    })

    it('应该拒绝绝对 origin 路径', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'D:/tmp/source.md',
        originFingerprint: '2026-04-27-source',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'origin')
        expect(issue).toBeDefined()
      }
    })

    it('应该拒绝包含路径穿越的 origin 路径', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'ae/../outside.md',
        originFingerprint: '2026-04-27-source',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'origin')
        expect(issue).toBeDefined()
      }
    })

    it('应该拒绝非 plan 类型携带 depth', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        depth: 'standard',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'depth')
        expect(issue).toBeDefined()
      }
    })

    it('应该接受不含 supersededBy 的 brainstorm', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('plan 类型', () => {
    it('应该接受有效的 plan frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'plan',
        status: 'active',
        date: '2026-04-27',
        title: '测试计划',
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 title 的 plan', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'plan',
        status: 'active',
        date: '2026-04-27',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const titleIssue = result.error.issues.find((i) => i.path[0] === 'title')
        expect(titleIssue).toBeDefined()
      }
    })

    it('应该拒绝 status: review-needs-fix 的 plan', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'plan',
        status: 'review-needs-fix',
        date: '2026-04-27',
        title: '测试计划',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('work/review 类型', () => {
    it('应该接受不含 date/topic 的 work', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'work',
        status: 'drafted',
      })
      expect(result.success).toBe(true)
    })

    it('应该接受不含 date/topic 的 review', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'review',
        status: 'drafted',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('多字段缺失同时报告', () => {
    it('brainstorm 缺少 date 和 topic 时应该报告两个错误', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'brainstorm',
        status: 'drafted',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0])
        expect(paths).toContain('date')
        expect(paths).toContain('topic')
      }
    })
  })
})
