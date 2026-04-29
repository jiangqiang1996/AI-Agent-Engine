import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { createRuntimeAssetManifest } from '../../src/services/runtime-asset-manifest.js'

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
  it('应该在运行时指向 dist 中的 assets 目录', () => {
    const root = createRepoRoot()
    mkdirSync(join(root, 'dist', 'src', 'assets', 'agents', 'review'), { recursive: true })
    writeFileSync(join(root, 'opencode.json'), '{}')
    writeFileSync(join(root, 'dist', 'src', 'index.js'), 'export {}')

    const manifest = createRuntimeAssetManifest(pathToFileURL(join(root, 'dist', 'src', 'index.js')).href)

    expect(manifest.skillsDir).toBe(join(root, 'dist', 'src', 'assets', 'skills'))
    expect(manifest.rulesDir).toBe(join(root, 'dist', 'src', 'assets', 'rules'))
    expect(manifest.commandsDir).toBe(join(root, 'dist', 'src', 'assets', 'commands'))
    expect(manifest.builtinConfigFile).toBe(join(root, 'dist', 'src', 'assets', 'config', 'builtin-opencode.jsonc'))
    expect(manifest.agentsDir).toBe(join(root, 'dist', 'src', 'assets', 'agents'))
    expect(manifest.runtimeAgentFiles[0]?.source).toContain(join('dist', 'src', 'assets', 'agents'))
  })
})
