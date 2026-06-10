import { describe, it, expect } from 'vitest'

import {
  parseCargoTreeOutput,
  parseCargoToml,
  cargoResolver,
} from '../../src/services/graph/cargo-resolver.js'

describe('cargo-resolver', () => {
  describe('parseCargoTreeOutput', () => {
    it('应该解析 cargo tree 输出', () => {
      const output = [
        'myapp v0.1.0',
        '├── serde v1.0.188',
        '│   └── serde_derive v1.0.188',
        '└── tokio v1.32.0',
        '    └── bytes v1.5.0',
      ].join('\n')
      const root = parseCargoTreeOutput(output)
      expect(root.name).toBe('cargo-project')
      expect(root.children).toHaveLength(1)
      expect(root.children[0]!.name).toBe('myapp')
      expect(root.children[0]!.version).toBe('0.1.0')
      expect(root.children[0]!.children).toHaveLength(2)
      expect(root.children[0]!.children[0]!.name).toBe('serde')
      expect(root.children[0]!.children[0]!.children).toHaveLength(1)
      expect(root.children[0]!.children[0]!.children[0]!.name).toBe('serde_derive')
      expect(root.children[0]!.children[1]!.name).toBe('tokio')
    })

    it('空输出应返回默认根节点', () => {
      const root = parseCargoTreeOutput('')
      expect(root.name).toBe('cargo-project')
    })
  })

  describe('parseCargoToml', () => {
    it('应该解析 [dependencies] 段', () => {
      const content = [
        '[package]',
        'name = "myapp"',
        '',
        '[dependencies]',
        'serde = "1.0"',
        'tokio = { version = "1.32", features = ["full"] }',
        '',
        '[dev-dependencies]',
        'assert_cmd = "2.0"',
      ].join('\n')
      const deps = parseCargoToml(content)
      expect(deps).toHaveLength(3)
      expect(deps[0]!.name).toBe('serde')
      expect(deps[0]!.version).toBe('1.0')
      expect(deps[1]!.name).toBe('tokio')
      expect(deps[1]!.version).toBe('1.32')
      expect(deps[2]!.name).toBe('assert_cmd')
    })

    it('无 dependencies 段应返回空数组', () => {
      const content = '[package]\nname = "myapp"\n'
      expect(parseCargoToml(content)).toHaveLength(0)
    })
  })

  describe('cargoResolver', () => {
    it('ecosystem 应为 cargo', () => {
      expect(cargoResolver.ecosystem).toBe('cargo')
    })
  })
})
