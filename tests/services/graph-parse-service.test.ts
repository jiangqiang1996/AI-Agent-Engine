import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { collectGraphFiles, parseFileRelations, pushDocumentReference, pushMarkdownLinkReferences } from '../../src/services/graph-parse-service.js'
import type { GraphRelation, GraphRelationType } from '../../src/services/graph-storage-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-parse-'))
  tempRoots.push(root)
  return root
}

function write(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content)
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('graph-parse-service', () => {
  it('应该解析 TS import、require 和 Markdown 链接', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import x from './b'\nconst y = require('pkg')")
    write(root, 'src/b.ts', 'export const b = 1')
    write(root, 'README.md', '[A](src/a.ts)')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.files.some((file) => file.relativePath === 'src/a.ts' && file.id === 'file:src/a.ts' && file.kind === 'file')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'import' && relation.targetPath === 'src/b.ts' && relation.sourceId === 'file:src/a.ts' && relation.targetId === 'file:src/b.ts' && relation.confidence === 'resolved')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'pkg' && relation.type === 'external_reference' && relation.confidence === 'unresolved')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'link' && relation.targetPath === 'src/a.ts')).toBe(true)
  })

  it('不应该把 TS 命名导入误识别为外部花括号节点', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import { join } from 'node:path'\nimport type { Options } from './types'")
    write(root, 'src/types.ts', 'export interface Options {}')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath === '{')).toBe(false)
    expect(parsed.relations.some((relation) => relation.targetId === 'external:unknown:{')).toBe(false)
    expect(parsed.relations.some((relation) => relation.targetPath === 'type')).toBe(false)
    expect(parsed.relations.some((relation) => relation.targetPath === 'node:path')).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/types.ts')).toBe(true)
  })

  it('不应该从注释行提取关系', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', [
      "// import ghost from './ghost'",
      "/* const ghost = require('./ghost') */",
      "import real from './real'",
    ].join('\n'))
    write(root, 'src/real.ts', 'export const real = 1')
    write(root, 'docs/guide.md', '<!-- [Ghost](ghost.md) -->\n[Real](real.md)')
    write(root, 'docs/real.md', '# real')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath.includes('ghost'))).toBe(false)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === 'src/real.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/real.md')).toBe(true)
  })

  it('应该使用 TypeScript 编译器解析 TS/JS 节点和关系', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', [
      "// import ghost from './ghost'",
      "export { real } from './real'",
      "const lazy = import('./lazy')",
      "const cjs = require('./cjs')",
      'export class Runner {}',
      'export const handle = () => 1',
      '// [Ghost](ghost.md)',
      '// [Ref][ghost]',
      'const marker = 1 // [Ghost](ghost.md)',
      'const marker2 = 2 /* [Ghost](ghost.md) */',
      '[Doc](../docs/doc.md)',
      '[Ref][doc]',
      '[ghost]: ghost.md',
      '[doc]: ../docs/doc.md',
    ].join('\n'))
    write(root, 'src/real.ts', 'export const real = 1')
    write(root, 'src/lazy.ts', 'export const lazy = 1')
    write(root, 'src/cjs.ts', 'export const cjs = 1')
    write(root, 'docs/doc.md', '# doc')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath.includes('ghost'))).toBe(false)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/real.ts' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/lazy.ts' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/cjs.ts' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === 'docs/doc.md' && relation.relationType === 'link')).toBe(true)
    expect(parsed.files.some((file) => file.id === 'symbol:src/a.ts#class:Runner:5' && file.parser === 'tree-sitter')).toBe(true)
    expect(parsed.files.some((file) => file.id === 'symbol:src/a.ts#function:handle:6' && file.parser === 'tree-sitter')).toBe(true)
  })

  it('不应该从多行注释块正文提取 Markdown 链接关系', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', [
      '/*',
      '[Ghost](../docs/ghost.md)',
      '*/',
      '[Real](../docs/real.md)',
    ].join('\n'))
    write(root, 'docs/guide.md', [
      '<!--',
      '[Ghost](ghost.md)',
      '-->',
      '[Real](real.md)',
    ].join('\n'))
    write(root, 'docs/ghost.md', '# ghost')
    write(root, 'docs/real.md', '# real')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === 'docs/ghost.md')).toBe(false)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/ghost.md')).toBe(false)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === 'docs/real.md')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/real.md')).toBe(true)
  })

  it('TypeScript AST 浅层解析不应该把局部变量提升为文件级节点', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', [
      'export function run() {',
      '  const local = 1',
      '  return local',
      '}',
    ].join('\n'))

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.files.some((file) => file.id === 'symbol:src/a.ts#function:run:1')).toBe(true)
    expect(parsed.files.some((file) => file.id === 'symbol:src/a.ts#variable:local:2')).toBe(false)
  })

  it('应该对 mjs 和 cjs 使用 JavaScript AST 解析', async () => {
    const root = createTempRoot()
    write(root, 'src/a.mjs', "export { value } from './value'\nconst lazy = import('./lazy')")
    write(root, 'src/b.cjs', "const value = require('./value')")
    write(root, 'src/value.js', 'export const value = 1')
    write(root, 'src/lazy.js', 'export const lazy = 1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.mjs' && relation.targetPath === 'src/value.js' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.mjs' && relation.targetPath === 'src/lazy.js' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/b.cjs' && relation.targetPath === 'src/value.js' && relation.parser === 'tree-sitter')).toBe(true)
  })

  it('应该对 tsx 和 jsx 使用独立的 tree-sitter 语法', async () => {
    const root = createTempRoot()
    write(root, 'src/app.tsx', [
      "import Button from './Button'",
      'export function App() {',
      '  return <Button />',
      '}',
    ].join('\n'))
    write(root, 'src/Button.jsx', 'export default function Button() { return null }')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/app.tsx' && relation.targetPath === 'src/Button.jsx' && relation.parser === 'tree-sitter')).toBe(true)
    expect(parsed.files.some((file) => file.id === 'symbol:src/app.tsx#function:App:2' && file.parser === 'tree-sitter')).toBe(true)
    expect(parsed.files.some((file) => file.id === 'symbol:src/Button.jsx#function:Button:1' && file.parser === 'tree-sitter')).toBe(true)
  })

  it('应该为目录关系写入明确的节点 ID 和证据', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.files.some((file) => file.id === 'directory:src' && file.kind === 'directory')).toBe(true)
    expect(parsed.relations.some((relation) => relation.id === 'file:src/a.ts->directory:src:directory' && relation.type === 'directory' && relation.relationType === 'directory' && relation.sourceId === 'file:src/a.ts' && relation.targetId === 'directory:src' && relation.confidence === 'resolved' && relation.parser === 'filesystem' && relation.evidence === 'src')).toBe(true)
  })

  it('应该解析文件内部浅层元素并关联到所属文件', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', [
      'export class Runner {}',
      'export enum Mode { Fast }',
      'export type Result = string',
      'export function run() { return 1 }',
      'export const handle = () => 1',
      'const value = 1',
      'export interface Options {}',
    ].join('\n'))
    write(root, 'docs/guide.md', '# Guide: API #1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const expectedSymbols = [
      ['symbol:src/a.ts#class:Runner:1', 'class'],
      ['symbol:src/a.ts#enum:Mode:2', 'enum'],
      ['symbol:src/a.ts#type:Result:3', 'type'],
      ['symbol:src/a.ts#function:run:4', 'function'],
      ['symbol:src/a.ts#function:handle:5', 'function'],
      ['symbol:src/a.ts#variable:value:6', 'variable'],
      ['symbol:src/a.ts#interface:Options:7', 'interface'],
      ['symbol:docs/guide.md#section:Guide-API-1:1', 'section'],
    ] as const
    for (const [id, symbolKind] of expectedSymbols) {
      expect(parsed.files.some((file) => file.id === id && file.kind === 'symbol' && file.symbolKind === symbolKind)).toBe(true)
      expect(parsed.relations.some((relation) => relation.targetId === id && relation.type === 'contains' && relation.relationType === 'contains')).toBe(true)
    }
    expect(parsed.files.some((file) => file.id === 'symbol:src/a.ts#function:run:4' && file.parentId === 'file:src/a.ts')).toBe(true)
  })

  it('应该把被排除规则过滤的目标记录为未解析外部关系', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import b from './b'")
    write(root, 'src/b.ts', 'export const b = 1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: ['src/b.ts'] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === './b' && relation.relationType === 'external' && relation.type === 'external_reference' && relation.confidence === 'unresolved' && relation.reason === '目标被图谱排除规则过滤')).toBe(true)
  })

  it('应该按排除规则跳过文件', async () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', 'import x from "./b"')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: ['src'] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/a.ts'])
  })

  it('应该结构化记录因为文件过大被跳过的文件', async () => {
    const root = createTempRoot()
    write(root, 'src/large.ts', 'x'.repeat((10 * 1024 * 1024) + 1))
    write(root, 'src/small.ts', 'export const small = 1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.skippedFiles).toEqual([
      { path: 'src/large.ts', reason: '文件超过 10485760 字节上限', sizeBytes: (10 * 1024 * 1024) + 1 },
    ])
    expect(parsed.failedFiles).toEqual([])
    expect(parsed.warnings).toContain('已跳过超大文件：src/large.ts - 文件超过 10485760 字节上限')
    expect(parsed.files.some((file) => file.relativePath === 'src/small.ts')).toBe(true)
  })

  it('应该按类似 .gitignore 的通配规则跳过根目录和子目录构建产物', async () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', '')
    write(root, 'packages/app/dist/b.ts', '')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: ['**/dist'] })

    expect(files.map((file) => file.relativePath)).toEqual(['src/a.ts'])
  })

  it('不应该让否定规则重新纳入文件', async () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', '')
    write(root, 'dist/keep.ts', '')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: ['**/dist', '!dist/keep.ts'] })

    expect(files.map((file) => file.relativePath)).toEqual(['src/a.ts'])
  })

  it('应该解析省略扩展名和 index 文件的相对引用', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import b from './b'\nimport c from './feature'")
    write(root, 'src/b.ts', 'export const b = 1')
    write(root, 'src/feature/index.ts', 'export const c = 1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath === 'src/b.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/feature/index.ts')).toBe(true)
  })

  it('不应该把带扩展名但不存在的相对引用标记为已解析', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import missing from './missing.ts'")

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === './missing.ts' && relation.relationType === 'external' && relation.type === 'external_reference' && relation.confidence === 'unresolved')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'src/a.ts' && relation.targetPath === 'src/missing.ts' && relation.confidence === 'resolved')).toBe(false)
  })

  it('应该按当前文档目录解析 Markdown 相对链接并支持根路径链接', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next](next.md) [Home](/README.md)')
    write(root, 'docs/next.md', '# next')
    write(root, 'README.md', '# home')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/next.md')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'README.md')).toBe(true)
  })

  it('应该解析 Markdown 引用式链接', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next][next]\n\n[next]: next.md')
    write(root, 'docs/next.md', '# next')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/next.md')).toBe(true)
  })

  it('应该解析 Python、Java 和 Go 导入为外部关系', async () => {
    const root = createTempRoot()
    write(root, 'src/app.py', 'import requests\nfrom pathlib import Path')
    write(root, 'src/App.java', 'import java.util.List;')
    write(root, 'src/app.go', 'import "fmt"')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'requests')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'pathlib')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'java.util.List')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'fmt')).toBe(true)
  })

  it('应该拒绝 target 目录符号链接越界', async () => {
    const parent = createTempRoot()
    const root = join(parent, 'repo')
    const outside = join(parent, 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'secret.ts'), '')
    try {
      symlinkSync(outside, join(root, 'linked'), 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }

    expect(() => collectGraphFiles(root, join(root, 'linked'), { exclude: [] })).toThrow(/符号链接|工作区/)
  })

  it('不应该通过中间目录符号链接解析工作区外引用', async () => {
    const parent = createTempRoot()
    const root = join(parent, 'repo')
    const outside = join(parent, 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'secret.ts'), 'export const secret = 1')
    try {
      symlinkSync(outside, join(root, 'linked'), 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }
    write(root, 'src/a.ts', "import secret from '../linked/secret'")

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked'))).toBe(false)
  })

  it('不应该通过中间目录符号链接解析工作区内别名引用', async () => {
    const root = createTempRoot()
    write(root, 'src/target.ts', 'export const target = 1')
    try {
      symlinkSync(join(root, 'src'), join(root, 'linked-src'), 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }
    write(root, 'src/a.ts', "import target from '../linked-src/target'")

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked-src'))).toBe(false)
  })

  it('不应该通过中间目录符号链接解析带扩展名的缺失引用', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import missing from '../linked-src/missing.ts'")
    try {
      symlinkSync(join(root, 'src'), join(root, 'linked-src'), 'dir')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        return
      }
      throw error
    }

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked-src'))).toBe(false)
  })

  it('不应该把工作区外的真实相对引用记录为内部关系', async () => {
    const parent = createTempRoot()
    const root = join(parent, 'repo')
    const outsideDir = join(parent, 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outsideDir, 'outside.ts'), 'export const outside = 1')
    write(root, 'src/a.ts', `import outside from '../../${basename(outsideDir)}/outside'`)

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('outside'))).toBe(false)
  })

  it('应该默认跳过敏感文件和图谱运行时目录', async () => {
    const root = createTempRoot()
    write(root, '.env', 'TOKEN=secret')
    write(root, 'src/private-key.json', '{}')
    write(root, '.ae/schema.sql', 'select 1')
    write(root, 'ae/graphs/graph.json', '{}')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: [] })

    expect(files.map((file) => file.relativePath)).toEqual(['src/a.ts'])
  })

  it('未配置时不应该强制跳过常见构建目录', async () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: [] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/a.ts'])
  })

  it('graph.include 应该优先于 graph.exclude 并允许递归进入被排除目录', async () => {
    const root = createTempRoot()
    write(root, 'dist/keep.ts', '')
    write(root, 'dist/drop.ts', '')

    const files = collectGraphFiles(root, root, { include: ['dist/keep.ts'], exclude: ['**/dist'] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/keep.ts'])
  })

  it('graph.include glob 应该允许递归进入被排除目录', async () => {
    const root = createTempRoot()
    write(root, 'dist/nested/keep.ts', '')
    write(root, 'dist/nested/drop.js', '')

    const files = collectGraphFiles(root, root, { include: ['dist/**/*.ts'], exclude: ['**/dist'] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/nested/keep.ts'])
  })

  it('graph.include glob 不应该递归进入无关的被排除目录', async () => {
    const root = createTempRoot()
    write(root, 'src/keep.ts', '')
    write(root, 'dist/drop.ts', '')

    const files = collectGraphFiles(root, root, { include: ['src/**/*.ts'], exclude: ['**/dist'] })

    expect(files.map((file) => file.relativePath)).toEqual(['src/keep.ts'])
  })

  it('graph.include 不应该覆盖安全硬排除', async () => {
    const root = createTempRoot()
    write(root, '.env', 'TOKEN=secret')
    write(root, 'ae/graphs/graph.json', '{}')
    write(root, 'src/logo.png', 'fake image')

    const files = collectGraphFiles(root, root, { include: ['.env', 'ae/graphs/graph.json', 'src/logo.png'], exclude: [] })

    expect(files).toEqual([])
  })
})

describe('文档引用解析增强', () => {
  it('应该解析 Markdown 中的链接、图片和 include 指令', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', [
      '[Next](next.md)',
      '![Logo](logo.svg)',
      '<!-- include shared/header.md -->',
    ].join('\n'))
    write(root, 'docs/next.md', '# next')
    write(root, 'docs/logo.svg', '<svg/>')
    write(root, 'docs/shared/header.md', '# header')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((r) => r.relationType === 'link' && r.sourcePath === 'docs/guide.md' && r.targetPath === 'docs/next.md')).toBe(true)
    expect(parsed.relations.some((r) => r.relationType === 'image_reference' && r.sourcePath === 'docs/guide.md' && r.targetPath === 'docs/logo.svg')).toBe(true)
    expect(parsed.relations.some((r) => r.relationType === 'include' && r.sourcePath === 'docs/guide.md' && r.targetPath === 'docs/shared/header.md')).toBe(true)
  })

  it('应该为所有 Markdown 文档关系设置 layer=document, source=regex', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next](next.md)\n![Img](img.svg)\n<!-- include part.md -->')
    write(root, 'docs/next.md', '# next')
    write(root, 'docs/img.svg', '<svg/>')
    write(root, 'docs/part.md', '# part')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const docRelations = parsed.relations.filter((r) => r.sourcePath === 'docs/guide.md' && (r.relationType === 'link' || r.relationType === 'image_reference' || r.relationType === 'include'))
    for (const r of docRelations) {
      expect(r.layer).toBe('document')
      expect(r.source).toBe('regex')
    }
  })

  it('应该为已解析的文档关系设置 completeness=full，未解析的设置 completeness=incomplete', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Exists](exists.md)\n[Missing](missing.md)\n![Found](found.svg)\n![Lost](lost.svg)')
    write(root, 'docs/exists.md', '# exists')
    write(root, 'docs/found.svg', '<svg/>')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const resolved = parsed.relations.find((r) => r.sourcePath === 'docs/guide.md' && r.relationType === 'link' && r.targetPath === 'docs/exists.md')
    expect(resolved?.completeness).toBe('full')

    const unresolved = parsed.relations.find((r) => r.sourcePath === 'docs/guide.md' && r.targetPath === 'missing.md' && r.confidence === 'unresolved')
    expect(unresolved?.completeness).toBe('incomplete')

    const resolvedImg = parsed.relations.find((r) => r.sourcePath === 'docs/guide.md' && r.relationType === 'image_reference' && r.targetPath === 'docs/found.svg')
    expect(resolvedImg?.completeness).toBe('full')

    const unresolvedImg = parsed.relations.find((r) => r.sourcePath === 'docs/guide.md' && r.targetPath === 'lost.svg' && r.confidence === 'unresolved')
    expect(unresolvedImg?.completeness).toBe('incomplete')
  })

  it('应该跳过锚点链接和外部 URL', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Section](#intro)\n[External](https://example.com)\n![Remote](http://img.com/a.png)')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const docRelations = parsed.relations.filter((r) => r.sourcePath === 'docs/guide.md' && r.relationType !== 'contains' && r.relationType !== 'directory')
    expect(docRelations).toEqual([])
  })

  it('应该处理空 Markdown 和无链接文件', async () => {
    const root = createTempRoot()
    write(root, 'docs/empty.md', '')
    write(root, 'docs/plain.md', 'Just plain text, no links at all.')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const linkRelations = parsed.relations.filter((r) => r.relationType === 'link' || r.relationType === 'image_reference' || r.relationType === 'include')
    expect(linkRelations).toEqual([])
  })

  it('应该从 HTML comment 中提取 include 指令即使行是注释行', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '<!-- include shared.md -->')
    write(root, 'docs/shared.md', '# shared')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((r) => r.relationType === 'include' && r.sourcePath === 'docs/guide.md' && r.targetPath === 'docs/shared.md')).toBe(true)
  })

  it('应该解析引用式链接并标记为 document 层', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next][next]\n\n[next]: next.md')
    write(root, 'docs/next.md', '# next')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const ref = parsed.relations.find((r) => r.sourcePath === 'docs/guide.md' && r.relationType === 'link' && r.targetPath === 'docs/next.md')
    expect(ref).toBeDefined()
    expect(ref?.layer).toBe('document')
    expect(ref?.source).toBe('regex')
    expect(ref?.completeness).toBe('full')
  })

  it('格式错误的链接应该静默跳过', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', [
      '[Broken',
      '![Missing paren](img.svg',
      '<!-- include -->',
    ].join('\n'))

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((r) => r.relationType === 'image_reference')).toBe(false)
    expect(parsed.relations.some((r) => r.relationType === 'include')).toBe(false)
  })

  it('TS 文件中的 Markdown 链接也应标记为 document 层', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "[Doc](../docs/doc.md)\n[doc]: ../docs/doc.md")
    write(root, 'docs/doc.md', '# doc')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    const link = parsed.relations.find((r) => r.sourcePath === 'src/a.ts' && r.relationType === 'link' && r.targetPath === 'docs/doc.md')
    expect(link).toBeDefined()
    expect(link?.layer).toBe('document')
    expect(link?.source).toBe('regex')
    expect(link?.completeness).toBe('full')
  })

  it('图片引用支持裸相对路径', async () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '![Logo](logo.svg)')
    write(root, 'docs/logo.svg', '<svg/>')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = await parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((r) => r.relationType === 'image_reference' && r.sourcePath === 'docs/guide.md' && r.targetPath === 'docs/logo.svg')).toBe(true)
  })
})
