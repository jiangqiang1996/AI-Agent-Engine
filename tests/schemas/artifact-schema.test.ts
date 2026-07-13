import { describe, it, expect } from 'vitest'
import { ArtifactFrontmatterSchema, ArtifactStatusSchema, isShardArtifactKind } from '../../src/schemas/artifact-schema.js'

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
  describe('prd 类型', () => {
    it('应该接受有效的 prd frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })

    it('应该接受 review-passed 状态的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'review-passed',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 date 的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        topic: 'test-topic',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const dateIssue = result.error.issues.find((i) => i.path[0] === 'date')
        expect(dateIssue).toBeDefined()
      }
    })

    it('应该拒绝缺少 topic 的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        date: '2026-04-27',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const topicIssue = result.error.issues.find((i) => i.path[0] === 'topic')
        expect(topicIssue).toBeDefined()
      }
    })

    it('应该拒绝 status: review-needs-fix 的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
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

    it('应该接受含可选字段的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'ae/prds/xxx.md',
        originFingerprint: '2026-04-27-xxx',
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝 origin 与 originFingerprint 只填写一个', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
        origin: 'ae/prds/source.md',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find((i) => i.path[0] === 'originFingerprint')
        expect(issue).toBeDefined()
      }
    })

    it('应该拒绝绝对 origin 路径', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
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
        type: 'prd',
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

    it('应该拒绝非 design 类型携带 depth', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
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

    it('应该接受不含 supersededBy 的 prd', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        status: 'drafted',
        date: '2026-04-27',
        topic: 'test-topic',
      })
      expect(result.success).toBe(true)
    })

    it('应该接受有效的 prd-shard frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd-shard',
        status: 'drafted',
        parent: 'ae/prds/main.md',
        module: 'auth',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('design 类型', () => {
    it('应该接受有效的 design frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'design',
        status: 'drafted',
        date: '2026-05-22',
        title: '详细设计',
      })

      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 date 或 title 的 design', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'design',
        status: 'drafted',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0])
        expect(paths).toContain('date')
        expect(paths).toContain('title')
      }
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

  describe('分片类型', () => {
    it('应该接受有效的 design-shard frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'design-shard',
        status: 'drafted',
        parent: 'ae/designs/main.md',
        module: 'auth',
      })

      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 parent 或 module 的分片 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd-shard',
        status: 'drafted',
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path[0])
        expect(paths).toContain('parent')
        expect(paths).toContain('module')
      }
    })

    it('应该拒绝分片 parent 绝对路径或路径穿越', () => {
      for (const parent of ['D:/tmp/main.md', 'ae/designs/../outside.md']) {
        const result = ArtifactFrontmatterSchema.safeParse({
          type: 'design-shard',
          status: 'drafted',
          parent,
          module: 'auth',
        })

        expect(result.success).toBe(false)
        if (!result.success) {
          const issue = result.error.issues.find((i) => i.path[0] === 'parent')
          expect(issue).toBeDefined()
        }
      }
    })

    it('应该识别分片产物类型', () => {
      expect(isShardArtifactKind('prd-shard')).toBe(true)
      expect(isShardArtifactKind('design-shard')).toBe(true)
      expect(isShardArtifactKind('design')).toBe(false)
    })
  })

  describe('多字段缺失同时报告', () => {
    it('prd 缺少 date 和 topic 时应该报告两个错误', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
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
