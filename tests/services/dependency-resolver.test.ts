import { describe, it, expect } from 'vitest'

import type { DependencyResolver, DependencyNode, DependencyTree, ResolverError } from '../../src/services/graph/dependency-resolver.js'

describe('DependencyNode 结构校验', () => {
  it('应包含必要字段', () => {
    const node: DependencyNode = {
      name: 'react',
      version: '18.2.0',
      scope: 'dependencies',
      children: [],
    }
    expect(node.name).toBe('react')
    expect(node.version).toBe('18.2.0')
    expect(node.scope).toBe('dependencies')
    expect(node.children).toEqual([])
  })

  it('version 和 scope 可选', () => {
    const node: DependencyNode = {
      name: 'lodash',
      children: [],
    }
    expect(node.version).toBeUndefined()
    expect(node.scope).toBeUndefined()
  })

  it('应支持嵌套子节点', () => {
    const node: DependencyNode = {
      name: 'app',
      children: [
        {
          name: 'react',
          version: '18.2.0',
          children: [
            { name: 'loose-envify', version: '1.4.0', children: [] },
          ],
        },
      ],
    }
    expect(node.children).toHaveLength(1)
    expect(node.children[0].children).toHaveLength(1)
  })
})

describe('DependencyTree 结构校验', () => {
  it('应包含 ecosystem、root 和 parser', () => {
    const tree: DependencyTree = {
      ecosystem: 'npm',
      root: { name: 'app', children: [] },
      parser: 'tool-cli',
    }
    expect(tree.ecosystem).toBe('npm')
    expect(tree.parser).toBe('tool-cli')
    expect(tree.root.name).toBe('app')
  })

  it('parser 应支持 regex-fallback', () => {
    const tree: DependencyTree = {
      ecosystem: 'maven',
      root: { name: 'com.example:app', children: [] },
      parser: 'regex-fallback',
    }
    expect(tree.parser).toBe('regex-fallback')
  })
})

describe('ResolverError 结构校验', () => {
  it('应包含 _tag、ecosystem 和 message', () => {
    const err: ResolverError = {
      _tag: 'CommandNotFound',
      ecosystem: 'maven',
      message: 'mvn 命令不可用',
    }
    expect(err._tag).toBe('CommandNotFound')
    expect(err.ecosystem).toBe('maven')
    expect(err.message).toBe('mvn 命令不可用')
    expect(err.cause).toBeUndefined()
  })

  it('cause 可选携带原始错误', () => {
    const original = new Error('spawn ENOENT')
    const err: ResolverError = {
      _tag: 'SpawnError',
      ecosystem: 'gradle',
      message: 'gradle 命令启动失败',
      cause: original,
    }
    expect(err.cause).toBe(original)
  })
})

describe('DependencyResolver 接口类型校验', () => {
  it('应满足接口契约', () => {
    const resolver: DependencyResolver = {
      ecosystem: 'npm',
      detect(worktree: string): boolean {
        return worktree.length > 0
      },
      async resolve(worktree: string, _timeout: number): Promise<DependencyTree> {
        return {
          ecosystem: 'npm',
          root: { name: worktree, children: [] },
          parser: 'tool-cli',
        }
      },
    }
    expect(resolver.ecosystem).toBe('npm')
    expect(resolver.detect('/tmp')).toBe(true)
    expect(resolver.detect('')).toBe(false)
  })
})
