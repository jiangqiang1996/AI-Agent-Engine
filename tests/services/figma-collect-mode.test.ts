import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runCollectMode } from '../../src/services/figma-collect-mode.js'
import { FigmaAssetError } from '../../src/services/figma-result-formatter.js'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-collect-mode-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('figma-collect-mode', () => {
  it('应该在缺少 manualSourceDir 时抛出 missing_manual_source_dir', async () => {
    await expect(runCollectMode(
      { mode: 'collect', source: '' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      workspace,
      'run-1',
      join(workspace, 'assets'),
    )).rejects.toThrow(FigmaAssetError)

    try {
      await runCollectMode(
        { mode: 'collect', source: '' },
        { fileKey: undefined, nodeId: undefined, redactedSource: '' },
        workspace,
        workspace,
        'run-1',
        join(workspace, 'assets'),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FigmaAssetError)
      expect((error as FigmaAssetError).code).toBe('missing_manual_source_dir')
    }
  })

  it('应该在 manualSourceDir 等于 outputRoot 时抛出 invalid_manual_source_dir', async () => {
    const outputRoot = join(workspace, '.figma')
    await mkdir(outputRoot, { recursive: true })

    await expect(runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: '.figma' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      outputRoot,
      'run-1',
      join(outputRoot, 'runs', 'run-1', 'assets'),
    )).rejects.toThrow(FigmaAssetError)

    try {
      await runCollectMode(
        { mode: 'collect', source: '', manualSourceDir: '.figma' },
        { fileKey: undefined, nodeId: undefined, redactedSource: '' },
        workspace,
        outputRoot,
        'run-1',
        join(outputRoot, 'runs', 'run-1', 'assets'),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FigmaAssetError)
      expect((error as FigmaAssetError).code).toBe('invalid_manual_source_dir')
    }
  })

  it('应该在 manualSourceDir 位于 outputRoot 内部时抛出 invalid_manual_source_dir', async () => {
    const outputRoot = join(workspace, '.figma')
    const innerDir = join(outputRoot, 'inner')
    await mkdir(innerDir, { recursive: true })

    await expect(runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: '.figma/inner' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      outputRoot,
      'run-1',
      join(outputRoot, 'runs', 'run-1', 'assets'),
    )).rejects.toThrow(FigmaAssetError)
  })

  it('应该在目录中无可收集图片时抛出 no_manual_assets', async () => {
    const sourceDir = join(workspace, 'manual')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'notes.txt'), 'skip')
    const outputRoot = join(workspace, '.figma')
    await mkdir(outputRoot, { recursive: true })

    await expect(runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: 'manual' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      outputRoot,
      'run-1',
      join(outputRoot, 'runs', 'run-1', 'assets'),
    )).rejects.toThrow(FigmaAssetError)

    try {
      await runCollectMode(
        { mode: 'collect', source: '', manualSourceDir: 'manual' },
        { fileKey: undefined, nodeId: undefined, redactedSource: '' },
        workspace,
        outputRoot,
        'run-1',
        join(outputRoot, 'runs', 'run-1', 'assets'),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FigmaAssetError)
      expect((error as FigmaAssetError).code).toBe('no_manual_assets')
    }
  })

  it('应该只收集允许的图片扩展名', async () => {
    const sourceDir = join(workspace, 'manual')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'icon.png'), Buffer.from('png'))
    await writeFile(join(sourceDir, 'photo.jpg'), Buffer.from('jpg'))
    await writeFile(join(sourceDir, 'graphic.webp'), Buffer.from('webp'))
    await writeFile(join(sourceDir, 'vector.svg'), Buffer.from('svg'))
    await writeFile(join(sourceDir, 'anim.gif'), Buffer.from('gif'))
    await writeFile(join(sourceDir, 'doc.pdf'), Buffer.from('pdf'))
    await writeFile(join(sourceDir, 'data.json'), Buffer.from('{}'))
    const runAssetsDir = join(workspace, 'run-assets')
    await mkdir(runAssetsDir, { recursive: true })

    const manifest = await runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: 'manual' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      join(workspace, '.figma'),
      'run-1',
      runAssetsDir,
    )

    expect(manifest.mode).toBe('collect')
    expect(manifest.assets).toHaveLength(5)
    const formats = manifest.assets.map((a) => a.format).sort()
    expect(formats).toEqual(['gif', 'jpg', 'png', 'svg', 'webp'])
  })

  it('应该跳过子目录和非文件条目', async () => {
    const sourceDir = join(workspace, 'manual')
    await mkdir(sourceDir, { recursive: true })
    await mkdir(join(sourceDir, 'subdir'), { recursive: true })
    await writeFile(join(sourceDir, 'icon.png'), Buffer.from('png'))
    const runAssetsDir = join(workspace, 'run-assets')
    await mkdir(runAssetsDir, { recursive: true })

    const manifest = await runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: 'manual' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      join(workspace, '.figma'),
      'run-1',
      runAssetsDir,
    )

    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0]?.fileName).toBe('icon.png')
  })

  it('应该使用传入的 runId 和 redactedSource', async () => {
    const sourceDir = join(workspace, 'manual')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'icon.png'), Buffer.from('png'))
    const runAssetsDir = join(workspace, 'run-assets')
    await mkdir(runAssetsDir, { recursive: true })

    const manifest = await runCollectMode(
      { mode: 'collect', source: 'https://user:pass@www.figma.com/file/abc/demo?token=secret', manualSourceDir: 'manual' },
      { fileKey: 'abc', nodeId: undefined, redactedSource: 'https://www.figma.com/file/abc/demo' },
      workspace,
      join(workspace, '.figma'),
      'custom-run-42',
      runAssetsDir,
    )

    expect(manifest.runId).toBe('custom-run-42')
    expect(manifest.source).toMatchObject({
      type: 'figma_url',
      host: 'www.figma.com',
      fileKeyHash: expect.any(String),
      nodeIdHashes: [expect.any(String)],
    })
  })

  it('应该为重复清洗后的文件名生成唯一名称', async () => {
    const sourceDir = join(workspace, 'manual')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'icon 1.png'), Buffer.from('first'))
    await writeFile(join(sourceDir, 'icon_1.png'), Buffer.from('second'))
    const runAssetsDir = join(workspace, 'run-assets')
    await mkdir(runAssetsDir, { recursive: true })

    const manifest = await runCollectMode(
      { mode: 'collect', source: '', manualSourceDir: 'manual' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      join(workspace, '.figma'),
      'run-1',
      runAssetsDir,
    )

    const names = manifest.assets.map((a) => a.fileName).sort()
    expect(names).toEqual(['icon_1-2.png', 'icon_1.png'])
    expect(manifest.assets).toHaveLength(2)
  })
})
