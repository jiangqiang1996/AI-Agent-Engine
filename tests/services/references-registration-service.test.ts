import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { registerReferences } from '../../src/services/references-registration-service.js'
import type { RuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'
import { toPosixPath } from '../../src/utils/path-utils.js'

const tempRoots: Record<string, string> = {}

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-refs-'))
  tempRoots[root] = root
  return root
}

function createManifest(root: string): RuntimeAssetManifest {
  return {
    repoRoot: root,
    skillsDir: join(root, 'src', 'assets', 'skills'),
    rulesDir: join(root, 'src', 'assets', 'rules'),
    commandsDir: join(root, 'src', 'assets', 'commands'),
    builtinConfigFile: join(root, 'src', 'assets', 'config', 'ae.jsonc'),
    toolsDir: join(root, 'tools'),
    agentsDir: join(root, 'src', 'assets', 'agents'),
    referencesDir: join(root, 'src', 'assets', 'references'),
    runtimeAgentDir: join(root, '.opencode', 'agents', 'ae'),
    runtimePluginDir: join(root, '.opencode', 'plugins'),
    runtimeAgentFiles: [],
  }
}

afterEach(() => {
  for (const root of Object.values(tempRoots)) {
    rmSync(root, { recursive: true, force: true })
  }
  for (const key of Object.keys(tempRoots)) {
    delete tempRoots[key]
  }
})

describe('references-registration-service', () => {
  it('referencesDir 不存在时应该提前返回且不修改 config', () => {
    const root = createRepoRoot()
    const config: Record<string, unknown> = {}

    registerReferences(config, createManifest(root))

    expect(config.references).toBeUndefined()
  })

  it('config.references 为 undefined 时应该正确降级并注册', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'ui-design'), { recursive: true })
    writeFileSync(join(refsDir, 'ui-design', 'ui-design-taste.md'), '# UI 设计品味规范\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs).toBeDefined()
    expect(refs['ui-design']).toBe(toPosixPath(join(refsDir, 'ui-design')))
  })

  it('子目录应该以目录名作为 key 并注册本地路径字符串', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'design-system'), { recursive: true })
    writeFileSync(join(refsDir, 'design-system', 'b-second.md'), '# 第二个文件\n内容')
    writeFileSync(join(refsDir, 'design-system', 'a-first.md'), '# 第一个文件\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs['design-system']).toBe(toPosixPath(join(refsDir, 'design-system')))
  })

  it('已存在的用户 reference key 不应被覆盖', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'ui-design'), { recursive: true })
    writeFileSync(join(refsDir, 'ui-design', 'taste.md'), '# 品味规范\n内容')

    const config: Record<string, unknown> = {
      references: {
        'ui-design': { path: '/user/custom/path', description: '用户自定义' },
      },
    }
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, { path: string; description: string }>
    expect(refs['ui-design'].path).toBe('/user/custom/path')
    expect(refs['ui-design'].description).toBe('用户自定义')
  })

  it('根级 .md 文件应该以文件名（不含扩展名）作为 key', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'style-guide.md'), '# 风格指南\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs['style-guide']).toBe(toPosixPath(join(refsDir, 'style-guide.md')))
  })

  it('已存在的 .md key 不应被覆盖', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'style-guide.md'), '# 风格指南\n内容')

    const config: Record<string, unknown> = {
      references: {
        'style-guide': { path: '/user/custom.md', description: '已有' },
      },
    }
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, { path: string; description: string }>
    expect(refs['style-guide'].path).toBe('/user/custom.md')
    expect(refs['style-guide'].description).toBe('已有')
  })

  it('非 .md 非目录文件应该被忽略', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'readme.txt'), 'text')
    writeFileSync(join(refsDir, 'config.json'), '{}')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    expect(config.references).toBeUndefined()
  })

  it('无可注册条目时不修改 config', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'readme.txt'), 'text')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    expect(config.references).toBeUndefined()
  })

  it('应该同时注册子目录和根级 .md 文件', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'ui-design'), { recursive: true })
    writeFileSync(join(refsDir, 'ui-design', 'taste.md'), '# UI 品味\n内容')
    writeFileSync(join(refsDir, 'global-guide.md'), '# 全局指南\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, unknown>
    expect(Object.keys(refs).sort()).toEqual(['global-guide', 'ui-design'])
  })

  it('无标题的 .md 文件应注册为本地路径字符串', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'notes.md'), '这是一些笔记，没有标题行\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs['notes']).toBe(toPosixPath(join(refsDir, 'notes.md')))
  })

  it('无 .md 文件的子目录应注册为本地路径字符串', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'empty-dir'), { recursive: true })

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs['empty-dir']).toBe(toPosixPath(join(refsDir, 'empty-dir')))
  })

  it('Object.hasOwn 应正确处理原型链属性名（如 toString）', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(refsDir, { recursive: true })
    writeFileSync(join(refsDir, 'toString.md'), '# 转字符串指南\n内容')

    const config: Record<string, unknown> = {}
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, string>
    expect(refs['toString']).toBe(toPosixPath(join(refsDir, 'toString.md')))
  })

  it('应该与已有用户 references 合并而非替换', () => {
    const root = createRepoRoot()
    const refsDir = join(root, 'src', 'assets', 'references')
    mkdirSync(join(refsDir, 'ui-design'), { recursive: true })
    writeFileSync(join(refsDir, 'ui-design', 'taste.md'), '# UI 品味\n内容')

    const config: Record<string, unknown> = {
      references: {
        'user-ref': { path: '/user/path', description: '用户引用' },
      },
    }
    registerReferences(config, createManifest(root))

    const refs = config.references as Record<string, unknown>
    expect(refs['user-ref']).toEqual({ path: '/user/path', description: '用户引用' })
    expect(refs['ui-design']).toBe(toPosixPath(join(refsDir, 'ui-design')))
  })
})
