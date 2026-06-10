import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseGoModGraph, parseGoMod, goResolver } from '../../src/services/graph/go-resolver.js'

const TMP_BASE = join(tmpdir(), 'ae-go-resolver-test')

describe('parseGoModGraph', () => {
  it('应解析标准 go mod graph 输出', () => {
    const output = [
      'github.com/my/project@v1.0.0 github.com/lib/a@v1.2.3',
      'github.com/my/project@v1.0.0 github.com/lib/b@v2.0.0',
      'github.com/lib/a@v1.2.3 github.com/lib/c@v3.0.0',
    ].join('\n')

    const root = parseGoModGraph(output, 'github.com/my/project')
    expect(root.name).toBe('github.com/my/project')
    expect(root.version).toBe('v1.0.0')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].name).toBe('github.com/lib/a')
    expect(root.children[0].version).toBe('v1.2.3')
    expect(root.children[0].children).toHaveLength(1)
    expect(root.children[0].children[0].name).toBe('github.com/lib/c')
    expect(root.children[1].name).toBe('github.com/lib/b')
    expect(root.children[1].version).toBe('v2.0.0')
  })

  it('应处理空输出', () => {
    const root = parseGoModGraph('', 'github.com/my/project')
    expect(root.name).toBe('github.com/my/project')
    expect(root.children).toHaveLength(0)
  })

  it('应跳过格式不匹配的行', () => {
    const output = [
      'github.com/my/project@v1.0.0 github.com/lib/a@v1.2.3',
      'invalid line',
      '# comment',
    ].join('\n')

    const root = parseGoModGraph(output, 'github.com/my/project')
    expect(root.children).toHaveLength(1)
  })

  it('应处理循环依赖（不无限递归）', () => {
    const output = [
      'github.com/a@v1.0.0 github.com/b@v1.0.0',
      'github.com/b@v1.0.0 github.com/a@v1.0.0',
    ].join('\n')

    const root = parseGoModGraph(output, 'github.com/a')
    expect(root.name).toBe('github.com/a')
    expect(root.children).toHaveLength(1)
    expect(root.children[0].name).toBe('github.com/b')
    // 循环引用：b → a，a 已访问过，children 为空（不再递归）
    expect(root.children[0].children).toHaveLength(1)
    expect(root.children[0].children[0].name).toBe('github.com/a')
    expect(root.children[0].children[0].children).toHaveLength(0)
  })
})

describe('parseGoMod', () => {
  it('应解析单行 require', () => {
    const content = [
      'module github.com/my/project',
      '',
      'go 1.21',
      '',
      'require github.com/lib/a v1.2.3',
      'require github.com/lib/b v2.0.0',
    ].join('\n')

    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].name).toBe('github.com/lib/a')
    expect(deps[0].version).toBe('v1.2.3')
    expect(deps[1].name).toBe('github.com/lib/b')
    expect(deps[1].version).toBe('v2.0.0')
  })

  it('应解析 require 块', () => {
    const content = [
      'module github.com/my/project',
      '',
      'go 1.21',
      '',
      'require (',
      '\tgithub.com/lib/a v1.2.3',
      '\tgithub.com/lib/b v2.0.0',
      ')',
    ].join('\n')

    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].name).toBe('github.com/lib/a')
    expect(deps[1].name).toBe('github.com/lib/b')
  })

  it('应处理混合单行和块 require', () => {
    const content = [
      'module github.com/my/project',
      '',
      'go 1.21',
      '',
      'require github.com/lib/a v1.2.3',
      '',
      'require (',
      '\tgithub.com/lib/b v2.0.0',
      ')',
    ].join('\n')

    const deps = parseGoMod(content)
    expect(deps).toHaveLength(2)
  })

  it('应处理空 go.mod', () => {
    const content = 'module github.com/my/project\ngo 1.21'
    const deps = parseGoMod(content)
    expect(deps).toHaveLength(0)
  })

  it('应跳过 indirect 标注', () => {
    const content = [
      'require (',
      '\tgithub.com/lib/a v1.2.3 // indirect',
      ')',
    ].join('\n')

    const deps = parseGoMod(content)
    expect(deps).toHaveLength(1)
    expect(deps[0].name).toBe('github.com/lib/a')
    expect(deps[0].version).toBe('v1.2.3')
  })
})

describe('goResolver', () => {
  it('ecosystem 应为 gomod', () => {
    expect(goResolver.ecosystem).toBe('gomod')
  })

  it('detect 在有 go.mod 的目录应返回 true', () => {
    const tmpDir = join(TMP_BASE, 'detect-yes')
    try {
      mkdirSync(tmpDir, { recursive: true })
      writeFileSync(join(tmpDir, 'go.mod'), 'module test\ngo 1.21')
      expect(goResolver.detect(tmpDir)).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('detect 在无 go.mod 的目录应返回 false', () => {
    const tmpDir = join(TMP_BASE, 'detect-no')
    try {
      mkdirSync(tmpDir, { recursive: true })
      expect(goResolver.detect(tmpDir)).toBe(false)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
