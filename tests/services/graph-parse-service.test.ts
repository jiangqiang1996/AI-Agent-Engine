import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { collectGraphFiles, parseFileRelations } from '../../src/services/graph-parse-service.js'
import { SKILL, TOOL, AGENT, COMMAND } from '../../src/schemas/ae-asset-schema.js'

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
  it('应该解析 TS import、require、Markdown 链接和 AE 引用', () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import x from './b'\nconst y = require('pkg')\n// ae:work")
    write(root, 'src/b.ts', 'export const b = 1')
    write(root, 'README.md', '[A](src/a.ts) /ae-work')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.files.some((file) => file.relativePath === 'src/a.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'import' && relation.targetPath === 'src/b.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'pkg')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'link' && relation.targetPath === 'src/a.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'ae_ref' && relation.targetPath === 'skill:ae:work')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'ae_ref' && relation.targetPath === 'command:/ae-work')).toBe(true)
    expect(parsed.files.some((file) => file.relativePath === 'skill:ae:work' && file.fileType === 'asset')).toBe(true)
  })

  it('应该按排除规则跳过文件', () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', 'import x from "./b"')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: ['src'] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/a.ts'])
  })

  it('应该识别技能、工具、代理和命令引用关系', () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', `${SKILL.GRAPH_BUILD} ${TOOL.AE_GRAPH_QUERY} ${AGENT.ARCHITECTURE_STRATEGIST} ${COMMAND.GRAPH_QUERY}`)

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath === `skill:${SKILL.GRAPH_BUILD}`)).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === `tool:${TOOL.AE_GRAPH_QUERY}`)).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === `agent:${AGENT.ARCHITECTURE_STRATEGIST}`)).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === `command:${COMMAND.GRAPH_QUERY}`)).toBe(true)
  })

  it('应该解析省略扩展名和 index 文件的相对引用', () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', "import b from './b'\nimport c from './feature'")
    write(root, 'src/b.ts', 'export const b = 1')
    write(root, 'src/feature/index.ts', 'export const c = 1')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.targetPath === 'src/b.ts')).toBe(true)
    expect(parsed.relations.some((relation) => relation.targetPath === 'src/feature/index.ts')).toBe(true)
  })

  it('应该按当前文档目录解析 Markdown 相对链接并支持根路径链接', () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next](next.md) [Home](/README.md)')
    write(root, 'docs/next.md', '# next')
    write(root, 'README.md', '# home')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/next.md')).toBe(true)
    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'README.md')).toBe(true)
  })

  it('应该解析 Markdown 引用式链接', () => {
    const root = createTempRoot()
    write(root, 'docs/guide.md', '[Next][next]\n\n[next]: next.md')
    write(root, 'docs/next.md', '# next')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.sourcePath === 'docs/guide.md' && relation.targetPath === 'docs/next.md')).toBe(true)
  })

  it('应该解析 Python、Java 和 Go 导入为外部关系', () => {
    const root = createTempRoot()
    write(root, 'src/app.py', 'import requests\nfrom pathlib import Path')
    write(root, 'src/App.java', 'import java.util.List;')
    write(root, 'src/app.go', 'import "fmt"')

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'requests')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'pathlib')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'java.util.List')).toBe(true)
    expect(parsed.relations.some((relation) => relation.relationType === 'external' && relation.targetPath === 'fmt')).toBe(true)
  })

  it('应该拒绝 target 目录符号链接越界', () => {
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

  it('不应该通过中间目录符号链接解析工作区外引用', () => {
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
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked'))).toBe(false)
  })

  it('不应该通过中间目录符号链接解析工作区内别名引用', () => {
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
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked-src'))).toBe(false)
  })

  it('不应该通过中间目录符号链接解析带扩展名的缺失引用', () => {
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
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('linked-src'))).toBe(false)
  })

  it('不应该把工作区外的真实相对引用记录为内部关系', () => {
    const parent = createTempRoot()
    const root = join(parent, 'repo')
    const outsideDir = join(parent, 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outsideDir, 'outside.ts'), 'export const outside = 1')
    write(root, 'src/a.ts', `import outside from '../../${basename(outsideDir)}/outside'`)

    const files = collectGraphFiles(root, root, { exclude: [] })
    const parsed = parseFileRelations(root, files, { exclude: [] })

    expect(parsed.relations.some((relation) => relation.relationType !== 'external' && relation.targetPath.includes('outside'))).toBe(false)
  })

  it('应该默认跳过敏感文件和图谱运行时目录', () => {
    const root = createTempRoot()
    write(root, '.env', 'TOKEN=secret')
    write(root, 'src/private-key.json', '{}')
    write(root, '.ae/schema.sql', 'select 1')
    write(root, 'docs/ae/graphs/graph.json', '{}')
    write(root, 'src/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: [] })

    expect(files.map((file) => file.relativePath)).toEqual(['src/a.ts'])
  })

  it('未配置时不应该强制跳过常见构建目录', () => {
    const root = createTempRoot()
    write(root, 'dist/a.ts', '')

    const files = collectGraphFiles(root, root, { exclude: [] })

    expect(files.map((file) => file.relativePath)).toEqual(['dist/a.ts'])
  })
})
