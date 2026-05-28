import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { resolvePluginRootFromModuleUrl } from '../../src/utils/path-utils.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-path-utils-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('path-utils', () => {
  it('应该在只有 dist 产物时推断插件根目录', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets'), { recursive: true })
    writeFileSync(join(root, 'dist', 'src', 'index.js'), 'export {}')

    const resolved = resolvePluginRootFromModuleUrl(pathToFileURL(join(root, 'dist', 'src', 'index.js')).href)

    expect(resolved).toBe(root)
  })

  it('应该在桥接文件指向 dist 产物时推断插件根目录', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets'), { recursive: true })
    writeFileSync(join(root, 'dist', 'src', 'index.js'), 'export {}')

    const resolved = resolvePluginRootFromModuleUrl(pathToFileURL(join(root, 'dist', 'src', 'index.js')).href)

    expect(resolved).toBe(root)
  })

  it('不应该把上层项目 opencode.json 当作插件根目录', () => {
    const projectRoot = createTempRoot()
    const pluginRoot = join(projectRoot, '.opencode', 'ai-agent-engine')
    mkdirSync(join(pluginRoot, 'dist', 'src'), { recursive: true })
    writeFileSync(join(projectRoot, 'opencode.json'), '{}')
    writeFileSync(join(pluginRoot, 'dist', 'src', 'index.js'), 'export {}')

    expect(() => resolvePluginRootFromModuleUrl(pathToFileURL(join(pluginRoot, 'dist', 'src', 'index.js')).href))
      .toThrow('无法从模块路径推断仓库根目录')
  })

  it('不应该把隐藏目录外层的 dist assets 当作嵌套插件根目录', () => {
    const projectRoot = createTempRoot()
    const pluginRoot = join(projectRoot, '.opencode', 'ai-agent-engine')
    mkdirSync(join(projectRoot, 'dist', 'src', 'assets'), { recursive: true })
    mkdirSync(join(pluginRoot, 'dist', 'src'), { recursive: true })
    writeFileSync(join(pluginRoot, 'dist', 'src', 'index.js'), 'export {}')

    expect(() => resolvePluginRootFromModuleUrl(pathToFileURL(join(pluginRoot, 'dist', 'src', 'index.js')).href))
      .toThrow('无法从模块路径推断仓库根目录')
  })

  it('应该在源码结构下推断插件根目录', () => {
    const root = createTempRoot()
    mkdirSync(join(root, 'src', 'assets'), { recursive: true })
    writeFileSync(join(root, 'src', 'tui.js'), 'export {}')

    const resolved = resolvePluginRootFromModuleUrl(pathToFileURL(join(root, 'src', 'tui.js')).href)

    expect(resolved).toBe(root)
  })

  it('无法识别插件结构时应该抛出错误', () => {
    expect(() => resolvePluginRootFromModuleUrl('file:///Q:/ae-no-root/index.js')).toThrow(
      '无法从模块路径推断仓库根目录',
    )
  })
})
