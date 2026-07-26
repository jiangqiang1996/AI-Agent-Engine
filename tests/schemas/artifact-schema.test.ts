import { describe, it, expect } from 'vitest'
import { ArtifactFrontmatterSchema } from '../../src/schemas/artifact-schema.js'

describe('ArtifactFrontmatterSchema', () => {
  describe('极简 frontmatter', () => {
    it('应该接受仅含 type 的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
      })
      expect(result.success).toBe(true)
    })

    it('应该接受含 ids 的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'design',
        ids: ['ADR-001', 'EP-001'],
      })
      expect(result.success).toBe(true)
    })

    it('应该接受含 dependsOn 的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        dependsOn: ['resource'],
      })
      expect(result.success).toBe(true)
    })

    it('应该接受含 involvesUI 的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        involvesUI: true,
      })
      expect(result.success).toBe(true)
    })

    it('应该接受含全部字段的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd',
        ids: ['R1', 'R2'],
        dependsOn: ['resource'],
        involvesUI: true,
      })
      expect(result.success).toBe(true)
    })

    it('应该拒绝缺少 type 的 frontmatter', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        ids: ['R1'],
      })
      expect(result.success).toBe(false)
    })

    it('应该拒绝无效的 type 值', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'invalid-type',
      })
      expect(result.success).toBe(false)
    })

    it('应该拒绝 prd-shard 类型（已移除）', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'prd-shard',
      })
      expect(result.success).toBe(false)
    })

    it('应该拒绝 design-shard 类型（已移除）', () => {
      const result = ArtifactFrontmatterSchema.safeParse({
        type: 'design-shard',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('各产物类型', () => {
    it('应该接受 prd 类型', () => {
      const result = ArtifactFrontmatterSchema.safeParse({ type: 'prd' })
      expect(result.success).toBe(true)
    })

    it('应该接受 design 类型', () => {
      const result = ArtifactFrontmatterSchema.safeParse({ type: 'design' })
      expect(result.success).toBe(true)
    })

    it('应该接受 work 类型', () => {
      const result = ArtifactFrontmatterSchema.safeParse({ type: 'work' })
      expect(result.success).toBe(true)
    })

    it('应该接受 review 类型', () => {
      const result = ArtifactFrontmatterSchema.safeParse({ type: 'review' })
      expect(result.success).toBe(true)
    })
  })
})
