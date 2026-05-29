import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createRuntimeAssetManifest,
  createRuntimeAssetManifestFromRoot,
} from '../../src/services/runtime-asset-manifest.js'

const tempRoots: string[] = []

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-runtime-manifest-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('runtime-asset-manifest', () => {
  it('应该在只有 dist 产物时指向运行时 assets 目录', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(join(root, 'dist', 'src', 'index.js'), 'export {}')

    const manifest = createRuntimeAssetManifest(pathToFileURL(join(root, 'dist', 'src', 'index.js')).href)

    expect(manifest.skillsDir).toBe(join(root, 'dist', 'src', 'assets', 'skills'))
    expect(manifest.rulesDir).toBe(join(root, 'dist', 'src', 'assets', 'rules'))
    expect(manifest.commandsDir).toBe(join(root, 'dist', 'src', 'assets', 'commands'))
    expect(manifest.builtinConfigFile).toBe(join(root, 'dist', 'src', 'assets', 'config', 'ae.jsonc'))
    expect(manifest.agentsDir).toBe(join(root, 'dist', 'src', 'assets', 'agents'))
    expect(manifest.runtimeAgentFiles[0]?.source).toContain(join('dist', 'src', 'assets', 'agents'))
  })

  it('应该在宿主项目桥接安装时定位到插件根目录而非宿主项目', () => {
    const hostRoot = createRepoRoot()
    const pluginRoot = join(hostRoot, '.opencode', 'ai-agent-engine')

    mkdirSync(join(hostRoot, '.opencode', 'plugins'), { recursive: true })
    mkdirSync(join(pluginRoot, 'dist', 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(join(hostRoot, 'opencode.json'), '{}')
    writeFileSync(
      join(hostRoot, '.opencode', 'plugins', 'ae-server.js'),
      "export { default } from '../ai-agent-engine/dist/src/index.js'\n",
    )
    writeFileSync(join(pluginRoot, 'dist', 'src', 'index.js'), 'export {}')

    const manifest = createRuntimeAssetManifest(pathToFileURL(join(pluginRoot, 'dist', 'src', 'index.js')).href)

    expect(manifest.repoRoot).toBe(pluginRoot)
    expect(manifest.repoRoot).not.toBe(hostRoot)
    expect(manifest.skillsDir).toBe(join(pluginRoot, 'dist', 'src', 'assets', 'skills'))
    expect(manifest.agentsDir).toBe(join(pluginRoot, 'dist', 'src', 'assets', 'agents'))
    expect(manifest.builtinConfigFile).toBe(join(pluginRoot, 'dist', 'src', 'assets', 'config', 'ae.jsonc'))
  })

  it('应该在源码模块路径下定位到项目根目录', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(join(root, 'src', 'index.js'), 'export {}')

    const manifest = createRuntimeAssetManifest(pathToFileURL(join(root, 'src', 'index.js')).href)

    expect(manifest.repoRoot).toBe(root)
    expect(manifest.skillsDir).toBe(join(root, 'src', 'assets', 'skills'))
    expect(manifest.agentsDir).toBe(join(root, 'src', 'assets', 'agents'))
  })

  it('应该在显式 repoRoot 下优先使用 dist 产物目录', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets', 'agents', 'review'), { recursive: true })

    const manifest = createRuntimeAssetManifestFromRoot(root)

    expect(manifest.skillsDir).toBe(join(root, 'dist', 'src', 'assets', 'skills'))
    expect(manifest.agentsDir).toBe(join(root, 'dist', 'src', 'assets', 'agents'))
    expect(manifest.builtinConfigFile).toBe(join(root, 'dist', 'src', 'assets', 'config', 'ae.jsonc'))
  })

  it('应该按 agent.path 保留嵌套代理目录结构', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets', 'agents', 'domains', 'review', 'specialists'), { recursive: true })

    const manifest = createRuntimeAssetManifestFromRoot(root)
    const correctnessReviewer = manifest.runtimeAgentFiles.find((file) => file.source.endsWith(
      join('domains', 'review', 'specialists', 'correctness-reviewer.md'),
    ))

    expect(correctnessReviewer?.source).toBe(join(
      root,
      'dist',
      'src',
      'assets',
      'agents',
      'domains',
      'review',
      'specialists',
      'correctness-reviewer.md',
    ))
    expect(correctnessReviewer?.target).toBe(join(
      root,
      '.opencode',
      'agents',
      'ae',
      'domains',
      'review',
      'specialists',
      'correctness-reviewer.md',
    ))
  })
})
